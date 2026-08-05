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

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'planned',
      start_date TEXT,
      end_date TEXT,
      budget_hours REAL,
      budget_amount REAL,
      hourly_rate REAL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      project_id TEXT,
      asset_id TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS network_segments (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      cidr TEXT,
      vlan TEXT,
      gateway TEXT,
      dns TEXT,
      dhcp_range TEXT,
      purpose TEXT,
      color TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS network_plans (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      diagram_json TEXT NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS time_entries (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      project_id TEXT,
      price_item_id TEXT,
      work_date TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      hours REAL NOT NULL,
      description TEXT,
      billable INTEGER NOT NULL DEFAULT 1,
      rate_snapshot REAL,
      amount_snapshot REAL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS org_settings (
      id TEXT PRIMARY KEY,
      default_hourly_rate REAL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      default_vat_percent REAL,
      invoice_note TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS price_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      kind TEXT NOT NULL DEFAULT 'hourly',
      unit_label TEXT,
      unit_price REAL NOT NULL,
      sku TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      segment_id TEXT,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'other',
      status TEXT NOT NULL DEFAULT 'active',
      role TEXT,
      manufacturer TEXT,
      model TEXT,
      serial_number TEXT,
      hostname TEXT,
      ip_address TEXT,
      secondary_ip TEXT,
      mac_address TEXT,
      location TEXT,
      rack TEXT,
      vlan TEXT,
      os TEXT,
      firmware TEXT,
      cpu TEXT,
      ram_gb REAL,
      disk_gb REAL,
      ports TEXT,
      management_url TEXT,
      purchase_date TEXT,
      installed_at TEXT,
      responsible_person TEXT,
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

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      due_date TEXT,
      done INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      sla_response_hours INTEGER,
      contact_person TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      kind TEXT NOT NULL DEFAULT 'other',
      customer_id TEXT,
      start_date TEXT NOT NULL,
      start_time TEXT,
      end_date TEXT,
      end_time TEXT,
      all_day INTEGER NOT NULL DEFAULT 0,
      location TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vault_meta (
      id TEXT PRIMARY KEY,
      salt_b64 TEXT NOT NULL,
      wrapped_dek_b64 TEXT NOT NULL,
      canary_b64 TEXT NOT NULL,
      kdf_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vault_entries (
      id TEXT PRIMARY KEY,
      customer_id TEXT,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      favorite INTEGER NOT NULL DEFAULT 0,
      tags_json TEXT NOT NULL DEFAULT '[]',
      username_enc TEXT,
      password_enc TEXT,
      url_enc TEXT,
      notes_enc TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      document_id TEXT,
      asset_id TEXT,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_documents_customer ON documents(customer_id);
    CREATE INDEX IF NOT EXISTS idx_appointments_start ON appointments(start_date);
    CREATE INDEX IF NOT EXISTS idx_appointments_customer ON appointments(customer_id);
    CREATE INDEX IF NOT EXISTS idx_vault_entries_customer ON vault_entries(customer_id);
    CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
    CREATE INDEX IF NOT EXISTS idx_assets_customer ON assets(customer_id);
    CREATE INDEX IF NOT EXISTS idx_network_segments_customer ON network_segments(customer_id);
    CREATE INDEX IF NOT EXISTS idx_network_plans_customer ON network_plans(customer_id);
    CREATE INDEX IF NOT EXISTS idx_activities_customer ON activities(customer_id);
    CREATE INDEX IF NOT EXISTS idx_activities_occurred ON activities(occurred_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_customer ON tasks(customer_id);
    CREATE INDEX IF NOT EXISTS idx_contracts_customer ON contracts(customer_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_customer ON attachments(customer_id);
    CREATE INDEX IF NOT EXISTS idx_projects_customer ON projects(customer_id);
    CREATE INDEX IF NOT EXISTS idx_time_entries_customer ON time_entries(customer_id);
    CREATE INDEX IF NOT EXISTS idx_time_entries_work_date ON time_entries(work_date);
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
  await ensureColumn(client, "documents", "project_id", "TEXT");
  await ensureColumn(client, "documents", "asset_id", "TEXT");
  await ensureColumn(client, "tasks", "project_id", "TEXT");
  await ensureColumn(client, "time_entries", "start_time", "TEXT");
  await ensureColumn(client, "time_entries", "end_time", "TEXT");
  await ensureColumn(client, "time_entries", "price_item_id", "TEXT");
  await ensureColumn(client, "time_entries", "rate_snapshot", "REAL");
  await ensureColumn(client, "time_entries", "amount_snapshot", "REAL");
  await ensureColumn(client, "assets", "status", "TEXT NOT NULL DEFAULT 'active'");
  await ensureColumn(client, "assets", "segment_id", "TEXT");
  await ensureColumn(client, "assets", "role", "TEXT");
  await ensureColumn(client, "assets", "hostname", "TEXT");
  await ensureColumn(client, "assets", "ip_address", "TEXT");
  await ensureColumn(client, "assets", "secondary_ip", "TEXT");
  await ensureColumn(client, "assets", "mac_address", "TEXT");
  await ensureColumn(client, "assets", "location", "TEXT");
  await ensureColumn(client, "assets", "rack", "TEXT");
  await ensureColumn(client, "assets", "vlan", "TEXT");
  await ensureColumn(client, "assets", "os", "TEXT");
  await ensureColumn(client, "assets", "firmware", "TEXT");
  await ensureColumn(client, "assets", "cpu", "TEXT");
  await ensureColumn(client, "assets", "ram_gb", "REAL");
  await ensureColumn(client, "assets", "disk_gb", "REAL");
  await ensureColumn(client, "assets", "ports", "TEXT");
  await ensureColumn(client, "assets", "management_url", "TEXT");
  await ensureColumn(client, "assets", "purchase_date", "TEXT");
  await ensureColumn(client, "assets", "installed_at", "TEXT");
  await ensureColumn(client, "assets", "responsible_person", "TEXT");
  await ensureColumn(client, "vault_entries", "favorite", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(client, "vault_entries", "tags_json", "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn(client, "attachments", "updated_at", "INTEGER");
  await ensureColumn(client, "attachments", "folder_id", "TEXT");
  await ensureColumn(client, "attachments", "description", "TEXT");

  // Indizes, die Spalten aus ensureColumn brauchen (bestehende DBs)
  await client.execute(
    `CREATE INDEX IF NOT EXISTS idx_documents_asset ON documents(asset_id)`,
  );
  await client.execute(`PRAGMA foreign_keys = ON`);

  return drizzle(client, { schema });
}

export type Db = Awaited<ReturnType<typeof createDb>>;
