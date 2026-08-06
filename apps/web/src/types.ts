export type CustomerStatus = "active" | "inactive";
export type DocumentType = "note" | "protocol" | "documentation" | "article" | "workflow";
export type ProjectStatus = "planned" | "active" | "on_hold" | "done";
export type AppointmentKind = "customer" | "internal" | "personal" | "other";
export type AssetKind =
  | "pc"
  | "laptop"
  | "server"
  | "firewall"
  | "switch"
  | "router"
  | "access_point"
  | "printer"
  | "nas"
  | "ups"
  | "phone"
  | "license"
  | "network"
  | "other";

export type AssetStatus = "active" | "spare" | "retired";
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
}

export interface User {
  id: string;
  username: string;
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
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentItem {
  id: string;
  customerId: string;
  projectId: string | null;
  assetId: string | null;
  type: DocumentType;
  title: string;
  content: string;
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

export interface TimeEntryItem {
  id: string;
  customerId: string;
  projectId: string | null;
  projectName?: string | null;
  priceItemId?: string | null;
  priceItemName?: string | null;
  workDate: string;
  startTime: string | null;
  endTime: string | null;
  hours: number;
  description: string | null;
  billable: boolean;
  rateSnapshot?: number | null;
  amountSnapshot?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimeEntriesResponse {
  entries: TimeEntryItem[];
  summary: {
    totalHours: number;
    billableHours: number;
    billableAmount?: number;
    entryCount: number;
  };
}

export type PriceItemKind = "hourly" | "fixed" | "unit";

export interface OrgSettings {
  id: string;
  defaultHourlyRate: number | null;
  currency: string;
  defaultVatPercent: number | null;
  invoiceNote: string | null;
  updatedAt: string;
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
  customerId: string;
  customerName: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  customerId: string;
  segmentId: string | null;
  name: string;
  kind: AssetKind;
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
  customers: Array<
    Pick<Customer, "id" | "name" | "company" | "email" | "phone" | "status" | "city">
  >;
  documents: Array<{
    id: string;
    title: string;
    type: DocumentType;
    customerId: string;
    customerName: string;
    updatedAt: string;
  }>;
  assets: Array<{
    id: string;
    name: string;
    kind: AssetKind;
    serialNumber: string | null;
    customerId: string;
    customerName: string;
  }>;
  activities: Array<{
    id: string;
    title: string;
    description: string | null;
    customerId: string;
    customerName: string;
    occurredAt: string;
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
  customerId: string;
  projectId?: string | null;
  projectName?: string | null;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: TaskPriority | number;
  sortOrder: number;
  done: boolean;
  createdAt: string;
  updatedAt: string;
  customerName?: string;
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
  originalName: string;
  storedName: string;
  mimeType: string | null;
  size: number;
  description?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface FileFolderItem {
  id: string;
  customerId: string;
  parentId: string | null;
  name: string;
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
    customerId: string;
    customerName: string;
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
  status: "active",
};
