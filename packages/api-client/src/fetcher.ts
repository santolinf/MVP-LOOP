function csrfToken(): string | undefined {
  if (typeof document === "undefined") return undefined;
  // The admin portal (served under /admin) is a separate realm with its own readable CSRF cookie.
  const name = typeof location !== "undefined" && location.pathname.startsWith("/admin") ? "staff_csrf" : "csrf";
  return document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`))?.[1];
}

/** Orval mutator: same-origin cookie auth plus CSRF header on mutating requests. */
export async function customFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  const csrf = csrfToken();
  if (csrf && method !== "GET" && method !== "HEAD") headers.set("x-csrf-token", csrf);
  const res = await fetch(url, { ...init, headers, credentials: "include" });
  // Read as text first: an empty or non-JSON body (proxy page, 304, truncated reply) must surface as a readable
  // problem with the HTTP status, not as an opaque SyntaxError that the UI can only show as "Something went wrong".
  const text = res.status === 204 ? "" : await res.text();
  let body: unknown;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      if (res.ok) throw { title: "Unexpected response", status: res.status, detail: `The server returned a non-JSON reply (HTTP ${res.status}).` };
    }
  }
  if (!res.ok) throw body && typeof body === "object" ? { status: res.status, ...(body as object) } : { title: res.statusText || "Request failed", status: res.status };
  if (res.status !== 204 && body === undefined) throw { title: "Empty response", status: res.status, detail: `The server returned no data (HTTP ${res.status}).` };
  return { data: body, status: res.status, headers: res.headers } as T;
}
