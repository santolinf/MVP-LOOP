import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type Req = { method: string; path: string; headers: Record<string, string | string[] | undefined> };
type Res = {
  setHeader(name: string, value: string): void;
  append(name: string, value: string): void;
  status(code: number): Res;
  end(): void;
};
type Next = () => void;
export type Middleware = (req: Req, res: Res, next: Next) => void;

const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;

/**
 * SHA-256 CSP source expressions for every inline <script> in the prebuilt HTML shells.
 * The web bundle is prerendered, so its inline hydration scripts are static and can be hashed at
 * boot instead of allowing 'unsafe-inline' scripts.
 */
export function inlineScriptHashes(root: string): string[] {
  const hashes = new Set<string>();
  for (const file of ["web/index.html", "web/__spa-fallback.html", "admin/index.html"]) {
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    for (const match of readFileSync(path, "utf8").matchAll(INLINE_SCRIPT)) {
      const body = match[1];
      if (body) hashes.add(`'sha256-${createHash("sha256").update(body).digest("base64")}'`);
    }
  }
  return [...hashes];
}

/**
 * `connectOrigins` are extra origins the browser may call with fetch: the object store, because CVs are uploaded and
 * downloaded straight to presigned URLs rather than through the API (ADR 0012). The same origins may serve images,
 * because the profile photograph is shown from a presigned URL.
 */
export function buildCsp(scriptHashes: string[], production: boolean, connectOrigins: string[] = []): string {
  const directives = [
    "default-src 'self'",
    `script-src ${["'self'", ...scriptHashes].join(" ")}`,
    // TODO(spec): style-src keeps 'unsafe-inline' because React/Tailwind emit style attributes; tighten with nonces later.
    "style-src 'self' 'unsafe-inline'",
    `img-src ${["'self'", "data:", ...connectOrigins].join(" ")}`,
    "font-src 'self'",
    `connect-src ${["'self'", ...connectOrigins].join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (production) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/** In-house security headers (no helmet dependency). HSTS is sent in production only; the edge also sets it. */
export function securityHeaders(options: { csp: string; production: boolean }): Middleware {
  return (req, res, next) => {
    res.setHeader("Content-Security-Policy", options.csp);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    if (options.production) res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
    // API responses carry personal data and must not be cached by browsers or shared caches.
    if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
    next();
  };
}

const CORS_ALLOWED_HEADERS = "content-type, x-csrf-token, idempotency-key, x-device-id, authorization";
const CORS_ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

/** CORS limited to an explicit origin allowlist. Unknown origins get no CORS headers at all. */
export function cors(allowedOrigins: string[]): Middleware {
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    const origin = req.headers.origin;
    res.append("Vary", "Origin");
    if (typeof origin === "string" && allowed.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Methods", CORS_ALLOWED_METHODS);
        res.setHeader("Access-Control-Allow-Headers", CORS_ALLOWED_HEADERS);
        res.setHeader("Access-Control-Max-Age", "600");
        res.status(204).end();
        return;
      }
    }
    next();
  };
}
