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
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
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
  projects: (customerId: string) =>
    request<import("./types").ProjectItem[]>(`/api/customers/${customerId}/projects`),
  createProject: (customerId: string, body: Record<string, unknown>) =>
    request<import("./types").ProjectItem>(`/api/customers/${customerId}/projects`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateProject: (id: string, body: Record<string, unknown>) =>
    request<import("./types").ProjectItem>(`/api/projects/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteProject: (id: string) =>
    request<{ ok: boolean }>(`/api/projects/${id}`, { method: "DELETE" }),
  timeEntries: (customerId: string, opts?: { projectId?: string; from?: string; to?: string }) => {
    const params = new URLSearchParams();
    if (opts?.projectId) params.set("projectId", opts.projectId);
    if (opts?.from) params.set("from", opts.from);
    if (opts?.to) params.set("to", opts.to);
    const qs = params.toString();
    return request<import("./types").TimeEntriesResponse>(
      `/api/customers/${customerId}/time-entries${qs ? `?${qs}` : ""}`,
    );
  },
  createTimeEntry: (customerId: string, body: Record<string, unknown>) =>
    request<import("./types").TimeEntryItem>(`/api/customers/${customerId}/time-entries`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateTimeEntry: (id: string, body: Record<string, unknown>) =>
    request<import("./types").TimeEntryItem>(`/api/time-entries/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteTimeEntry: (id: string) =>
    request<{ ok: boolean }>(`/api/time-entries/${id}`, { method: "DELETE" }),
  assets: (customerId: string) =>
    request<import("./types").Asset[]>(`/api/customers/${customerId}/assets`),
  createAsset: (customerId: string, body: Record<string, unknown>) =>
    request<import("./types").Asset>(`/api/customers/${customerId}/assets`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateAsset: (id: string, body: Record<string, unknown>) =>
    request<import("./types").Asset>(`/api/assets/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteAsset: (id: string) =>
    request<{ ok: boolean }>(`/api/assets/${id}`, { method: "DELETE" }),
  activities: (customerId: string) =>
    request<import("./types").Activity[]>(`/api/customers/${customerId}/activities`),
  createActivity: (customerId: string, body: Record<string, unknown>) =>
    request<import("./types").Activity>(`/api/customers/${customerId}/activities`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteActivity: (id: string) =>
    request<{ ok: boolean }>(`/api/activities/${id}`, { method: "DELETE" }),
  templates: () => request<import("./types").TemplateMeta[]>("/api/templates"),
  search: (q: string) =>
    request<import("./types").SearchResult>(`/api/search?q=${encodeURIComponent(q)}`),
  tasks: (customerId: string) =>
    request<import("./types").TaskItem[]>(`/api/customers/${customerId}/tasks`),
  openTasks: () => request<import("./types").TaskItem[]>("/api/tasks?openOnly=true"),
  createTask: (customerId: string, body: Record<string, unknown>) =>
    request<import("./types").TaskItem>(`/api/customers/${customerId}/tasks`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateTask: (id: string, body: Record<string, unknown>) =>
    request<import("./types").TaskItem>(`/api/tasks/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteTask: (id: string) =>
    request<{ ok: boolean }>(`/api/tasks/${id}`, { method: "DELETE" }),
  contracts: (customerId: string) =>
    request<import("./types").ContractItem[]>(`/api/customers/${customerId}/contracts`),
  createContract: (customerId: string, body: Record<string, unknown>) =>
    request<import("./types").ContractItem>(`/api/customers/${customerId}/contracts`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteContract: (id: string) =>
    request<{ ok: boolean }>(`/api/contracts/${id}`, { method: "DELETE" }),
  reminders: (days = 90) =>
    request<import("./types").Reminders>(`/api/reminders?days=${days}`),
  attachments: (customerId: string, opts?: { documentId?: string; assetId?: string }) => {
    const params = new URLSearchParams();
    if (opts?.documentId) params.set("documentId", opts.documentId);
    if (opts?.assetId) params.set("assetId", opts.assetId);
    const qs = params.toString();
    return request<import("./types").AttachmentItem[]>(
      `/api/customers/${customerId}/attachments${qs ? `?${qs}` : ""}`,
    );
  },
  uploadAttachment: async (
    customerId: string,
    file: File,
    opts?: { documentId?: string; assetId?: string },
  ) => {
    const body = new FormData();
    body.append("file", file);
    if (opts?.documentId) body.append("documentId", opts.documentId);
    if (opts?.assetId) body.append("assetId", opts.assetId);
    const res = await fetch(`/api/customers/${customerId}/attachments`, {
      method: "POST",
      credentials: "include",
      body,
    });
    if (!res.ok) {
      let message = "Upload fehlgeschlagen";
      try {
        const data = (await res.json()) as { error?: string };
        if (data.error) message = data.error;
      } catch {
        /* ignore */
      }
      throw new Error(message);
    }
    return res.json() as Promise<import("./types").AttachmentItem>;
  },
  deleteAttachment: (id: string) =>
    request<{ ok: boolean }>(`/api/attachments/${id}`, { method: "DELETE" }),
  exportCustomer: async (customerId: string) => {
    const res = await fetch(`/api/customers/${customerId}/export`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Export fehlgeschlagen");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kunde-export-${customerId}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
