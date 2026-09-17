import { and, eq, gte, isNull, lte } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { assets, customers, monitoringAgents, monitoringSamples } from "../db/schema.js";
import { requireAdmin } from "../plugins/auth.js";
import { createId } from "../lib/id.js";
import {
  deviceNameFor,
  ensureEnrollmentKey,
  evaluateHeartbeatIssues,
  hashesEqual,
  hashToken,
  loadAlertFlag,
  mapDeviceSummary,
  mapPendingAgent,
  newAgentToken,
  parseIssues,
  parseSnapshot,
  primaryIp,
  rotateEnrollmentKey,
  sampleFromSnapshot,
  serializeIssues,
  syncMonitoringTicket,
  type AgentSnapshot,
  findAssignableAssets,
  isAgentOnline,
} from "../lib/monitoring.js";

const enrollBody = z.object({
  enrollmentKey: z.string().min(8).max(200),
  machineId: z.string().min(4).max(200),
  hostname: z.string().max(200).optional(),
  os: z.string().max(80).optional(),
  osVersion: z.string().max(120).optional(),
  ip: z.string().max(80).optional(),
  agentVersion: z.string().max(40).optional(),
});

const diskSchema = z.object({
  name: z.string().max(80),
  totalBytes: z.number().nonnegative(),
  usedBytes: z.number().nonnegative(),
  freeBytes: z.number().nonnegative(),
});

const heartbeatBody = z.object({
  hostname: z.string().max(200).optional(),
  os: z.string().max(80).optional(),
  osVersion: z.string().max(120).optional(),
  arch: z.string().max(40).optional(),
  uptimeSec: z.number().nonnegative().optional(),
  agentVersion: z.string().max(40).optional(),
  ip: z.string().max(80).optional(),
  ips: z.array(z.string().max(80)).max(16).optional(),
  mac: z.string().max(80).optional(),
  cpuPercent: z.number().min(0).max(100).nullable().optional(),
  ramUsedBytes: z.number().nonnegative().nullable().optional(),
  ramTotalBytes: z.number().nonnegative().nullable().optional(),
  disks: z.array(diskSchema).max(32).optional(),
  nics: z
    .array(
      z.object({
        name: z.string().max(80),
        bytesRecv: z.number().nonnegative(),
        bytesSent: z.number().nonnegative(),
        up: z.boolean().optional(),
      }),
    )
    .max(16)
    .optional(),
  processes: z
    .array(
      z.object({
        name: z.string().max(200),
        cpuPercent: z.number().optional(),
        rssBytes: z.number().nonnegative().optional(),
      }),
    )
    .max(20)
    .optional(),
  updates: z
    .object({
      pendingCount: z.number().int().nonnegative().optional(),
      lastInstalled: z.string().max(80).nullable().optional(),
    })
    .optional(),
  events: z
    .array(
      z.object({
        source: z.string().max(120).optional(),
        level: z.string().max(40).optional(),
        time: z.string().max(80).optional(),
        message: z.string().max(2000),
      }),
    )
    .max(30)
    .optional(),
});

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m?.[1]?.trim() || null;
}

function customerLabel(c: { company: string | null; name: string } | undefined): string {
  if (!c) return "Kunde";
  return c.company?.trim() || c.name;
}

/**
 * Agent-Ingest (Enrollment/Heartbeat) und Staff-Monitoring-API.
 */
