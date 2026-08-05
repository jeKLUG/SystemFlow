export type CustomerStatus = "active" | "inactive";
export type DocumentType = "note" | "protocol" | "documentation";
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
  type: DocumentType;
  title: string;
  content: string;
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
