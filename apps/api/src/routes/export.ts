import archiver from "archiver";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type { Db } from "../db/index.js";
import {
  activities,
  assets,
  attachments,
  contracts,
  customers,
  documents,
  tasks,
} from "../db/schema.js";
import { tiptapToText } from "../lib/tiptap-text.js";
import { requireAuth } from "../plugins/auth.js";

/**
 * Registriert Kunden-Export als ZIP.
 */
export async function exportRoutes(
  app: FastifyInstance,
  db: Db,
  uploadDir: string,
) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/customers/:customerId/export", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) return reply.code(404).send({ error: "Kunde nicht gefunden" });

    const [docs, assetRows, activityRows, taskRows, contractRows, attachmentRows] =
      await Promise.all([
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
        name: `dokumente/${safe}_${doc.id}.md`,
      });
      archive.append(doc.content, { name: `dokumente/${safe}_${doc.id}.json` });
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
