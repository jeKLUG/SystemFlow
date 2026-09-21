export type CustomerStatus = "active" | "inactive";
/** Kontakt (Person) oder Kunde (geschäftlich). */
export type ContactKind = "contact" | "customer";
export type DocumentType = "note" | "protocol" | "documentation" | "article" | "workflow";
export type ProjectStatus = "planned" | "active" | "on_hold" | "done";
export type AppointmentKind = "customer" | "internal" | "personal" | "other";
export type AssetKind =
  | "pc"
  | "laptop"
  | "tablet"
  | "server"
  | "firewall"
  | "switch"
  | "router"
  | "access_point"
  | "printer"
  | "nas"
  | "ups"
  | "phone"
  | "monitor"
  | "accessory"
  | "software"
  | "license"
  | "network"
  | "other";

/** Wer besitzt / wo liegt der Inventar-Eintrag. */
export type AssetOwnership = "customer" | "loaned" | "held";

export type AssetStatus = "active" | "spare" | "retired";
export type TicketPriority = "low" | "normal" | "high" | "critical";
export type MonitoringIssueKind =
  | "offline"
  | "disk"
  | "cpu"
  | "ram"
  | "eventlog"
  | "updates"
  | "smart"
  | "services"
  | "reboot";
export type MonitoringKindAlert = { enabled: boolean; priority: TicketPriority };
export type MonitoringVolumeAlert = { enabled: boolean; warnUsedPct: number };
export type MonitoringDiskAlert = MonitoringKindAlert & {
  warnUsedPct: number;
  volumes: Record<string, MonitoringVolumeAlert>;
};
export type MonitoringAlertConfig = {
  [K in MonitoringIssueKind]: K extends "disk" ? MonitoringDiskAlert : MonitoringKindAlert;
};
export type VaultCategory =
  | "vpn"
  | "admin"
  | "hosting"
  | "email"
  | "firewall"
  | "remote"
  | "wifi"
  | "database"
  | "cloud"
  | "license"
  | "office"
  | "isp"
  | "other";

export interface VaultStatus {
  configured: boolean;
  unlocked: boolean;
  expiresAt: number | null;
}

export interface VaultEntryMeta {
  id: string;
  customerId: string | null;
  customerName?: string | null;
  customerCompany?: string | null;
  title: string;
  category: VaultCategory | string;
  favorite: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  hasUsername: boolean;
  hasPassword: boolean;
  hasUrl: boolean;
  hasNotes: boolean;
  hasTotp: boolean;
}

export interface VaultEntrySecret {
  id: string;
  title: string;
  category: VaultCategory | string;
  favorite?: boolean;
  tags?: string[];
  customerId: string | null;
  username: string | null;
  password: string | null;
  url: string | null;
  notes: string | null;
  totpSecret: string | null;
}

/** Ergebnis nach Anlegen eines Einweg-Shares (PIN nur einmal). */
export interface VaultShareCreated {
  token: string;
  pin: string;
  path: string;
  expiresAt: string;
  maxViews: number;
  fieldsMode: VaultShareFieldsMode;
  title: string;
}

export type VaultShareFieldsMode = "password" | "credentials" | "full";

export type VaultShareEventOutcome =
  | "success"
  | "wrong_pin"
  | "rate_limited"
  | "expired"
  | "consumed"
  | "revoked";

export interface VaultShareMeta {
  id: string;
  entryId: string | null;
  title: string;
  expiresAt: string;
  maxViews: number;
  viewCount: number;
  includeTotp: boolean;
  fieldsMode: VaultShareFieldsMode;
  createdAt: string;
  consumedAt: string | null;
  status: "active" | "expired" | "consumed";
  path: string;
}

export interface VaultShareEvent {
  id: string;
  at: string;
  ip: string | null;
  outcome: VaultShareEventOutcome | string;
}

export interface VaultShareEventsResponse {
  shareId: string;
  title: string;
  events: VaultShareEvent[];
}

export interface VaultSharePublicStatus {
  status: "ok" | "expired" | "consumed" | "revoked" | "not_found";
  expiresAt?: string;
  maxViews?: number;
  viewCount?: number;
  viewsRemaining?: number;
}

