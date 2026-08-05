export type CustomerStatus = "active" | "inactive";
export type DocumentType = "note" | "protocol" | "documentation" | "article" | "workflow";
export type ProjectStatus = "planned" | "active" | "on_hold" | "done";
export type AssetKind = "pc" | "server" | "firewall" | "license" | "network" | "other";

export interface User {
  id: string;
  username: string;
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
  workDate: string;
  hours: number;
  description: string | null;
  billable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TimeEntriesResponse {
  entries: TimeEntryItem[];
  summary: {
    totalHours: number;
    billableHours: number;
    entryCount: number;
  };
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
  name: string;
  kind: AssetKind;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  warrantyUntil: string | null;
  notes: string | null;
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

export interface TaskItem {
  id: string;
  customerId: string;
  projectId?: string | null;
  title: string;
  description: string | null;
  dueDate: string | null;
  done: boolean;
  createdAt: string;
  updatedAt: string;
  customerName?: string;
  customerCompany?: string | null;
}

export interface ContractItem {
  id: string;
  customerId: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  slaResponseHours: number | null;
  contactPerson: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttachmentItem {
  id: string;
  customerId: string;
  documentId: string | null;
  assetId: string | null;
  originalName: string;
  storedName: string;
  mimeType: string | null;
  size: number;
  createdAt: string;
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
