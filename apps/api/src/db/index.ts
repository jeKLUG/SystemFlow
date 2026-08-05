import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as schema from "./schema.js";

/**
 * Fügt eine Spalte hinzu, falls sie noch fehlt (bestehende Installationen).
 */
async function ensureColumn(
  client: Client,
  table: string,
  column: string,
  definition: string,
) {
  const info = await client.execute(`PRAGMA table_info(${table})`);
  const exists = info.rows.some((row) => String(row.name) === column);
  if (!exists) {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/**
 * Öffnet die SQLite-Datenbank (libsql) und initialisiert Tabellen.
 * @param databasePath Pfad zur SQLite-Datei
 */
export async function createDb(databasePath: string) {
  const absolute = resolve(databasePath);
  mkdirSync(dirname(absolute), { recursive: true });
  const url = pathToFileURL(absolute).href;
  const client: Client = createClient({ url });

  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      company TEXT,
      contact_person TEXT,
      email TEXT,
      phone TEXT,
      mobile TEXT,
      address TEXT,
      zip TEXT,
      city TEXT,
      country TEXT,
      vat_id TEXT,
      website TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'other',
      manufacturer TEXT,
      model TEXT,
      serial_number TEXT,
      warranty_until TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      occurred_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_documents_customer ON documents(customer_id);
    CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
    CREATE INDEX IF NOT EXISTS idx_assets_customer ON assets(customer_id);
    CREATE INDEX IF NOT EXISTS idx_activities_customer ON activities(customer_id);
    CREATE INDEX IF NOT EXISTS idx_activities_occurred ON activities(occurred_at);
  `);

  // Migration für bestehende DBs ohne die neuen Kundenfelder
  await ensureColumn(client, "customers", "company", "TEXT");
  await ensureColumn(client, "customers", "contact_person", "TEXT");
  await ensureColumn(client, "customers", "mobile", "TEXT");
  await ensureColumn(client, "customers", "zip", "TEXT");
  await ensureColumn(client, "customers", "city", "TEXT");
  await ensureColumn(client, "customers", "country", "TEXT");
  await ensureColumn(client, "customers", "vat_id", "TEXT");
  await ensureColumn(client, "customers", "website", "TEXT");

  return drizzle(client, { schema });
}

export type Db = Awaited<ReturnType<typeof createDb>>;
