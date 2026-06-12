// REST client for the Rails backend (see docs/rails_api_contract.md).
//
// Conventions:
// - All endpoints are JSON under /api.
// - Records serialize like Convex docs (`_id`, `_creationTime`, camelCase,
//   epoch-ms timestamps), so component code consumes them unchanged.
// - Auth is a Devise session cookie; non-GET requests carry the CSRF token
//   obtained from `GET /api/session` (also exposed as the XSRF-TOKEN cookie).
// - Method signatures take Convex-style args objects so call sites stay
//   mechanical: the client splits id-like keys into the URL path and sends
//   the rest as body / query params.

const API_BASE: string = import.meta.env.VITE_API_BASE ?? "";

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null | undefined) {
  csrfToken = token ?? null;
}

function readCsrfCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getCsrfToken(): string | null {
  return csrfToken ?? readCsrfCookie();
}

type Params = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  body?: unknown;
  params?: Params;
  /** Skip dispatching the global auth-expired event on 401 (session probe). */
  skipAuthExpired?: boolean;
}

async function request<T>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, params, skipAuthExpired } = options;

  let url = `${API_BASE}${path}`;
  if (params) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        search.set(key, String(value));
      }
    }
    const qs = search.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") {
    const token = getCsrfToken();
    if (token) headers["X-CSRF-Token"] = token;
  }

  const response = await fetch(url, {
    method,
    headers,
    credentials: API_BASE ? "include" : "same-origin",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    if (response.status === 401 && !skipAuthExpired) {
      window.dispatchEvent(new Event("auth-expired"));
    }
    let message = response.statusText || `Request failed (${response.status})`;
    try {
      const data = await response.json();
      if (data && typeof data.error === "string") message = data.error;
    } catch {
      // Non-JSON error body — keep the status text.
    }
    throw new Error(message);
  }

  if (response.status === 204) return null as T;
  return (await response.json()) as T;
}

// ─── Shared shapes ──────────────────────────────────────────────────

export interface ModeratorDoc {
  _id: string;
  _creationTime: number;
  name: string;
  email: string;
  role: "admin" | "moderator" | "viewer";
  status: "active" | "invited" | "disabled";
  createdAt: number;
  lastLoginAt?: number;
  invitedBy?: string;
  actionCount?: number;
}

export interface SessionResponse {
  user: ModeratorDoc | null;
  csrfToken: string;
}

// ─── Endpoints ──────────────────────────────────────────────────────