export async function monitoringRoutes(app: FastifyInstance, db: Db) {
  app.post("/api/monitoring/enroll", async (request, reply) => {
    const parsed = enrollBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }
    const expected = await ensureEnrollmentKey(db);
    const got = parsed.data.enrollmentKey.trim();
    if (!hashesEqual(hashToken(expected), hashToken(got))) {
      return reply.code(401).send({ error: "Ungültiger Enrollment-Key" });
    }

    const now = new Date();
    const token = newAgentToken();
    const tokenHash = hashToken(token);
    const machineId = parsed.data.machineId.trim();
    const existing = await db
      .select()
      .from(monitoringAgents)
      .where(eq(monitoringAgents.machineId, machineId))
      .get();

    if (existing) {
      await db
        .update(monitoringAgents)
        .set({
          tokenHash,
          hostname: parsed.data.hostname?.trim() || existing.hostname,
          os: parsed.data.os?.trim() || existing.os,
          osVersion: parsed.data.osVersion?.trim() || existing.osVersion,
          ipAddress: parsed.data.ip?.trim() || existing.ipAddress,
          agentVersion: parsed.data.agentVersion?.trim() || existing.agentVersion,
          lastSeenAt: now,
          updatedAt: now,
        })
        .where(eq(monitoringAgents.id, existing.id));
      return {
        agentId: existing.id,
        token,
        assigned: Boolean(existing.assetId),
        assetId: existing.assetId,
      };
    }

    const id = createId("magt");
    await db.insert(monitoringAgents).values({
      id,
      machineId,
      tokenHash,
      assetId: null,
      customerId: null,
      hostname: parsed.data.hostname?.trim() || null,
      os: parsed.data.os?.trim() || null,
      osVersion: parsed.data.osVersion?.trim() || null,
      ipAddress: parsed.data.ip?.trim() || null,
      agentVersion: parsed.data.agentVersion?.trim() || null,
      lastSeenAt: now,
      lastSnapshotJson: null,
      currentIssuesJson: "[]",
      openTicketId: null,
      cpuHighStreak: 0,
      ramHighStreak: 0,
      createdAt: now,
      updatedAt: now,
    });
    return reply.code(201).send({ agentId: id, token, assigned: false, assetId: null });
  });

  app.post("/api/monitoring/heartbeat", async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    if (!token) return reply.code(401).send({ error: "Token fehlt" });
    const tokenHash = hashToken(token);
    const agent = await db
      .select()
      .from(monitoringAgents)
      .where(eq(monitoringAgents.tokenHash, tokenHash))
      .get();
    if (!agent) return reply.code(401).send({ error: "Ungültiges Token" });

    const parsed = heartbeatBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Ungültige Eingabe", details: parsed.error.flatten() });
    }

    const snapshot = parsed.data as AgentSnapshot;
    const now = new Date();
    const evald = evaluateHeartbeatIssues(snapshot, agent);
    const issues = evald.issues;
    const alertEnabled = await loadAlertFlag(db, agent.assetId);
    const name = await deviceNameFor(db, agent);
    const openTicketId = agent.assetId
      ? await syncMonitoringTicket(db, { ...agent, lastSeenAt: now }, issues, alertEnabled, name)
      : agent.openTicketId;

    await db.insert(monitoringSamples).values(sampleFromSnapshot(snapshot, agent.id, now));

    const ip = primaryIp(snapshot);
    await db
      .update(monitoringAgents)
      .set({
        hostname: snapshot.hostname?.trim() || agent.hostname,
        os: snapshot.os?.trim() || agent.os,
        osVersion: snapshot.osVersion?.trim() || agent.osVersion,
        ipAddress: ip || agent.ipAddress,
        agentVersion: snapshot.agentVersion?.trim() || agent.agentVersion,
        lastSeenAt: now,
        lastSnapshotJson: JSON.stringify(snapshot),
        currentIssuesJson: serializeIssues(issues),
        openTicketId,
        cpuHighStreak: evald.cpuHighStreak,
        ramHighStreak: evald.ramHighStreak,
        updatedAt: now,
      })
      .where(eq(monitoringAgents.id, agent.id));

    if (agent.assetId) {
      const asset = await db.select().from(assets).where(eq(assets.id, agent.assetId)).get();
      if (asset) {
        const patch: Partial<typeof asset> = { updatedAt: now };
        if (!asset.hostname && snapshot.hostname) patch.hostname = snapshot.hostname.trim();
        if (!asset.ipAddress && ip) patch.ipAddress = ip;
        if (!asset.os && (snapshot.os || snapshot.osVersion)) {
          patch.os = [snapshot.os, snapshot.osVersion].filter(Boolean).join(" ");
        }
        if (Object.keys(patch).length > 1) {
          await db.update(assets).set(patch).where(eq(assets.id, asset.id));
        }
      }
    }

    return { ok: true, assigned: Boolean(agent.assetId) };
  });

  await app.register(async (scoped) => {
    scoped.addHook("preHandler", requireAdmin);

    scoped.get("/api/monitoring/settings", async () => {
      const key = await ensureEnrollmentKey(db);
      return { enrollmentKey: key };
    });

    scoped.post("/api/monitoring/settings/rotate-key", async () => {
      const key = await rotateEnrollmentKey(db);
      return { enrollmentKey: key };
    });

    scoped.get("/api/monitoring/stats", async () => {
      const now = new Date();
      const agents = await db.select().from(monitoringAgents).all();
      const assetRows = await db.select().from(assets).all();
      const assetMap = new Map(assetRows.map((a) => [a.id, a]));
      let warningCount = 0;
      let pendingCount = 0;
      for (const agent of agents) {
        if (!agent.assetId) {
          pendingCount += 1;
          continue;
        }
        const asset = assetMap.get(agent.assetId);
        if (!asset?.monitoringAlertEnabled) continue;
        const issues = parseIssues(agent.currentIssuesJson);
        const online = isAgentOnline(agent.lastSeenAt, now);
        if (!online || issues.some((k) => k !== "offline")) warningCount += 1;
      }
      return { warningCount, pendingCount };
    });

    scoped.get("/api/monitoring/overview", async () => {
      const now = new Date();
      const agents = await db.select().from(monitoringAgents).all();
      const assetRows = await db.select().from(assets).all();
      const customerRows = await db.select().from(customers).all();
      const assetMap = new Map(assetRows.map((a) => [a.id, a]));
      const customerMap = new Map(customerRows.map((c) => [c.id, c]));

      let online = 0;
      let offline = 0;
      let warning = 0;
      let pending = 0;
      const problems: Awaited<ReturnType<typeof mapDeviceSummary>>[] = [];
      const byCustomer = new Map<
        string,
        { customerId: string; customerName: string; online: number; offline: number; warning: number }
      >();

      for (const agent of agents) {
        if (!agent.assetId) {
          pending += 1;
          continue;
        }
        const asset = assetMap.get(agent.assetId);
        const customer = agent.customerId ? customerMap.get(agent.customerId) : undefined;
        const summary = await mapDeviceSummary(
          db,
          agent,
          asset,
          customer ? customerLabel(customer) : null,
          now,
        );
        if (summary.online) online += 1;
        else offline += 1;
        if (summary.warning) {
          warning += 1;
          problems.push(summary);
        }
        if (agent.customerId) {
          const bucket = byCustomer.get(agent.customerId) ?? {
            customerId: agent.customerId,
            customerName: customer ? customerLabel(customer) : "Kunde",
            online: 0,
            offline: 0,
            warning: 0,
          };
          if (summary.online) bucket.online += 1;
          else bucket.offline += 1;
          if (summary.warning) bucket.warning += 1;
          byCustomer.set(agent.customerId, bucket);
        }
      }

      const customersWithDevices = [...byCustomer.values()].sort((a, b) =>
        a.customerName.localeCompare(b.customerName, "de"),
      );

      return {
        online,
        offline,
        warning,
        pending,
        assigned: online + offline,
        problems,
        byCustomer: customersWithDevices,
        customers: customerRows
          .filter((c) => c.kind === "customer")
          .map((c) => ({ id: c.id, name: customerLabel(c) }))
          .sort((a, b) => a.name.localeCompare(b.name, "de")),
      };
    });

    scoped.get("/api/monitoring/pending", async () => {
      const pending = await db
        .select()
        .from(monitoringAgents)
        .where(isNull(monitoringAgents.assetId))
        .all();
      const assignable = await findAssignableAssets(db);
      return { agents: pending.map(mapPendingAgent), assets: assignable };
    });

    scoped.post("/api/monitoring/pending/:id/assign", async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = z.object({ assetId: z.string().min(1) }).safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "Inventar-Eintrag fehlt" });
      }
      const agent = await db.select().from(monitoringAgents).where(eq(monitoringAgents.id, id)).get();
      if (!agent) return reply.code(404).send({ error: "Agent nicht gefunden" });
      if (agent.assetId) return reply.code(409).send({ error: "Agent ist bereits zugeordnet" });

      const asset = await db.select().from(assets).where(eq(assets.id, body.data.assetId)).get();
      if (!asset) return reply.code(404).send({ error: "Inventar-Eintrag nicht gefunden" });
      if (!asset.monitoringEnabled) {
        return reply.code(400).send({ error: "Monitoring ist für dieses Inventar nicht aktiviert" });
      }
      const occupied = await db
        .select()
        .from(monitoringAgents)
        .where(eq(monitoringAgents.assetId, asset.id))
        .get();
      if (occupied) return reply.code(409).send({ error: "Dieses Inventar hat bereits einen Agenten" });

      const now = new Date();
      await db
        .update(monitoringAgents)
        .set({
          assetId: asset.id,
          customerId: asset.customerId,
          updatedAt: now,
        })
        .where(eq(monitoringAgents.id, agent.id));

      const patch: Partial<typeof asset> = { updatedAt: now };
      if (!asset.hostname && agent.hostname) patch.hostname = agent.hostname;
      if (!asset.ipAddress && agent.ipAddress) patch.ipAddress = agent.ipAddress;
      if (!asset.os && agent.os) patch.os = [agent.os, agent.osVersion].filter(Boolean).join(" ");
      if (Object.keys(patch).length > 1) {
        await db.update(assets).set(patch).where(eq(assets.id, asset.id));
      }

      return { ok: true, assetId: asset.id, customerId: asset.customerId };
    });

    scoped.get("/api/monitoring/customers/:customerId", async (request, reply) => {
      const { customerId } = request.params as { customerId: string };
      const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
      if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });
      const now = new Date();
      const agents = await db
        .select()
        .from(monitoringAgents)
        .where(eq(monitoringAgents.customerId, customerId))
        .all();
      const assetRows = await db.select().from(assets).where(eq(assets.customerId, customerId)).all();
      const assetMap = new Map(assetRows.map((a) => [a.id, a]));
      const devices = [];
      for (const agent of agents) {
        if (!agent.assetId) continue;
        devices.push(
          await mapDeviceSummary(db, agent, assetMap.get(agent.assetId), customerLabel(customer), now),
        );
      }
      const enabledWithoutAgent = assetRows.filter(
        (a) => a.monitoringEnabled && !agents.some((ag) => ag.assetId === a.id),
      );
      return {
        customerId: customer.id,
        customerName: customerLabel(customer),
        devices,
        waitingAssets: enabledWithoutAgent.map((a) => ({
          id: a.id,
          name: a.name,
          hostname: a.hostname,
        })),
      };
    });

    scoped.get("/api/monitoring/devices/:assetId", async (request, reply) => {
      const { assetId } = request.params as { assetId: string };
      const q = z
        .object({
          from: z.coerce.number().optional(),
          to: z.coerce.number().optional(),
        })
        .parse(request.query);

      const asset = await db.select().from(assets).where(eq(assets.id, assetId)).get();
      if (!asset) return reply.code(404).send({ error: "Inventar-Eintrag nicht gefunden" });
      const agent = await db
        .select()
        .from(monitoringAgents)
        .where(eq(monitoringAgents.assetId, assetId))
        .get();
      if (!agent) return reply.code(404).send({ error: "Kein Agent zugeordnet" });

      const customer = await db.select().from(customers).where(eq(customers.id, asset.customerId)).get();
      const now = new Date();
      const to = q.to ? new Date(q.to) : now;
      const from = q.from ? new Date(q.from) : new Date(now.getTime() - MONITORING_DEFAULT_RANGE_MS);

      const samples = await db
        .select()
        .from(monitoringSamples)
        .where(
          and(
            eq(monitoringSamples.agentId, agent.id),
            gte(monitoringSamples.ts, from),
            lte(monitoringSamples.ts, to),
          ),
        )
        .all();

      samples.sort((a, b) => a.ts.getTime() - b.ts.getTime());

      return {
        device: await mapDeviceSummary(db, agent, asset, customer ? customerLabel(customer) : null, now),
        snapshot: parseSnapshot(agent.lastSnapshotJson),
        samples: samples.map((s) => ({
          ts: s.ts,
          cpuPct: s.cpuPct,
          ramPct: s.ramPct,
          diskUsedPct: s.diskUsedPct,
          netRxBytes: s.netRxBytes,
          netTxBytes: s.netTxBytes,
        })),
      };
    });

    scoped.patch("/api/monitoring/devices/:assetId", async (request, reply) => {
      const { assetId } = request.params as { assetId: string };
      const parsed = z
        .object({
          monitoringEnabled: z.boolean().optional(),
          monitoringAlertEnabled: z.boolean().optional(),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Ungültige Eingabe" });
      }
      const asset = await db.select().from(assets).where(eq(assets.id, assetId)).get();
      if (!asset) return reply.code(404).send({ error: "Inventar-Eintrag nicht gefunden" });
      const updated = {
        monitoringEnabled: parsed.data.monitoringEnabled ?? asset.monitoringEnabled,
        monitoringAlertEnabled: parsed.data.monitoringAlertEnabled ?? asset.monitoringAlertEnabled,
        updatedAt: new Date(),
      };
      await db.update(assets).set(updated).where(eq(assets.id, assetId));
      return { ...asset, ...updated };
    });
  });
}

const MONITORING_DEFAULT_RANGE_MS = 24 * 60 * 60 * 1000;
