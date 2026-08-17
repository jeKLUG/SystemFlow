import { and, desc, eq, like, or, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import {
  activities,
  assets,
  attachments,
  customers,
  documents,
  fileFolders,
} from "../db/schema.js";
import { requireAuth } from "../plugins/auth.js";
import { tiptapToText } from "../lib/tiptap-text.js";

const SEARCH_TYPES = [
  "contact",
  "customer",
  "wiki",
  "file",
  "asset",
  "activity",
  "folder",
] as const;

type SearchType = (typeof SEARCH_TYPES)[number];

/**
 * Baut LIKE-Muster für exakte und fuzzy (Zeichen mit Lücken) Suche.
 */
function likePatterns(term: string): string[] {
  const cleaned = term.trim().replace(/\s+/g, " ");
  if (!cleaned) return [];
  const patterns = new Set<string>();
  patterns.add(`%${cleaned}%`);

  for (const token of cleaned.split(" ").filter((t) => t.length >= 2)) {
    patterns.add(`%${token}%`);
  }

  const compact = cleaned.replace(/\s+/g, "");
  if (compact.length >= 3 && compact.length <= 18) {
    patterns.add(`%${compact.split("").join("%")}%`);
  }

  return [...patterns];
}

function columnMatches(
  column: Parameters<typeof like>[0],
  patterns: string[],
): SQL | undefined {
  const parts = patterns.map((p) => like(column, p));
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return or(...parts);
}

function anyMatch(clauses: Array<SQL | undefined>): SQL | undefined {
  const parts = clauses.filter(Boolean) as SQL[];
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return or(...parts);
}

/**
 * Extrahiert eine Kontextzeile um den Suchbegriff.
 */
export function makeSnippet(raw: string, term: string, maxLen = 140): string | null {
  const text = tiptapToText(raw).replace(/\s+/g, " ").trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  const needle = term.trim().toLowerCase();
  let idx = needle ? lower.indexOf(needle) : -1;
  if (idx < 0) {
    const token = needle.split(/\s+/)[0] ?? "";
    idx = token ? lower.indexOf(token) : -1;
  }
  if (idx < 0) {
    return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
  }
  const pad = Math.floor((maxLen - Math.max(needle.length, 1)) / 2);
  const start = Math.max(0, idx - pad);
  const end = Math.min(text.length, start + maxLen);
  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = `…${snippet}`;
  if (end < text.length) snippet = `${snippet}…`;
  return snippet;
}

function parseTypes(raw?: string): Set<SearchType> | null {
  if (!raw?.trim()) return null;
  const set = new Set<SearchType>();
  for (const p of raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
    if ((SEARCH_TYPES as readonly string[]).includes(p)) {
      set.add(p as SearchType);
    }
  }
  return set.size ? set : null;
}

function wants(types: Set<SearchType> | null, ...keys: SearchType[]): boolean {
  if (!types) return true;
  return keys.some((k) => types.has(k));
}

/**
 * Registriert die globale Suche inkl. Typ-Filter, Fuzzy-LIKE und Snippets.
 */
export async function searchRoutes(app: FastifyInstance, db: Db) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/search", async (request) => {
    const q = z
      .object({
        q: z.string().min(1).max(200),
        /** Komma-getrennt: contact,customer,wiki,file,asset,activity,folder */
        types: z.string().optional(),
      })
      .parse(request.query);

    const term = q.q.trim();
    const types = parseTypes(q.types);
    const patterns = likePatterns(term);

    const runCustomers = wants(types, "contact", "customer");
    const runWiki = wants(types, "wiki");
    const runFiles = wants(types, "file");
    const runAssets = wants(types, "asset");
    const runActivities = wants(types, "activity");
    const runFolders = wants(types, "folder") || runFiles;

    let kindFilter: SQL | undefined;
    if (types?.has("contact") && !types.has("customer")) {
      kindFilter = eq(customers.kind, "contact");
    } else if (types?.has("customer") && !types.has("contact")) {
      kindFilter = eq(customers.kind, "customer");
    }

    const customerWhere = anyMatch([
      columnMatches(customers.name, patterns),
      columnMatches(customers.company, patterns),
      columnMatches(customers.contactPerson, patterns),
      columnMatches(customers.email, patterns),
      columnMatches(customers.phone, patterns),
      columnMatches(customers.mobile, patterns),
      columnMatches(customers.address, patterns),
      columnMatches(customers.zip, patterns),
      columnMatches(customers.city, patterns),
      columnMatches(customers.vatId, patterns),
      columnMatches(customers.website, patterns),
      columnMatches(customers.notes, patterns),
    ]);

    const [
      customerHits,
      documentHits,
      assetHits,
      activityHits,
      attachmentHits,
      folderHits,
    ] = await Promise.all([
      runCustomers && customerWhere
        ? db
            .select({
              id: customers.id,
              name: customers.name,
              company: customers.company,
              email: customers.email,
              phone: customers.phone,
              city: customers.city,
              status: customers.status,
              kind: customers.kind,
              notes: customers.notes,
              contactPerson: customers.contactPerson,
            })
            .from(customers)
            .where(kindFilter ? and(customerWhere, kindFilter) : customerWhere)
            .orderBy(desc(customers.updatedAt))
            .limit(40)
            .all()
        : Promise.resolve([]),
      runWiki
        ? db
            .select({
              id: documents.id,
              title: documents.title,
              type: documents.type,
              content: documents.content,
              customerId: documents.customerId,
              customerName: customers.name,
              updatedAt: documents.updatedAt,
            })
            .from(documents)
            .innerJoin(customers, eq(documents.customerId, customers.id))
            .where(
              anyMatch([
                columnMatches(documents.title, patterns),
                columnMatches(documents.content, patterns),
              ]) ?? like(documents.title, `%${term}%`),
            )
            .orderBy(desc(documents.updatedAt))
            .limit(40)
            .all()
        : Promise.resolve([]),
      runAssets
        ? db
            .select({
              id: assets.id,
              name: assets.name,
              kind: assets.kind,
              serialNumber: assets.serialNumber,
              customerId: assets.customerId,
              customerName: customers.name,
              notes: assets.notes,
              hostname: assets.hostname,
              ipAddress: assets.ipAddress,
            })
            .from(assets)
            .innerJoin(customers, eq(assets.customerId, customers.id))
            .where(
              anyMatch([
                columnMatches(assets.name, patterns),
                columnMatches(assets.manufacturer, patterns),
                columnMatches(assets.model, patterns),
                columnMatches(assets.serialNumber, patterns),
                columnMatches(assets.hostname, patterns),
                columnMatches(assets.ipAddress, patterns),
                columnMatches(assets.macAddress, patterns),
                columnMatches(assets.location, patterns),
                columnMatches(assets.notes, patterns),
              ]),
            )
            .orderBy(desc(assets.updatedAt))
            .limit(40)
            .all()
        : Promise.resolve([]),
      runActivities
        ? db
            .select({
              id: activities.id,
              title: activities.title,
              description: activities.description,
              customerId: activities.customerId,
              customerName: customers.name,
              occurredAt: activities.occurredAt,
            })
            .from(activities)
            .innerJoin(customers, eq(activities.customerId, customers.id))
            .where(
              anyMatch([
                columnMatches(activities.title, patterns),
                columnMatches(activities.description, patterns),
              ]),
            )
            .orderBy(desc(activities.occurredAt))
            .limit(40)
            .all()
        : Promise.resolve([]),
      runFiles
        ? db
            .select({
              id: attachments.id,
              originalName: attachments.originalName,
              description: attachments.description,
              mimeType: attachments.mimeType,
              size: attachments.size,
              folderId: attachments.folderId,
              documentId: attachments.documentId,
              customerId: attachments.customerId,
              customerName: customers.name,
              createdAt: attachments.createdAt,
            })
            .from(attachments)
            .innerJoin(customers, eq(attachments.customerId, customers.id))
            .where(
              anyMatch([
                columnMatches(attachments.originalName, patterns),
                columnMatches(attachments.description, patterns),
              ]),
            )
            .orderBy(desc(attachments.createdAt))
            .limit(40)
            .all()
        : Promise.resolve([]),
      runFolders
        ? db
            .select({
              id: fileFolders.id,
              name: fileFolders.name,
              parentId: fileFolders.parentId,
              customerId: fileFolders.customerId,
              customerName: customers.name,
              updatedAt: fileFolders.updatedAt,
            })
            .from(fileFolders)
            .innerJoin(customers, eq(fileFolders.customerId, customers.id))
            .where(columnMatches(fileFolders.name, patterns))
            .orderBy(desc(fileFolders.updatedAt))
            .limit(40)
            .all()
        : Promise.resolve([]),
    ]);

    return {
      q: term,
      types: types ? [...types] : null,
      customers: customerHits.slice(0, 20).map((c) => {
        const hay = [c.name, c.company, c.contactPerson, c.notes, c.email, c.city]
          .filter(Boolean)
          .join(" · ");
        return {
          id: c.id,
          name: c.name,
          company: c.company,
          email: c.email,
          phone: c.phone,
          city: c.city,
          status: c.status,
          kind: c.kind ?? ("customer" as const),
          snippet: makeSnippet(hay, term, 120),
        };
      }),
      documents: documentHits.slice(0, 20).map((d) => ({
        id: d.id,
        title: d.title,
        type: d.type,
        customerId: d.customerId,
        customerName: d.customerName,
        updatedAt: d.updatedAt,
        snippet: makeSnippet(d.content ?? "", term) ?? makeSnippet(d.title, term),
      })),
      assets: assetHits.slice(0, 20).map((a) => ({
        id: a.id,
        name: a.name,
        kind: a.kind,
        serialNumber: a.serialNumber,
        customerId: a.customerId,
        customerName: a.customerName,
        snippet: makeSnippet(
          [a.name, a.hostname, a.ipAddress, a.serialNumber, a.notes].filter(Boolean).join(" · "),
          term,
          120,
        ),
      })),
      activities: activityHits.slice(0, 20).map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        customerId: a.customerId,
        customerName: a.customerName,
        occurredAt: a.occurredAt,
        snippet: makeSnippet([a.title, a.description].filter(Boolean).join(" · "), term, 120),
      })),
      attachments: attachmentHits.slice(0, 20).map((a) => ({
        id: a.id,
        originalName: a.originalName,
        description: a.description,
        mimeType: a.mimeType,
        size: a.size,
        folderId: a.folderId,
        documentId: a.documentId,
        customerId: a.customerId,
        customerName: a.customerName,
        createdAt: a.createdAt,
        snippet: makeSnippet(
          [a.originalName, a.description].filter(Boolean).join(" · "),
          term,
          120,
        ),
      })),
      folders: folderHits.slice(0, 20).map((f) => ({
        id: f.id,
        name: f.name,
        parentId: f.parentId,
        customerId: f.customerId,
        customerName: f.customerName,
        updatedAt: f.updatedAt,
        snippet: makeSnippet(`${f.name} · ${f.customerName}`, term, 100),
      })),
    };
  });
}