export interface VaultShareOpened {
  status: "ok";
  title: string;
  username: string | null;
  password: string | null;
  url: string | null;
  notes: string | null;
  totpSecret: string | null;
  viewsRemaining: number;
  expiresAt: string;
}

export interface User {
  id: string;
  username: string;
  role: "admin" | "customer";
  customerId?: string | null;
  customerName?: string | null;
}

export interface CustomerListResponse {
  items: Customer[];
  total: number;
  limit: number;
  offset: number;
}

export interface Customer {
  id: string;
  name: string;
  company: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  address: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  vatId: string | null;
  website: string | null;
  notes: string | null;
  kind: ContactKind;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentItem {
  id: string;
  customerId: string | null;
  projectId: string | null;
  assetId: string | null;
  type: DocumentType;
  title: string;
  content: string;
  portalVisible?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectItem {
  id: string;
  customerId: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  budgetHours: number | null;
  budgetAmount: number | null;
  hourlyRate: number | null;
  createdAt: string;
  updatedAt: string;
  loggedHours?: number;
  estimatedCost?: number | null;
  budgetHoursRemaining?: number | null;
}

export type PriceItemKind = "hourly" | "fixed" | "unit";

export interface TimeEntryLineItem {
  id: string;
  timeEntryId: string;
  priceItemId: string;
  nameSnapshot: string;
  kindSnapshot: PriceItemKind;
  unitLabelSnapshot: string | null;
  quantity: number;
  unitPriceSnapshot: number;
  amountSnapshot: number | null;
  sortOrder: number;
}

export interface TimeEntryItem {
  id: string;
  customerId: string;
  projectId: string | null;
  projectName?: string | null;
  priceItemId?: string | null;
  priceItemName?: string | null;
  /** Katalog-Positionen (1–n); Legacy-Einträge können leer sein. */
  lines?: TimeEntryLineItem[];
  workDate: string;
  startTime: string | null;
  endTime: string | null;
  hours: number;
  description: string | null;
  billable: boolean;
  /** Für Lexware / Rechnung vorgemerkt. */
  readyForInvoice: boolean;
  /** Bereits abgerechnet. */
  billed: boolean;
  rateSnapshot?: number | null;
  amountSnapshot?: number | null;
  /** Verknüpftes Support-Ticket. */
  ticketId?: string | null;
  ticketNumber?: string | null;
  ticketTitle?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimeEntriesResponse {
  entries: TimeEntryItem[];
  summary: {
    totalHours: number;
    billableHours: number;
    billableAmount?: number;
    unbilledHours?: number;
    unbilledAmount?: number;
    readyForInvoiceHours?: number;
    readyForInvoiceAmount?: number;
    entryCount: number;
  };
}

export interface OrgSettings {
  id: string;
  defaultHourlyRate: number | null;
  currency: string;
  defaultVatPercent: number | null;
  invoiceNote: string | null;
  orgName: string | null;
  orgTagline: string | null;
  orgAddress: string | null;
  orgZip: string | null;
  orgCity: string | null;
  orgCountry: string | null;
  orgEmail: string | null;
  orgPhone: string | null;
  updatedAt: string;
}

export type SmtpSecure = "starttls" | "ssl" | "none";

export const mailStaffKinds = [
  "ticketCreated",
  "ticketComment",
  "ticketStatus",
  "appointmentCreated",
  "appointmentChanged",
  "appointmentReminder",
  "monitoringOpen",
  "monitoringClose",
] as const;
export type MailStaffKind = (typeof mailStaffKinds)[number];

export const mailCustomerKinds = [
  "ticketCreated",
  "ticketComment",
  "ticketStatus",
  "appointmentCreated",
  "appointmentChanged",
  "appointmentReminder",
  "monitoringOpen",
  "monitoringClose",
] as const;
export type MailCustomerKind = (typeof mailCustomerKinds)[number];

export const mailKindLabel: Record<MailStaffKind, string> = {
  ticketCreated: "Neues Ticket",
  ticketComment: "Ticket-Kommentar",
  ticketStatus: "Ticket-Status",
  appointmentCreated: "Termin angelegt",
  appointmentChanged: "Termin geändert / gelöscht",
  appointmentReminder: "Termin-Erinnerung",
  monitoringOpen: "Monitoring-Warnung",
  monitoringClose: "Monitoring-Entwarnung",
};

export interface MailNotifyConfig {
  staff: Record<MailStaffKind, boolean>;
  customer: Record<MailCustomerKind, boolean>;
  reminders: { hours24: boolean; hours1: boolean; morning: boolean };
}

export interface MailSettings {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: SmtpSecure;
  smtpUser: string;
  smtpPasswordSet: boolean;
  mailFromEmail: string;
  mailFromName: string;
  mailReplyTo: string;
  mailPublicUrl: string;
  mailStaffInbox: string;
  notify: MailNotifyConfig;
}

export interface PortalMailAccount {
  email: string;
  notify: Record<MailCustomerKind, boolean>;
  allowed: Record<MailCustomerKind, boolean>;
}

export interface PriceItem {
  id: string;
  name: string;
  description: string | null;
  kind: PriceItemKind;
  unitLabel: string | null;
  unitPrice: number;
  sku: string | null;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RecentDocument {
  id: string;
  title: string;
  type: DocumentType;
  customerId: string | null;
  customerName: string | null;
  updatedAt: string;
}

export interface Asset {
  id: string;
  customerId: string;
  segmentId: string | null;
  name: string;
  kind: AssetKind;
  ownership: AssetOwnership;
  status: AssetStatus;
  role: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  hostname: string | null;
  ipAddress: string | null;
  secondaryIp: string | null;
  macAddress: string | null;
  location: string | null;
  rack: string | null;
  vlan: string | null;
  os: string | null;
  firmware: string | null;
  cpu: string | null;
  ramGb: number | null;
  diskGb: number | null;
  ports: string | null;
  managementUrl: string | null;
  purchaseDate: string | null;
  installedAt: string | null;
  responsiblePerson: string | null;
  warrantyUntil: string | null;
  notes: string | null;
  portalVisible?: boolean;
  monitoringEnabled?: boolean;
  monitoringAlertEnabled?: boolean;
  monitoringAlerts?: MonitoringAlertConfig;
  monitoringAgentId?: string | null;
  monitoringOnline?: boolean | null;
  monitoringLastSeenAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NetworkSegment {
  id: string;
  customerId: string;
  name: string;
  cidr: string | null;
  vlan: string | null;
  gateway: string | null;
  dns: string | null;
  dhcpRange: string | null;
  purpose: string | null;
  color: string | null;
  sortOrder: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NetworkPlanNode {
  id: string;
  label: string;
  kind: "internet" | "firewall" | "switch" | "segment" | "asset" | "cloud" | "other";
  assetId?: string | null;
  segmentId?: string | null;
  x: number;
  y: number;
}

export interface NetworkPlanEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
}

export interface NetworkPlanDiagram {
  nodes: NetworkPlanNode[];
  edges: NetworkPlanEdge[];
}

export interface NetworkPlan {
  id: string;
  customerId: string;
  title: string;
  description: string | null;
  diagramJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  customerId: string;
  title: string;
  description: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface TemplateMeta {
  id: string;
  name: string;
  description: string;
  type: DocumentType;
  title: string;
}

export interface SearchResult {
  q: string;
  types?: string[] | null;
  customers: Array<
    Pick<Customer, "id" | "name" | "company" | "email" | "phone" | "status" | "city"> & {
      kind?: ContactKind;
      snippet?: string | null;
    }
  >;
  documents: Array<{
    id: string;
    title: string;
    type: DocumentType;
    customerId: string;
    customerName: string;
    updatedAt: string;
    snippet?: string | null;
  }>;
  assets: Array<{
    id: string;
    name: string;
    kind: AssetKind;
    serialNumber: string | null;
    customerId: string;
    customerName: string;
    snippet?: string | null;
  }>;
  activities: Array<{
    id: string;
    title: string;
    description: string | null;
    customerId: string;
    customerName: string;
    occurredAt: string;
    snippet?: string | null;
  }>;
  attachments: Array<{
    id: string;
    originalName: string;
    description: string | null;
    mimeType: string | null;
    size: number;
    folderId: string | null;
    documentId: string | null;
    customerId: string;
    customerName: string;
    createdAt: string;
    snippet?: string | null;
  }>;
  folders: Array<{
    id: string;
    name: string;
    parentId: string | null;
    customerId: string;
    customerName: string;
    updatedAt: string;
    snippet?: string | null;
  }>;
}

export interface Stats {
  customerCount: number;
  activeCount: number;
}

/** Priorität 1 (dringend) … 4 (normal), analog Todoist. */
export type TaskPriority = 1 | 2 | 3 | 4;

export interface TaskItem {
  id: string;
  /** null = interne Aufgabe ohne Kundenbezug */
  customerId: string | null;
  projectId?: string | null;
  projectName?: string | null;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: TaskPriority | number;
  sortOrder: number;
  done: boolean;
  ticketId?: string | null;
  createdAt: string;
  updatedAt: string;
  customerName?: string | null;
  customerCompany?: string | null;
}

export interface AppointmentItem {
  id: string;
  title: string;
  description: string | null;
  kind: AppointmentKind;
  customerId: string | null;
  customerName?: string | null;
  customerCompany?: string | null;
  startDate: string;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ContractStatus = "draft" | "active" | "paused" | "expired" | "cancelled";

export interface ContractItem {
  id: string;
  customerId: string;
  title: string;
  contractNumber: string | null;
  status: ContractStatus;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  coverageHours: string | null;
  coverageNote: string | null;
  includedHoursMonth: number | null;
  priceMonthly: number | null;
  priceYearly: number | null;
  slaResponseHours: number | null;
  responseCriticalHours: number | null;
  responseHighHours: number | null;
  responseNormalHours: number | null;
  responseLowHours: number | null;
  resolveCriticalHours: number | null;
  resolveHighHours: number | null;
  resolveNormalHours: number | null;
  resolveLowHours: number | null;
  onsiteHours: number | null;
  contactPerson: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  escalationContact: string | null;
  escalationPhone: string | null;
  escalationEmail: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttachmentItem {
  id: string;
  customerId: string;
  folderId?: string | null;
  documentId: string | null;
  assetId: string | null;
  emailId?: string | null;
  ticketId?: string | null;
  ticketMessageId?: string | null;
  originalName: string;
  storedName?: string;
  mimeType: string | null;
  size: number;
  description?: string | null;
  portalVisible?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export type EmailDirection = "inbound" | "outbound" | "internal";

/** Archivierte Kunden-E-Mail. */
export interface CustomerEmailItem {
  id: string;
  customerId: string;
  subject: string;
  fromAddress: string | null;
  toAddress: string | null;
  ccAddress: string | null;
  direction: EmailDirection;
  sentAt: string;
  bodyText: string | null;
  notes: string | null;
  attachmentCount?: number;
  /** ID der Original-.eml-Datei, falls importiert – für Download aus der Übersicht. */
  emlAttachmentId?: string | null;
  attachments?: AttachmentItem[];
  createdAt: string;
  updatedAt: string;
}

export interface FileFolderItem {
  id: string;
  customerId: string;
  parentId: string | null;
  name: string;
  portalVisible?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Reminders {
  days: number;
  from: string;
  to: string;
  warranties: Array<{
    id: string;
    name: string;
    kind: AssetKind;
    warrantyUntil: string | null;
    customerId: string;
    customerName: string;
    customerCompany: string | null;
  }>;
  contracts: Array<{
    id: string;
    title: string;
    endDate: string | null;
    slaResponseHours: number | null;
    customerId: string;
    customerName: string;
    customerCompany: string | null;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    dueDate: string | null;
    customerId: string | null;
    customerName: string | null;
    customerCompany: string | null;
  }>;
}

export const emptyCustomerForm: {
  name: string;
  company: string;
  contactPerson: string;
  email: string;
  phone: string;
  mobile: string;
  address: string;
  zip: string;
  city: string;
  country: string;
  vatId: string;
  website: string;
  notes: string;
  kind: ContactKind;
  status: CustomerStatus;
} = {
  name: "",
  company: "",
  contactPerson: "",
  email: "",
  phone: "",
  mobile: "",
  address: "",
  zip: "",
  city: "",
  country: "Deutschland",
  vatId: "",
  website: "",
  notes: "",
  kind: "contact",
  status: "active",
};

export type TicketStatus = "open" | "in_progress" | "waiting_customer" | "resolved" | "closed";
export type TicketSource = "portal" | "staff" | "monitoring";
export type TicketMessageVisibility = "public" | "internal";
export type TicketMessageKind = "comment" | "resolution" | "opener";

export interface TicketMessageItem {
  id: string;
  ticketId: string;
  visibility: TicketMessageVisibility;
  kind?: TicketMessageKind;
  authorRole: "admin" | "customer";
  authorUserId: string;
  body: string;
  createdAt: string;
}

export interface TicketItem {
  id: string;
  number: string;
  customerId: string;
  customerName?: string | null;
  customerCompany?: string | null;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  source: TicketSource;
  contractId: string | null;
  createdByRole: "admin" | "customer";
  createdByUserId: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  slaResponseDueAt: string | null;
  slaResolveDueAt: string | null;
  resolution?: string | null;
  responseBreached?: boolean;
  resolveBreached?: boolean;
  slaBreached?: boolean;
  messages?: TicketMessageItem[];
  attachments?: AttachmentItem[];
  linkedTaskCount?: number;
  linkedTimeCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TicketStats {
  openCount: number;
  waitingCount: number;
  slaBreachedCount: number;
}

export interface PortalUser {
  id: string;
  customerId: string;
  username: string;
  email?: string | null;
  enabled: boolean;
  notify?: Record<MailCustomerKind, boolean>;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortalOverview {
  customerName: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  openTicketCount: number;
  waitingOnCustomer: number;
  slaBreachedCount: number;
  documentCount: number;
  wikiCount?: number;
  fileCount?: number;
  assetCount: number;
  contractCount: number;
  ticketsByStatus?: Record<TicketStatus, number>;
  ticketsByPriority?: Record<TicketPriority, number>;
  ticketsWeek?: { date: string; count: number }[];
  recentTickets?: {
    id: string;
    number: string;
    title: string;
    status: TicketStatus;
    priority: TicketPriority;
    updatedAt: string;
  }[];
}

export const monitoringIssueKinds: MonitoringIssueKind[] = [
  "offline",
  "disk",
  "cpu",
  "ram",
  "eventlog",
  "updates",
  "smart",
  "services",
  "reboot",
];

export function emptyMonitoringAlertConfig(allEnabled = false): MonitoringAlertConfig {
  return {
    offline: { enabled: allEnabled, priority: "high" },
    disk: { enabled: allEnabled, priority: "high", warnUsedPct: 90, volumes: {} },
    cpu: { enabled: allEnabled, priority: "normal" },
    ram: { enabled: allEnabled, priority: "normal" },
    eventlog: { enabled: allEnabled, priority: "normal" },
    updates: { enabled: allEnabled, priority: "low" },
    smart: { enabled: allEnabled, priority: "high" },
    services: { enabled: allEnabled, priority: "normal" },
    reboot: { enabled: allEnabled, priority: "low" },
  };
}

export function monitoringDiskId(disk: { id?: string; name: string; mount?: string }): string {
  const raw = (disk.id || disk.name || disk.mount || "").trim();
  if (/^[A-Za-z]:/.test(raw) || raw.includes("\\")) {
    const m = raw.match(/([A-Za-z]):/);
    if (m) return `${m[1].toUpperCase()}:`;
  }
  const trimmed = raw.replace(/\/+$/, "");
  return trimmed || "/";
}

export interface MonitoringIssueTicket {
  kind: MonitoringIssueKind;
  diskId?: string;
  ticketId: string;
  ticketNumber: string;
  priority: TicketPriority;
}

export interface MonitoringDiskIssue {
  id: string;
  name: string;
  usedPct: number;
  warnUsedPct: number;
}

export interface MonitoringDeviceSummary {
  agentId: string;
  assetId: string | null;
  assetName: string;
  customerId: string | null;
  customerName: string | null;
  hostname: string | null;
  os: string | null;
  osVersion: string | null;
  ipAddress: string | null;
  lastSeenAt: string | null;
  status: "online" | "offline" | "pending";
  online: boolean;
  alertEnabled: boolean;
  alertConfig?: MonitoringAlertConfig;
  monitoringEnabled: boolean;
  warning: boolean;
  issues: MonitoringIssueKind[];
  diskIssues?: MonitoringDiskIssue[];
  tickets?: MonitoringIssueTicket[];
  ticketId: string | null;
  ticketNumber: string | null;
  agentVersion: string | null;
  agentPlatform: string | null;
  latestAgentVersion: string | null;
  agentOutdated: boolean;
  updateRequested: boolean;
  uninstallRequested: boolean;
  cpuPercent: number | null;
  ramPercent: number | null;
  diskUsedPct: number | null;
  uptimeSec: number | null;
}

export interface MonitoringOverview {
  online: number;
  offline: number;
  warning: number;
  pending: number;
  assigned: number;
  problems: MonitoringDeviceSummary[];
  byCustomer: {
    customerId: string;
    customerName: string;
    online: number;
    offline: number;
    warning: number;
  }[];
  customers: { id: string; name: string }[];
}

export interface MonitoringCustomerView {
  customerId: string;
  customerName: string;
  devices: MonitoringDeviceSummary[];
  waitingAssets: { id: string; name: string; hostname: string | null }[];
}

export interface MonitoringPendingAgent {
  id: string;
  machineId: string;
  hostname: string | null;
  os: string | null;
  osVersion: string | null;
  ipAddress: string | null;
  agentVersion: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  uninstallRequested: boolean;
}

export interface MonitoringAssignableAsset {
  id: string;
  name: string;
  hostname: string | null;
  customerId: string;
  customerName: string;
}

export interface MonitoringSample {
  ts: string;
  cpuPct: number | null;
  ramPct: number | null;
  diskUsedPct: number | null;
  netRxBytes: number | null;
  netTxBytes: number | null;
}

export interface MonitoringHardware {
  system?: { manufacturer?: string; model?: string; serial?: string; sku?: string };
  bios?: { vendor?: string; version?: string; date?: string; serial?: string };
  board?: { manufacturer?: string; product?: string; serial?: string };
  cpus?: { name?: string; cores?: number; threads?: number; mhz?: number; socket?: string }[];
  memoryModules?: {
    slot?: string;
    sizeBytes?: number;
    speedMhz?: number;
    manufacturer?: string;
    partNumber?: string;
    serial?: string;
    type?: string;
  }[];
  storage?: {
    name?: string;
    model?: string;
    serial?: string;
    sizeBytes?: number;
    bus?: string;
    media?: string;
    health?: "ok" | "warn" | "fail" | string;
  }[];
  gpus?: { name?: string; driver?: string; vramBytes?: number }[];
  nics?: { name?: string; mac?: string; manufacturer?: string; speedMbps?: number }[];
}

export interface MonitoringSnapshot {
  hostname?: string;
  os?: string;
  osVersion?: string;
  arch?: string;
  uptimeSec?: number;
  agentVersion?: string;
  platform?: string;
  ip?: string;
  ips?: string[];
  mac?: string;
  cpuPercent?: number | null;
  ramUsedBytes?: number | null;
  ramTotalBytes?: number | null;
  disks?: { id?: string; name: string; mount?: string; totalBytes: number; usedBytes: number; freeBytes: number }[];
  nics?: { name: string; bytesRecv: number; bytesSent: number; up?: boolean }[];
  processes?: { name: string; cpuPercent?: number; rssBytes?: number }[];
  updates?: { pendingCount?: number; lastInstalled?: string | null; rebootPending?: boolean };
  events?: { source?: string; level?: string; time?: string; message: string }[];
  hardware?: MonitoringHardware;
  session?: { user?: string; users?: string[]; lastLogon?: string };
  network?: {
    publicIp?: string;
    gateway?: string;
    dns?: string[];
    dhcp?: boolean | null;
    adapter?: string;
  };
  services?: { name: string; display?: string; state?: string }[];
  software?: {
    name: string;
    publisher?: string;
    version?: string;
    match?: { assetId: string; name: string } | null;
  }[];
}

export interface MonitoringDeviceDetail {
  device: MonitoringDeviceSummary;
  snapshot: MonitoringSnapshot | null;
  samples: MonitoringSample[];
}

export type AgentPackagePlatform = "windows-amd64" | "linux-amd64" | "linux-arm64";

export interface AgentPackageInfo {
  platform: AgentPackagePlatform;
  version: string;
  filename: string;
  sha256: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface MonitoringSettings {
  enrollmentKey: string;
  platforms: { id: AgentPackagePlatform; label: string; filename: string }[];
  packages: AgentPackageInfo[];
}
