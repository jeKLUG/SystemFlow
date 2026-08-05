async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!res.ok) {
    let message = "Anfrage fehlgeschlagen";
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ user: { id: string; username: string } }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  me: () => request<{ user: { id: string; username: string } }>("/api/auth/me"),
  stats: () => request<import("./types").Stats>("/api/stats"),
  customers: (q?: string) =>
    request<import("./types").Customer[]>(
      q ? `/api/customers?q=${encodeURIComponent(q)}` : "/api/customers",
    ),
  customer: (id: string) => request<import("./types").Customer>(`/api/customers/${id}`),
  createCustomer: (body: Record<string, unknown>) =>
    request<import("./types").Customer>("/api/customers", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateCustomer: (id: string, body: Record<string, unknown>) =>
    request<import("./types").Customer>(`/api/customers/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteCustomer: (id: string) =>
    request<{ ok: boolean }>(`/api/customers/${id}`, { method: "DELETE" }),
  documents: (customerId?: string) =>
    request<import("./types").DocumentItem[]>(
      customerId
        ? `/api/documents?customerId=${encodeURIComponent(customerId)}`
        : "/api/documents",
    ),
  recentDocuments: () =>
    request<import("./types").RecentDocument[]>("/api/documents/recent"),
  document: (id: string) =>
    request<import("./types").DocumentItem>(`/api/documents/${id}`),
  createDocument: (body: Record<string, unknown>) =>
    request<import("./types").DocumentItem>("/api/documents", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateDocument: (id: string, body: Record<string, unknown>) =>
    request<import("./types").DocumentItem>(`/api/documents/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteDocument: (id: string) =>
    request<{ ok: boolean }>(`/api/documents/${id}`, { method: "DELETE" }),
};