export const apiClient = {
  session: {
    get: () =>
      request<SessionResponse>("GET", "/api/session", {
        skipAuthExpired: true,
      }),
    create: (args: { email: string; password: string }) =>
      request<SessionResponse>("POST", "/api/session", {
        body: args,
        skipAuthExpired: true,
      }),
    destroy: () => request<null>("DELETE", "/api/session"),
  },

  password: {
    request: (args: { email: string }) =>
      request<any>("POST", "/api/password", {
        body: args,
        skipAuthExpired: true,
      }),
    reset: (args: { token: string; password: string }) =>
      request<any>("PUT", "/api/password", {
        body: args,
        skipAuthExpired: true,
      }),
  },

  users: {
    list: () => request<any[]>("GET", "/api/users"),
    stats: () => request<any>("GET", "/api/users/stats"),
    activity: ({
      moderatorId,
      ...params
    }: {
      moderatorId: string;
      limit?: number;
    }) =>
      request<any[]>("GET", `/api/users/${moderatorId}/activity`, { params }),
    recentActivity: (args?: { limit?: number }) =>
      request<any[]>("GET", "/api/activity", { params: args }),
    create: (args: {
      name: string;
      email: string;
      role: string;
      password?: string;
    }) => request<any>("POST", "/api/users", { body: args }),
    update: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      role?: string;
      status?: string;
    }) => request<any>("PATCH", `/api/users/${id}`, { body }),
    remove: ({ id }: { id: string }) =>
      request<any>("DELETE", `/api/users/${id}`),
    reactivate: ({ id }: { id: string }) =>
      request<any>("POST", `/api/users/${id}/reactivate`),
    setPassword: (args: { email: string; newPassword: string }) =>
      request<any>("POST", "/api/users/set-password", { body: args }),
  },

  listings: {
    pending: () => request<any[]>("GET", "/api/listings/pending"),
    recent: (args?: { limit?: number }) =>
      request<any[]>("GET", "/api/listings/recent", { params: args }),
    stats: () => request<any>("GET", "/api/listings/stats"),
    unlock: ({ listingId }: { listingId: string }) =>
      request<any>("POST", `/api/listings/${listingId}/unlock`),
  },

  moderation: {
    recent: (args?: { limit?: number }) =>
      request<any[]>("GET", "/api/moderation-results/recent", {
        params: args,
      }),
    byOutcome: (args: { outcome: string; limit?: number }) =>
      request<any[]>("GET", "/api/moderation-results/by-outcome", {
        params: args,
      }),
    forListing: ({ listingId }: { listingId: string }) =>
      request<any[]>(
        "GET",
        `/api/moderation-results/for-listing/${listingId}`,
      ),
    byRule: (args: { ruleName: string; limit?: number }) =>
      request<any>("GET", "/api/moderation-results/by-rule", {
        params: args,
      }),
    latestByJeId: ({ jeId }: { jeId: string }) =>
      request<any>(
        "GET",
        `/api/moderation-results/latest-by-je-id/${encodeURIComponent(jeId)}`,
      ),
    override: ({
      resultId,
      ...body
    }: {
      resultId: string;
      newOutcome: string;
      reason?: string;
      sellerMessage?: string;
      refuseReasonType?: string;
      permanent?: boolean;
    }) =>
      request<any>("POST", `/api/moderation-results/${resultId}/override`, {
        body,
      }),
  },

  dashboard: {
    stats: (args: { startDate?: number; endDate?: number }) =>
      request<any>("GET", "/api/dashboard/stats", { params: args }),
    exportCsv: (args: { startDate?: number; endDate?: number }) =>
      request<any[]>("GET", "/api/dashboard/export-csv", { params: args }),
  },

  messages: {
    list: () => request<any[]>("GET", "/api/messages"),
    create: (args: Record<string, unknown>) =>
      request<any>("POST", "/api/messages", { body: args }),
    update: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      request<any>("PATCH", `/api/messages/${id}`, { body }),
    remove: ({ id }: { id: string }) =>
      request<any>("DELETE", `/api/messages/${id}`),
  },

  rules: {
    list: () => request<any[]>("GET", "/api/rules"),
    create: (args: Record<string, unknown>) =>
      request<any>("POST", "/api/rules", { body: args }),
    update: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      request<any>("PATCH", `/api/rules/${id}`, { body }),
    remove: ({ id }: { id: string }) =>
      request<any>("DELETE", `/api/rules/${id}`),
    toggle: ({ id }: { id: string }) =>
      request<any>("POST", `/api/rules/${id}/toggle`),
    suggest: (args: Record<string, unknown>) =>
      request<any>("POST", "/api/rules/suggest", { body: args }),
  },

  lists: {
    list: () => request<any[]>("GET", "/api/lists"),
    create: (args: Record<string, unknown>) =>
      request<any>("POST", "/api/lists", { body: args }),
    update: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      request<any>("PATCH", `/api/lists/${id}`, { body }),
    remove: ({ id }: { id: string }) =>
      request<any>("DELETE", `/api/lists/${id}`),
    addItem: ({ id, ...body }: { id: string; item: Record<string, unknown> }) =>
      request<any>("POST", `/api/lists/${id}/items`, { body }),
    removeItem: ({ id, itemIndex }: { id: string; itemIndex: number }) =>
      request<any>("DELETE", `/api/lists/${id}/items/${itemIndex}`),
    seed: (args?: Record<string, unknown>) =>
      request<any>("POST", "/api/lists/seed", { body: args ?? {} }),
    suggest: (args: Record<string, unknown>) =>
      request<any>("POST", "/api/lists/suggest", { body: args }),
  },

  notes: {
    listByListing: ({ listingId }: { listingId: string }) =>
      request<any[]>("GET", `/api/listings/${listingId}/notes`),
    add: ({
      listingId,
      ...body
    }: {
      listingId: string;
      content: string;
    }) => request<any>("POST", `/api/listings/${listingId}/notes`, { body }),
    remove: ({ id }: { id: string }) =>
      request<any>("DELETE", `/api/notes/${id}`),
  },

  settings: {
    get: () => request<any>("GET", "/api/settings"),
    update: (args: Record<string, unknown>) =>
      request<any>("PATCH", "/api/settings", { body: args }),
    reset: () => request<any>("POST", "/api/settings/reset"),
  },

  imageRecognition: {
    listResults: () => request<any[]>("GET", "/api/image-recognition/results"),
    deleteResult: ({ id }: { id: string }) =>
      request<any>("DELETE", `/api/image-recognition/results/${id}`),
    clearAllResults: () =>
      request<any>("DELETE", "/api/image-recognition/results"),
    listAnalyses: () =>
      request<any[]>("GET", "/api/image-recognition/analyses"),
    deleteAnalysis: ({ id }: { id: string }) =>
      request<any>("DELETE", `/api/image-recognition/analyses/${id}`),
    clearAllAnalyses: () =>
      request<any>("DELETE", "/api/image-recognition/analyses"),
    analyze: (args: { imageUrls: string[]; title: string; jeId?: string }) =>
      request<any>("POST", "/api/image-recognition/analyze", { body: args }),
    analyzeListingUrl: (args: { url: string }) =>
      request<any>("POST", "/api/image-recognition/analyze-listing-url", {
        body: args,
      }),
  },

  moderateById: {
    run: (args: { inputs: string[] }) =>
      request<any>("POST", "/api/moderate-by-id", { body: args }),
  },

  paramScans: {
    recent: (args?: { limit?: number }) =>
      request<any[]>("GET", "/api/param-scans/recent", { params: args }),
  },

  remediation: {
    stats: () => request<any>("GET", "/api/remediation/stats"),
    recent: (args?: { limit?: number; offset?: number }) =>
      request<any[]>("GET", "/api/remediation/recent", { params: args }),
    batchScan: (args?: { limit?: number }) =>
      request<any>("POST", "/api/remediation/batch-scan", {
        body: args ?? {},
      }),
  },
};

export type ApiClient = typeof apiClient;
