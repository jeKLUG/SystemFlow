import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/** Admin-Benutzer (V1: ein Admin). */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/** Kundenstammdaten. */
export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  company: text("company"),
  contactPerson: text("contact_person"),
  email: text("email"),
  phone: text("phone"),
  mobile: text("mobile"),
  address: text("address"),
  zip: text("zip"),
  city: text("city"),
  country: text("country"),
  vatId: text("vat_id"),
  website: text("website"),
  notes: text("notes"),
  status: text("status", { enum: ["active", "inactive"] }).notNull().default("active"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Kundendokumente (TipTap JSON). */
export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["note", "protocol", "documentation"] }).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull().default("{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\"}]}"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Anlagen / Geräte pro Kunde. */
export const assets = sqliteTable("assets", {
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind", {
    enum: ["pc", "server", "firewall", "license", "network", "other"],
  })
    .notNull()
    .default("other"),
  manufacturer: text("manufacturer"),
  model: text("model"),
  serialNumber: text("serial_number"),
  warrantyUntil: text("warranty_until"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Einsatz-/Aktivitäten-Historie pro Kunde. */
export const activities = sqliteTable("activities", {
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/** Offene Aufgaben / To-dos pro Kunde. */
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: text("due_date"),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Verträge / SLA-Stammdaten (keine Rechnungen). */
export const contracts = sqliteTable("contracts", {
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  startDate: text("start_date"),
  endDate: text("end_date"),
  slaResponseHours: integer("sla_response_hours"),
  contactPerson: text("contact_person"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Dateianhänge zu Kunde / Dokument / Anlage. */
export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  documentId: text("document_id"),
  assetId: text("asset_id"),
  originalName: text("original_name").notNull(),
  storedName: text("stored_name").notNull(),
  mimeType: text("mime_type"),
  size: integer("size").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export type User = typeof users.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Contract = typeof contracts.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
