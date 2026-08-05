async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  // Content-Type nur setzen, wenn ein Body mitgeschickt wird –
  // sonst scheitern DELETE/GET in Fastify oft mit leerem JSON-Body.
  if (init?.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers,
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
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
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
  customers: (opts?: {
    q?: string;
    status?: "active" | "inactive" | "all";
    limit?: number;
    offset?: number;
    sort?: "updated" | "name";
    ids?: string;
  }) => {
    const params = new URLSearchParams();
    if (opts?.q) params.set("q", opts.q);
    if (opts?.status) params.set("status", opts.status);
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.offset != null) params.set("offset", String(opts.offset));
    if (opts?.sort) params.set("sort", opts.sort);
    if (opts?.ids) params.set("ids", opts.ids);
    const qs = params.toString();
    return request<import("./types").CustomerListResponse>(
      `/api/customers${qs ? `?${qs}` : ""}`,
    );
  },
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
  documents: (customerId?: string, opts?: { assetId?: string; projectId?: string; type?: string }) => {
    const params = new URLSearchParams();
    if (customerId) params.set("customerId", customerId);
    if (opts?.assetId) params.set("assetId", opts.assetId);
    if (opts?.projectId) params.set("projectId", opts.projectId);
    if (opts?.type) params.set("type", opts.type);
    const qs = params.toString();
    return request<import("./types").DocumentItem[]>(`/api/documents${qs ? `?${qs}` : ""}`);
  },
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
    request<import("./types").ProjectItem & { recalculatedEntries?: number }>(
      `/api/projects/${id}`,
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
    ),
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
  appointments: (opts?: {
    from?: string;
    to?: string;
    customerId?: string;
    kind?: string;
    upcoming?: boolean;
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (opts?.from) params.set("from", opts.from);
    if (opts?.to) params.set("to", opts.to);
    if (opts?.customerId) params.set("customerId", opts.customerId);
    if (opts?.kind) params.set("kind", opts.kind);
    if (opts?.upcoming) params.set("upcoming", "true");
    if (opts?.limit) params.set("limit", String(opts.limit));
    const qs = params.toString();
    return request<import("./types").AppointmentItem[]>(
      `/api/appointments${qs ? `?${qs}` : ""}`,
    );
  },
  createAppointment: (body: Record<string, unknown>) =>
    request<import("./types").AppointmentItem>("/api/appointments", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateAppointment: (id: string, body: Record<string, unknown>) =>
    request<import("./types").AppointmentItem>(`/api/appointments/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteAppointment: (id: string) =>
    request<{ ok: boolean }>(`/api/appointments/${id}`, { method: "DELETE" }),
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
  networkSegments: (customerId: string) =>
    request<import("./types").NetworkSegment[]>(
      `/api/customers/${customerId}/network-segments`,
    ),
  createNetworkSegment: (customerId: string, body: Record<string, unknown>) =>
    request<import("./types").NetworkSegment>(
      `/api/customers/${customerId}/network-segments`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  updateNetworkSegment: (id: string, body: Record<string, unknown>) =>
    request<import("./types").NetworkSegment>(`/api/network-segments/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteNetworkSegment: (id: string) =>
    request<{ ok: boolean }>(`/api/network-segments/${id}`, { method: "DELETE" }),
  networkPlans: (customerId: string) =>
    request<import("./types").NetworkPlan[]>(`/api/customers/${customerId}/network-plans`),
  createNetworkPlan: (customerId: string, body: Record<string, unknown>) =>
    request<import("./types").NetworkPlan>(`/api/customers/${customerId}/network-plans`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateNetworkPlan: (id: string, body: Record<string, unknown>) =>
    request<import("./types").NetworkPlan>(`/api/network-plans/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteNetworkPlan: (id: string) =>
    request<{ ok: boolean }>(`/api/network-plans/${id}`, { method: "DELETE" }),
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
  vaultStatus: () => request<import("./types").VaultStatus>("/api/vault/status"),
  vaultSetup: (passphrase: string, confirm: string) =>
    request<import("./types").VaultStatus & { ok: boolean }>("/api/vault/setup", {
      method: "POST",
      body: JSON.stringify({ passphrase, confirm }),
    }),
  vaultUnlock: (passphrase: string) =>
    request<{ ok: boolean; unlocked: boolean; expiresAt: number | null }>("/api/vault/unlock", {
      method: "POST",
      body: JSON.stringify({ passphrase }),
    }),
  vaultLock: () =>
    request<{ ok: boolean; unlocked: boolean }>("/api/vault/lock", { method: "POST" }),
  vaultChangePassphrase: (currentPassphrase: string, newPassphrase: string, confirm: string) =>
    request<{ ok: boolean }>("/api/vault/change-passphrase", {
      method: "POST",
      body: JSON.stringify({ currentPassphrase, newPassphrase, confirm }),
    }),
  vaultEntries: (customerId?: string) =>
    request<import("./types").VaultEntryMeta[]>(
      customerId
        ? `/api/vault/entries?customerId=${encodeURIComponent(customerId)}`
        : "/api/vault/entries",
    ),
  vaultCreateEntry: (body: Record<string, unknown>) =>
    request<import("./types").VaultEntryMeta>("/api/vault/entries", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  vaultReveal: (id: string) =>
    request<import("./types").VaultEntrySecret>(`/api/vault/entries/${id}/reveal`),
  vaultUpdateEntry: (id: string, body: Record<string, unknown>) =>
    request<import("./types").VaultEntryMeta>(`/api/vault/entries/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  vaultDeleteEntry: (id: string) =>
    request<{ ok: boolean }>(`/api/vault/entries/${id}`, { method: "DELETE" }),
  orgSettings: () => request<import("./types").OrgSettings>("/api/settings/org"),
  updateOrgSettings: (body: Record<string, unknown>) =>
    request<import("./types").OrgSettings>("/api/settings/org", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  priceItems: (opts?: { activeOnly?: boolean; kind?: string }) => {
    const params = new URLSearchParams();
    if (opts?.activeOnly) params.set("activeOnly", "true");
    if (opts?.kind) params.set("kind", opts.kind);
    const qs = params.toString();
    return request<import("./types").PriceItem[]>(`/api/price-items${qs ? `?${qs}` : ""}`);
  },
  createPriceItem: (body: Record<string, unknown>) =>
    request<import("./types").PriceItem>("/api/price-items", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updatePriceItem: (id: string, body: Record<string, unknown>) =>
    request<import("./types").PriceItem>(`/api/price-items/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deletePriceItem: (id: string) =>
    request<{ ok: boolean }>(`/api/price-items/${id}`, { method: "DELETE" }),
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
