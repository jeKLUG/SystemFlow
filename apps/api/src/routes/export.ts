import archiver from "archiver";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type { Db } from "../db/index.js";
import {
  activities,
  appointments,
  assets,
  attachments,
  contracts,
  customers,
  documents,
  projects,
  tasks,
  timeEntries,
  vaultEntries,
} from "../db/schema.js";
import { tiptapToText } from "../lib/tiptap-text.js";
import {
  buildVisitPdf,
  buildVisitReminders,
  buildVisitVaultHints,
} from "../lib/visit-pdf.js";
import { requireAuth } from "../plugins/auth.js";

function pdfFilename(base: string): string {
  const safe = base.replace(/[^\w\-äöüÄÖÜß]+/gi, "_").replace(/_+/g, "_").slice(0, 80);
  return `${safe || "Besuch"}.pdf`;
}

/**
 * Registriert Kunden-Export als ZIP und Besuchsblatt-PDF.
 */
export async function exportRoutes(
  app: FastifyInstance,
  db: Db,
  uploadDir: string,
) {
  app.addHook("preHandler", requireAuth);

  /**
   * Besuchsblatt (PDF): Kontakt, Anlagen, letzte Einsätze, Reminder, Vault-Hinweise (ohne Secrets),
   * offene Aufgaben und offene Zeiten.
   */
  app.get("/api/customers/:customerId/visit/pdf", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const [
      assetRows,
      taskRows,
      timeRows,
      projectRows,
      activityRows,
      contractRows,
      appointmentRows,
      vaultRows,
    ] = await Promise.all([
      db.select().from(assets).where(eq(assets.customerId, customerId)).all(),
      db.select().from(tasks).where(eq(tasks.customerId, customerId)).all(),
      db
        .select()
        .from(timeEntries)
        .where(eq(timeEntries.customerId, customerId))
        .orderBy(desc(timeEntries.workDate))
        .all(),
      db.select().from(projects).where(eq(projects.customerId, customerId)).all(),
      db
        .select()
        .from(activities)
        .where(eq(activities.customerId, customerId))
        .orderBy(desc(activities.occurredAt))
        .all(),
      db.select().from(contracts).where(eq(contracts.customerId, customerId)).all(),
      db
        .select()
        .from(appointments)
        .where(eq(appointments.customerId, customerId))
        .orderBy(desc(appointments.startDate))
        .all(),
      db
        .select()
        .from(vaultEntries)
        .where(eq(vaultEntries.customerId, customerId))
        .orderBy(desc(vaultEntries.updatedAt))
        .all(),
    ]);

    const today = new Date();
    const todayIso = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");

    const buffer = await buildVisitPdf({
      customer,
      assets: assetRows,
      tasks: taskRows,
      timeEntries: timeRows,
      projects: projectRows,
      activities: activityRows,
      reminders: buildVisitReminders({
        assets: assetRows,
        contracts: contractRows,
        appointments: appointmentRows,
        todayIso,
      }),
      vaultHints: buildVisitVaultHints(vaultRows),
    });

    const label = (customer.company || customer.name).replace(/[^\w\-äöüÄÖÜß]+/gi, "_").slice(0, 50);
    const stamp = new Date().toISOString().slice(0, 10);
    return reply
      .header("Content-Type", "application/pdf")
      .header(
        "Content-Disposition",
        `attachment; filename="${pdfFilename(`Besuch_${label}_${stamp}`)}"`,
      )
      .send(buffer);
  });

  app.get("/api/customers/:customerId/export", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const [
      docs,
      assetRows,
      activityRows,
      taskRows,
      contractRows,
      attachmentRows,
      projectRows,
      timeRows,
    ] = await Promise.all([
      db.select().from(documents).where(eq(documents.customerId, customerId)).all(),
      db.select().from(assets).where(eq(assets.customerId, customerId)).all(),
      db
        .select()
        .from(activities)
        .where(eq(activities.customerId, customerId))
        .orderBy(desc(activities.occurredAt))
        .all(),
      db.select().from(tasks).where(eq(tasks.customerId, customerId)).all(),
      db.select().from(contracts).where(eq(contracts.customerId, customerId)).all(),
      db.select().from(attachments).where(eq(attachments.customerId, customerId)).all(),
      db.select().from(projects).where(eq(projects.customerId, customerId)).all(),
      db
        .select()
        .from(timeEntries)
        .where(eq(timeEntries.customerId, customerId))
        .orderBy(desc(timeEntries.workDate))
        .all(),
    ]);

    const label = (customer.company || customer.name).replace(/[^\w\-]+/g, "_").slice(0, 60);
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `systemhaus-ess_${label}_${stamp}.zip`;

    const pass = new PassThrough();
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      request.log.error(err);
      if (!reply.sent) reply.code(500).send({ error: "Export fehlgeschlagen" });
    });
    archive.pipe(pass);

    reply
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(pass);

    archive.append(JSON.stringify(customer, null, 2), { name: "kunde.json" });
    archive.append(JSON.stringify(assetRows, null, 2), { name: "anlagen.json" });
    archive.append(JSON.stringify(activityRows, null, 2), { name: "historie.json" });
    archive.append(JSON.stringify(taskRows, null, 2), { name: "aufgaben.json" });
    archive.append(JSON.stringify(contractRows, null, 2), { name: "vertraege.json" });
    archive.append(JSON.stringify(projectRows, null, 2), { name: "projekte.json" });
    archive.append(JSON.stringify(timeRows, null, 2), { name: "zeiten.json" });

    const overview = [
      `# ${customer.company || customer.name}`,
      "",
      `- Kurzname: ${customer.name}`,
      `- Ansprechpartner: ${customer.contactPerson ?? "–"}`,
      `- E-Mail: ${customer.email ?? "–"}`,
      `- Telefon: ${customer.phone ?? "–"}`,
      `- Mobil: ${customer.mobile ?? "–"}`,
      `- Adresse: ${[customer.address, customer.zip, customer.city, customer.country].filter(Boolean).join(", ") || "–"}`,
      `- USt-IdNr.: ${customer.vatId ?? "–"}`,
      `- Website: ${customer.website ?? "–"}`,
      `- Notiz: ${customer.notes ?? "–"}`,
      "",
      `Exportiert am ${new Date().toLocaleString("de-DE")}`,
      "",
      `## Projekte (${projectRows.length})`,
      ...projectRows.map(
        (p) =>
          `- ${p.name} [${p.status}] Budget ${p.budgetHours ?? "–"}h / ${p.budgetAmount ?? "–"}€`,
      ),
      "",
      `## Zeiten (${timeRows.length})`,
      ...timeRows
        .slice(0, 50)
        .map((t) => `- ${t.workDate}: ${t.hours}h${t.description ? ` – ${t.description}` : ""}`),
      "",
      `## Wiki / Dokumente (${docs.length})`,
      ...docs.map((d) => `- ${d.title} (${d.type})`),
      "",
      `## Anlagen (${assetRows.length})`,
      ...assetRows.map(
        (a) =>
          `- ${a.name} (${a.kind}) S/N ${a.serialNumber ?? "–"} Garantie ${a.warrantyUntil ?? "–"}`,
      ),
      "",
      `## Verträge (${contractRows.length})`,
      ...contractRows.map(
        (c) =>
          `- ${c.title} ${c.startDate ?? "?"} – ${c.endDate ?? "?"} SLA ${c.slaResponseHours ?? "–"}h`,
      ),
      "",
      `## Offene Aufgaben`,
      ...taskRows.filter((t) => !t.done).map((t) => `- [ ] ${t.title} (fällig ${t.dueDate ?? "–"})`),
      "",
      `## Historie`,
      ...activityRows.slice(0, 30).map((a) => `- ${a.title}`),
    ].join("\n");
    archive.append(overview, { name: "uebersicht.md" });

    for (const doc of docs) {
      const safe = doc.title.replace(/[^\w\-]+/g, "_").slice(0, 80);
      archive.append(tiptapToText(doc.content), {
        name: `wiki/${safe}_${doc.id}.md`,
      });
      archive.append(doc.content, { name: `wiki/${safe}_${doc.id}.json` });
    }

    for (const att of attachmentRows) {
      const path = join(uploadDir, att.storedName);
      if (existsSync(path)) {
        archive.append(createReadStream(path), {
          name: `anhaenge/${att.originalName}`,
        });
      }
    }

    await archive.finalize();
  });
}
