import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

/** Admin-Benutzer (V1: ein Admin). */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/** Kontakte und Kunden (gleiche Stammdaten-Tabelle, unterschieden über `kind`). */
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
  /** `contact` = einfacher Kontakt, `customer` = Kunde. */
  kind: text("kind", { enum: ["contact", "customer"] }).notNull().default("customer"),
  status: text("status", { enum: ["active", "inactive"] }).notNull().default("active"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Projekte pro Kunde inkl. Budget. */
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status", {
    enum: ["planned", "active", "on_hold", "done"],
  })
    .notNull()
    .default("planned"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  budgetHours: real("budget_hours"),
  budgetAmount: real("budget_amount"),
  hourlyRate: real("hourly_rate"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Wiki-/Dokumentseiten pro Kunde (optional Projekt oder Gerät). */
export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  projectId: text("project_id"),
  assetId: text("asset_id"),
  type: text("type", {
    enum: ["note", "protocol", "documentation", "article", "workflow"],
  }).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull().default("{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\"}]}"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Zeiteinträge / geleistete Stunden (Stunden aus Start-/Endzeit berechnet). */
export const timeEntries = sqliteTable("time_entries", {
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  projectId: text("project_id"),
  priceItemId: text("price_item_id"),
  workDate: text("work_date").notNull(),
  startTime: text("start_time"),
  endTime: text("end_time"),
  hours: real("hours").notNull(),
  description: text("description"),
  billable: integer("billable", { mode: "boolean" }).notNull().default(true),
  /** Bereits an den Kunden abgerechnet / in Rechnung gestellt. */
  billed: integer("billed", { mode: "boolean" }).notNull().default(false),
  /** Stundensatz zum Buchungszeitpunkt (für Rechnungsvorbereitung). */
  rateSnapshot: real("rate_snapshot"),
  /** Nettobetrag Stunden × Satz. */
  amountSnapshot: real("amount_snapshot"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Subnetze / VLANs pro Kunde für den Netzwerkplan. */
export const networkSegments = sqliteTable("network_segments", {
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  cidr: text("cidr"),
  vlan: text("vlan"),
  gateway: text("gateway"),
  dns: text("dns"),
  dhcpRange: text("dhcp_range"),
  purpose: text("purpose"),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Geräte & Netzwerkkomponenten pro Kunde. */
export const assets = sqliteTable("assets", {
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  segmentId: text("segment_id"),
  name: text("name").notNull(),
  kind: text("kind", {
    enum: [
      "pc",
      "laptop",
      "server",
      "firewall",
      "switch",
      "router",
      "access_point",
      "printer",
      "nas",
      "ups",
      "phone",
      "license",
      "network",
      "other",
    ],
  })
    .notNull()
    .default("other"),
  status: text("status", {
    enum: ["active", "spare", "retired"],
  })
    .notNull()
    .default("active"),
  role: text("role"),
  manufacturer: text("manufacturer"),
  model: text("model"),
  serialNumber: text("serial_number"),
  hostname: text("hostname"),
  ipAddress: text("ip_address"),
  secondaryIp: text("secondary_ip"),
  macAddress: text("mac_address"),
  location: text("location"),
  rack: text("rack"),
  vlan: text("vlan"),
  os: text("os"),
  firmware: text("firmware"),
  cpu: text("cpu"),
  ramGb: real("ram_gb"),
  diskGb: real("disk_gb"),
  ports: text("ports"),
  managementUrl: text("management_url"),
  purchaseDate: text("purchase_date"),
  installedAt: text("installed_at"),
  responsiblePerson: text("responsible_person"),
  warrantyUntil: text("warranty_until"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Visueller Netzwerkplan pro Kunde (Knoten/Kanten als JSON). */
export const networkPlans = sqliteTable("network_plans", {
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  diagramJson: text("diagram_json").notNull().default("{\"nodes\":[],\"edges\":[]}"),
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

/** Offene Aufgaben / To-dos – optional einem Kunden zugeordnet. */
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").references(() => customers.id, { onDelete: "cascade" }),
  projectId: text("project_id"),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: text("due_date"),
  /** Priorität wie Todoist: 1 = dringend … 4 = normal. */
  priority: integer("priority").notNull().default(4),
  sortOrder: integer("sort_order").notNull().default(0),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Vertrags-/SLA-Status. */
export const contractStatuses = ["draft", "active", "paused", "expired", "cancelled"] as const;
export type ContractStatus = (typeof contractStatuses)[number];

/** Verträge / SLA-Stammdaten (keine Rechnungen). */
export const contracts = sqliteTable("contracts", {
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  /** Interne Vertrags-/SLA-Nummer. */
  contractNumber: text("contract_number"),
  status: text("status", { enum: contractStatuses }).notNull().default("active"),
  /** Leistungsumfang / abgedeckte Services. */
  description: text("description"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  /** Servicezeiten, z. B. Mo–Fr 08:00–17:00. */
  coverageHours: text("coverage_hours"),
  /** Zusätzliche Abdeckungsregeln (Feiertage, Rufbereitschaft …). */
  coverageNote: text("coverage_note"),
  /** Enthaltene Support-Stunden pro Monat. */
  includedHoursMonth: real("included_hours_month"),
  /**
   * Legacy: allgemeine Reaktionszeit in Stunden.
   * Wird mit `responseNormalHours` synchron gehalten.
   */
  slaResponseHours: integer("sla_response_hours"),
  /** Reaktionszeiten nach Priorität (Stunden, Dezimal erlaubt). */
  responseCriticalHours: real("response_critical_hours"),
  responseHighHours: real("response_high_hours"),
  responseNormalHours: real("response_normal_hours"),
  responseLowHours: real("response_low_hours"),
  /** Lösungszeiten nach Priorität (Stunden). */
  resolveCriticalHours: real("resolve_critical_hours"),
  resolveHighHours: real("resolve_high_hours"),
  resolveNormalHours: real("resolve_normal_hours"),
  resolveLowHours: real("resolve_low_hours"),
  /** Max. Zeit bis Vor-Ort-Einsatz (Stunden). */
  onsiteHours: real("onsite_hours"),
  contactPerson: text("contact_person"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  escalationContact: text("escalation_contact"),
  escalationPhone: text("escalation_phone"),
  escalationEmail: text("escalation_email"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Termine (Kunden- und allgemeine Termine). */
export const appointments = sqliteTable("appointments", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  /** Kundentermin, intern, persönlich oder sonstig. */
  kind: text("kind", {
    enum: ["customer", "internal", "personal", "other"],
  })
    .notNull()
    .default("other"),
  customerId: text("customer_id"),
  startDate: text("start_date").notNull(),
  startTime: text("start_time"),
  endDate: text("end_date"),
  endTime: text("end_time"),
  allDay: integer("all_day", { mode: "boolean" }).notNull().default(false),
  location: text("location"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * Organisations-Einstellungen (eine Zeile) – Stundensatz, Währung usw.
 * Für spätere Rechnungsvorbereitung aus der Historie (Lexware extern).
 */
export const orgSettings = sqliteTable("org_settings", {
  id: text("id").primaryKey(),
  defaultHourlyRate: real("default_hourly_rate"),
  currency: text("currency").notNull().default("EUR"),
  defaultVatPercent: real("default_vat_percent"),
  invoiceNote: text("invoice_note"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * Preiskatalog: Stundensätze und Einzelpreise für Leistungen.
 */
export const priceItems = sqliteTable("price_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  /** hourly = Stundensatz, fixed = Pauschale, unit = Stückpreis */
  kind: text("kind", { enum: ["hourly", "fixed", "unit"] }).notNull().default("hourly"),
  unitLabel: text("unit_label"),
  unitPrice: real("unit_price").notNull(),
  sku: text("sku"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * Vault-Metadaten (eine Zeile): Salt + gewrappter DEK.
 * Klartext-Geheimnisse liegen nie in der DB.
 */
export const vaultMeta = sqliteTable("vault_meta", {
  id: text("id").primaryKey(),
  saltB64: text("salt_b64").notNull(),
  wrappedDekB64: text("wrapped_dek_b64").notNull(),
  canaryB64: text("canary_b64").notNull(),
  kdfJson: text("kdf_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Verschlüsselte Zugangsdaten (AES-256-GCM Felder). */
export const vaultEntries = sqliteTable("vault_entries", {
  id: text("id").primaryKey(),
  customerId: text("customer_id"),
  /** Klartext-Label zur Orientierung (kein Geheimnis). */
  title: text("title").notNull(),
  /** Kategorie zur Organisation (vpn, admin, …). */
  category: text("category").notNull().default("other"),
  /** Favorit für schnellen Zugriff (Klartext-Flag). */
  favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
  /** Freie Tags als JSON-Array (Klartext, zur Filterung). */
  tagsJson: text("tags_json").notNull().default("[]"),
  usernameEnc: text("username_enc"),
  passwordEnc: text("password_enc"),
  urlEnc: text("url_enc"),
  notesEnc: text("notes_enc"),
  /** TOTP-Secret (Base32), verschlüsselt – für 2FA-Codes. */
  totpSecretEnc: text("totp_secret_enc"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Ordner in der Kunden-Dokumentenablage. */
export const fileFolders = sqliteTable("file_folders", {
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Dateien / Anhänge zu Kunde, Ordner, Wiki-Dokument, Anlage oder E-Mail. */
export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  folderId: text("folder_id"),
  documentId: text("document_id"),
  assetId: text("asset_id"),
  emailId: text("email_id"),
  originalName: text("original_name").notNull(),
  storedName: text("stored_name").notNull(),
  mimeType: text("mime_type"),
  size: integer("size").notNull().default(0),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Archivierte Kunden-E-Mails (Mailverkehr). */
export const customerEmails = sqliteTable("customer_emails", {
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  fromAddress: text("from_address"),
  toAddress: text("to_address"),
  ccAddress: text("cc_address"),
  direction: text("direction").notNull().default("inbound"),
  sentAt: text("sent_at").notNull(),
  bodyText: text("body_text"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const emailDirections = ["inbound", "outbound", "internal"] as const;
export type EmailDirection = (typeof emailDirections)[number];

export type User = typeof users.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type NetworkSegment = typeof networkSegments.$inferSelect;
export type NetworkPlan = typeof networkPlans.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Contract = typeof contracts.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type OrgSettings = typeof orgSettings.$inferSelect;
export type PriceItem = typeof priceItems.$inferSelect;
export type VaultMeta = typeof vaultMeta.$inferSelect;
export type VaultEntry = typeof vaultEntries.$inferSelect;
export type FileFolder = typeof fileFolders.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type CustomerEmail = typeof customerEmails.$inferSelect;
