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
  const body: unknown = res.status === 204 ? undefined : await res.json();
  if (!res.ok) throw body;
  return { data: body, status: res.status, headers: res.headers } as T;
}
