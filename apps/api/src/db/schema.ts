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
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
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

export type User = typeof users.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type Activity = typeof activities.$inferSelect;
