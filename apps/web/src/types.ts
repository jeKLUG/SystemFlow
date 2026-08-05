export type CustomerStatus = "active" | "inactive";
export type DocumentType = "note" | "protocol" | "documentation";

export interface User {
  id: string;
  username: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
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

export interface Stats {
  customerCount: number;
  activeCount: number;
}
