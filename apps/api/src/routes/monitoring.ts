import { and, eq, gte, isNull, lte } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { assets, customers, monitoringAgents, monitoringSamples, ticketPriorities } from "../db/schema.js";
import { requireAdmin } from "../plugins/auth.js";
import { createId } from "../lib/id.js";
import {
  AGENT_PACKAGE_PLATFORMS,
  agentPackageVersionMap,
  commitAgentPackage,
  compareAgentVersions,
  deleteAgentPackage,
  extractAgentVersionFromBinary,
  getAgentPackage,
  isAgentPackagePlatform,
  listAgentPackages,
  packageFilePath,
  platformFromAgent,
  saveAgentPackageUpload,
} from "../lib/agentPackages.js";
import {
  alertedIssues,
  anyAlertEnabled,
  deviceNameFor,
  emptyAlertConfig,
  ensureEnrollmentKey,
  evaluateHeartbeatIssues,
  hashesEqual,
  hashToken,
  hardwareAssetPatch,
  loadAlertConfig,
  mapDeviceSummary,
  mapPendingAgent,
  newAgentToken,
  parseAlertConfig,
  parseIssues,
  parseSnapshot,
  primaryIp,
  rotateEnrollmentKey,
  sampleFromSnapshot,
  serializeAlertConfig,
  serializeDetectedIssues,
  syncAssignedAgentTickets,
  emitMonitoringTicketMails,
  refreshTicketsForAsset,
  type AgentSnapshot,
  findAssignableAssets,
  isAgentOnline,
  purgeMonitoringAgent,
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
  id: z.string().max(160).optional(),
  name: z.string().max(160),
  mount: z.string().max(160).optional(),
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
  platform: z.string().max(40).optional(),
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
  hardware: z
    .object({
      system: z
        .object({
          manufacturer: z.string().max(200).optional(),
          model: z.string().max(200).optional(),
          serial: z.string().max(120).optional(),
          sku: z.string().max(120).optional(),
        })
        .optional(),
      bios: z
        .object({
          vendor: z.string().max(200).optional(),
          version: z.string().max(200).optional(),
          date: z.string().max(40).optional(),
          serial: z.string().max(120).optional(),
        })
        .optional(),
      board: z
        .object({
          manufacturer: z.string().max(200).optional(),
          product: z.string().max(200).optional(),
          serial: z.string().max(120).optional(),
        })
        .optional(),
      cpus: z
        .array(
          z.object({
            name: z.string().max(200).optional(),
            cores: z.number().int().nonnegative().optional(),
            threads: z.number().int().nonnegative().optional(),
            mhz: z.number().nonnegative().optional(),
            socket: z.string().max(80).optional(),
          }),
        )
        .max(8)
        .optional(),
      memoryModules: z
        .array(
          z.object({
            slot: z.string().max(80).optional(),
            sizeBytes: z.number().nonnegative().optional(),
            speedMhz: z.number().nonnegative().optional(),
            manufacturer: z.string().max(120).optional(),
            partNumber: z.string().max(120).optional(),
            serial: z.string().max(120).optional(),
            type: z.string().max(40).optional(),
          }),
        )
        .max(24)
        .optional(),
      storage: z
        .array(
          z.object({
            name: z.string().max(200).optional(),
            model: z.string().max(200).optional(),
            serial: z.string().max(120).optional(),
            sizeBytes: z.number().nonnegative().optional(),
            bus: z.string().max(40).optional(),
            media: z.string().max(40).optional(),
          }),
        )
        .max(16)
        .optional(),
      gpus: z
        .array(
          z.object({
            name: z.string().max(200).optional(),
            driver: z.string().max(80).optional(),
            vramBytes: z.number().nonnegative().optional(),
          }),
        )
        .max(8)
        .optional(),
      nics: z
        .array(
          z.object({
            name: z.string().max(200).optional(),
            mac: z.string().max(80).optional(),
            manufacturer: z.string().max(120).optional(),
            speedMbps: z.number().nonnegative().optional(),
          }),
        )
        .max(16)
        .optional(),
    })
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

function enrollmentKeyFromRequest(request: FastifyRequest): string | null {
  const q = request.query as { key?: string };
  if (typeof q?.key === "string" && q.key.trim()) return q.key.trim();
  const header = request.headers["x-enrollment-key"];
  if (typeof header === "string" && header.trim()) return header.trim();
  return null;
}

function isStaffSession(request: FastifyRequest): boolean {
  const userId = request.session.get("userId");
  if (!userId) return false;
  return request.session.get("role") !== "customer";
}

/**
 * Download der Agent-Binary: Staff, Enrollment-Key oder Geräte-Token.
 */
async function authorizeAgentBinaryAccess(request: FastifyRequest, db: Db): Promise<boolean> {
  if (isStaffSession(request)) return true;
  const key = enrollmentKeyFromRequest(request);
  if (key) {
    const expected = await ensureEnrollmentKey(db);
    if (hashesEqual(hashToken(expected), hashToken(key))) return true;
  }
  const token = bearerToken(request.headers.authorization);
  if (!token) return false;
  const agent = await db
    .select({ id: monitoringAgents.id })
    .from(monitoringAgents)
    .where(eq(monitoringAgents.tokenHash, hashToken(token)))
    .get();
  return Boolean(agent);
}

function packagePlatformParam(value: string | undefined) {
  const platform = (value ?? "").trim().toLowerCase();
  return isAgentPackagePlatform(platform) ? platform : null;
}

/**
 * Agent-Ingest (Enrollment/Heartbeat) und Staff-Monitoring-API.
 */
export async function monitoringRoutes(app: FastifyInstance, db: Db, uploadDir: string) {
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
      openTicketsJson: "{}",
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
    const reportedVersion = snapshot.agentVersion?.trim() || agent.agentVersion || "";
    const canRemoteUninstall = compareAgentVersions(reportedVersion || "0", "1.0.4") >= 0;
    if (agent.uninstallRequestedAt && canRemoteUninstall) {
      await purgeMonitoringAgent(db, agent);
      return { ok: true, assigned: Boolean(agent.assetId), updateNow: false, uninstall: true, latestAgent: null };
    }

    const now = new Date();
    const config = await loadAlertConfig(db, agent.assetId);
    const evald = evaluateHeartbeatIssues(snapshot, agent, config);
    const issues = evald.issues;
    const name = await deviceNameFor(db, agent);
    const ticketSync = agent.assetId
      ? await syncAssignedAgentTickets(db, agent, issues, config, name, evald.firingDisks, now)
      : { openTickets: {}, opened: [], closed: [] };

    await db.insert(monitoringSamples).values(sampleFromSnapshot(snapshot, agent.id, now));

    const ip = primaryIp(snapshot);
    const platform = platformFromAgent({
      platform: snapshot.platform,
      os: snapshot.os,
      arch: snapshot.arch,
    });
    const pkg = platform ? await getAgentPackage(db, platform) : undefined;
    const latestAgent = pkg
      ? { platform: pkg.platform, version: pkg.version, sha256: pkg.sha256 }
      : null;
    const versionCurrent = Boolean(
      latestAgent && reportedVersion && compareAgentVersions(reportedVersion, latestAgent.version) >= 0,
    );
    const updateNow = Boolean(
      latestAgent &&
        (agent.updateRequestedAt || agent.uninstallRequestedAt) &&
        !versionCurrent,
    );

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
        currentIssuesJson: serializeDetectedIssues(issues, evald.firingDisks.map((d) => d.id)),
        cpuHighStreak: evald.cpuHighStreak,
        ramHighStreak: evald.ramHighStreak,
        updateRequestedAt: versionCurrent && !agent.uninstallRequestedAt ? null : agent.updateRequestedAt,
        updatedAt: now,
      })
      .where(eq(monitoringAgents.id, agent.id));

    if (agent.assetId) {
      const asset = await db.select().from(assets).where(eq(assets.id, agent.assetId)).get();
      if (asset) {
        const patch: Partial<typeof asset> = { updatedAt: now };
        Object.assign(patch, hardwareAssetPatch(asset, snapshot, ip));
        if (Object.keys(patch).length > 1) {
          await db.update(assets).set(patch).where(eq(assets.id, asset.id));
        }
      }
    }

    await emitMonitoringTicketMails(db, ticketSync);

    return { ok: true, assigned: Boolean(agent.assetId), updateNow, uninstall: Boolean(agent.uninstallRequestedAt), latestAgent };
  });

  app.get("/api/monitoring/agent/latest", async (request, reply) => {
    if (!(await authorizeAgentBinaryAccess(request, db))) {
      return reply.code(401).send({ error: "Nicht berechtigt" });
    }
    const q = request.query as { platform?: string; os?: string; arch?: string };
    const platform =
      packagePlatformParam(q.platform) ??
      platformFromAgent({ os: q.os, arch: q.arch });
    if (!platform) {
      return reply.code(400).send({ error: "Plattform fehlt oder unbekannt" });
    }
    const pkg = await getAgentPackage(db, platform);
    if (!pkg) return reply.code(404).send({ error: "Kein Agent-Paket für diese Plattform" });
    return {
      platform: pkg.platform,
      version: pkg.version,
      sha256: pkg.sha256,
      sizeBytes: pkg.sizeBytes,
      filename: pkg.filename,
    };
  });

  app.get("/api/monitoring/agent/download/:platform", async (request, reply) => {
    if (!(await authorizeAgentBinaryAccess(request, db))) {
      return reply.code(401).send({ error: "Nicht berechtigt" });
    }
    const platform = packagePlatformParam((request.params as { platform: string }).platform);
    if (!platform) return reply.code(400).send({ error: "Unbekannte Plattform" });
    const pkg = await getAgentPackage(db, platform);
    if (!pkg) return reply.code(404).send({ error: "Kein Agent-Paket für diese Plattform" });
    const filePath = packageFilePath(uploadDir, pkg.storedName);
    if (!existsSync(filePath)) {
      return reply.code(404).send({ error: "Paketdatei fehlt auf dem Server" });
    }
    const size = statSync(filePath).size;
    return reply
      .header("Content-Type", "application/octet-stream")
      .header("Content-Length", String(size))
      .header("Cache-Control", "no-store")
      .header("Content-Disposition", `attachment; filename="${pkg.filename.replace(/"/g, "")}"`)
      .header("X-Agent-Version", pkg.version)
      .header("X-Agent-SHA256", pkg.sha256)
      .send(createReadStream(filePath));
  });

  await app.register(async (scoped) => {
    scoped.addHook("preHandler", requireAdmin);

    scoped.get("/api/monitoring/settings", async () => {
      const key = await ensureEnrollmentKey(db);
      const packages = await listAgentPackages(db);
      return { enrollmentKey: key, platforms: AGENT_PACKAGE_PLATFORMS, packages };
    });

    scoped.post("/api/monitoring/settings/rotate-key", async () => {
      const key = await rotateEnrollmentKey(db);
      const packages = await listAgentPackages(db);
      return { enrollmentKey: key, platforms: AGENT_PACKAGE_PLATFORMS, packages };
    });

    scoped.post("/api/monitoring/agent-packages", async (request, reply) => {
      let uploaded;
      let fields: Record<string, string>;
      try {
        ({ uploaded, fields } = await saveAgentPackageUpload(request, uploadDir));
      } catch (err) {
        if (err instanceof Error && err.message === "UPLOAD_ABORTED") {
          return reply.code(413).send({ error: "Datei zu groß" });
        }
        throw err;
      }
      if (!uploaded) return reply.code(400).send({ error: "Keine Datei" });
      const platformRaw = (fields.platform ?? "").trim().toLowerCase();
      if (!isAgentPackagePlatform(platformRaw)) {
        const { unlink } = await import("node:fs/promises");
        await unlink(uploaded.tmpPath).catch(() => undefined);
        return reply.code(400).send({ error: "Unbekannte Plattform" });
      }
      const detected = extractAgentVersionFromBinary(await readFile(uploaded.tmpPath));
      let version = (fields.version ?? "").trim();
      if (detected) {
        if (version && version !== detected) {
          await unlink(uploaded.tmpPath).catch(() => undefined);
          return reply.code(400).send({
            error: `Die Datei ist Agent ${detected}, nicht ${version}. Bitte das GitHub-Artefakt mit der Versionsnummer im Dateinamen hochladen.`,
          });
        }
        version = detected;
      }
      if (!/^[0-9A-Za-z][0-9A-Za-z.+_-]{0,39}$/.test(version)) {
        await unlink(uploaded.tmpPath).catch(() => undefined);
        return reply.code(400).send({ error: "Version fehlt oder ungültig (z. B. 1.0.5)" });
      }
      try {
        const pkg = await commitAgentPackage(db, uploadDir, {
          platform: platformRaw,
          version,
          uploaded,
        });
        return reply.code(201).send(pkg);
      } catch (err) {
        const { unlink } = await import("node:fs/promises");
        await unlink(uploaded.tmpPath).catch(() => undefined);
        request.log.error(err);
        return reply.code(500).send({
          error: err instanceof Error ? err.message : "Paket konnte nicht gespeichert werden",
        });
      }
    });

    scoped.delete("/api/monitoring/agent-packages/:platform", async (request, reply) => {
      const platform = packagePlatformParam((request.params as { platform: string }).platform);
      if (!platform) return reply.code(400).send({ error: "Unbekannte Plattform" });
      const ok = await deleteAgentPackage(db, uploadDir, platform);
      if (!ok) return reply.code(404).send({ error: "Kein Paket für diese Plattform" });
      return { ok: true };
    });

    scoped.post("/api/monitoring/agents/:id/uninstall", async (request, reply) => {
      const { id } = request.params as { id: string };
      const agent = await db.select().from(monitoringAgents).where(eq(monitoringAgents.id, id)).get();
      if (!agent) return reply.code(404).send({ error: "Agent nicht gefunden" });
      const now = new Date();
      await db
        .update(monitoringAgents)
        .set({
          uninstallRequestedAt: agent.uninstallRequestedAt ?? now,
          updateRequestedAt: agent.updateRequestedAt ?? now,
          updatedAt: now,
        })
        .where(eq(monitoringAgents.id, agent.id));
      return { ok: true, uninstallRequested: true };
    });

    scoped.delete("/api/monitoring/agents/:id", async (request, reply) => {
      const { id } = request.params as { id: string };
      const agent = await db.select().from(monitoringAgents).where(eq(monitoringAgents.id, id)).get();
      if (!agent) return reply.code(404).send({ error: "Agent nicht gefunden" });
      await purgeMonitoringAgent(db, agent);
      return { ok: true };
    });

    scoped.post("/api/monitoring/devices/:assetId/update-agent", async (request, reply) => {
      const { assetId } = request.params as { assetId: string };
      const agent = await db
        .select()
        .from(monitoringAgents)
        .where(eq(monitoringAgents.assetId, assetId))
        .get();
      if (!agent) return reply.code(404).send({ error: "Kein Agent zugeordnet" });
      const snap = parseSnapshot(agent.lastSnapshotJson);
      const platform = platformFromAgent({
        platform: snap?.platform,
        os: snap?.os ?? agent.os,
        arch: snap?.arch,
      });
      if (!platform) {
        return reply.code(409).send({ error: "Plattform des Geräts unbekannt" });
      }
      const pkg = await getAgentPackage(db, platform);
      if (!pkg) {
        return reply.code(409).send({ error: "Kein Agent-Paket für diese Plattform hochgeladen" });
      }
      const now = new Date();
      await db
        .update(monitoringAgents)
        .set({ updateRequestedAt: now, updatedAt: now })
        .where(eq(monitoringAgents.id, agent.id));
      return {
        ok: true,
        platform,
        latestVersion: pkg.version,
        currentVersion: agent.agentVersion,
      };
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
        const config = parseAlertConfig(asset);
        const detected = parseIssues(agent.currentIssuesJson);
        if (!isAgentOnline(agent.lastSeenAt, now) && !detected.includes("offline")) {
          detected.unshift("offline");
        }
        if (alertedIssues(detected, config).length > 0) warningCount += 1;
      }
      return { warningCount, pendingCount };
    });

    scoped.get("/api/monitoring/overview", async () => {
      const now = new Date();
      const packages = await agentPackageVersionMap(db);
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
          packages,
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
          uninstallRequestedAt: null,
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
      const packages = await agentPackageVersionMap(db);
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
          await mapDeviceSummary(
            db,
            agent,
            assetMap.get(agent.assetId),
            customerLabel(customer),
            now,
            packages,
          ),
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
      const packages = await agentPackageVersionMap(db);
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
        device: await mapDeviceSummary(
          db,
          agent,
          asset,
          customer ? customerLabel(customer) : null,
          now,
          packages,
        ),
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
      const kindAlertZ = z.object({
        enabled: z.boolean(),
        priority: z.enum(ticketPriorities),
      });
      const diskAlertZ = kindAlertZ.extend({
        warnUsedPct: z.number().min(1).max(99).optional(),
        volumes: z
          .record(
            z.string().min(1).max(160),
            z.object({
              enabled: z.boolean().optional(),
              warnUsedPct: z.number().min(1).max(99).optional(),
            }),
          )
          .optional(),
      });
      const parsed = z
        .object({
          monitoringEnabled: z.boolean().optional(),
          monitoringAlertEnabled: z.boolean().optional(),
          monitoringAlerts: z
            .object({
              offline: kindAlertZ,
              disk: diskAlertZ,
              cpu: kindAlertZ,
              ram: kindAlertZ,
              eventlog: kindAlertZ,
              updates: kindAlertZ,
            })
            .optional(),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Ungültige Eingabe" });
      }
      const asset = await db.select().from(assets).where(eq(assets.id, assetId)).get();
      if (!asset) return reply.code(404).send({ error: "Inventar-Eintrag nicht gefunden" });

      let config = parseAlertConfig(asset);
      if (parsed.data.monitoringAlerts) {
        config = parseAlertConfig({
          monitoringAlertEnabled: false,
          monitoringAlertsJson: JSON.stringify(parsed.data.monitoringAlerts),
        });
      } else if (parsed.data.monitoringAlertEnabled !== undefined) {
        config = emptyAlertConfig(parsed.data.monitoringAlertEnabled);
      }
      const alertEnabled = anyAlertEnabled(config);
      const updated = {
        monitoringEnabled:
          parsed.data.monitoringEnabled ?? (alertEnabled ? true : asset.monitoringEnabled),
        monitoringAlertEnabled: alertEnabled,
        monitoringAlertsJson: serializeAlertConfig(config),
        updatedAt: new Date(),
      };
      await db.update(assets).set(updated).where(eq(assets.id, assetId));
      await refreshTicketsForAsset(db, assetId);
      return { ...asset, ...updated, monitoringAlerts: config };
    });
  });
}

const MONITORING_DEFAULT_RANGE_MS = 24 * 60 * 60 * 1000;
