import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NestExpressApplication } from "@nestjs/platform-express";

/**
 * Serves the prebuilt web (at /) and admin (at /admin/) bundles with SPA fallbacks.
 * No-op when the bundles are absent (local dev serves them from Vite instead).
 */
export function serveStatic(app: NestExpressApplication, root: string): void {
  const webDir = resolve(root, "web");
  const adminDir = resolve(root, "admin");
  const hasWeb = existsSync(webDir);
  const hasAdmin = existsSync(adminDir);

  if (hasAdmin) app.useStaticAssets(adminDir, { prefix: "/admin/", index: false });
  if (hasWeb) app.useStaticAssets(webDir);

  const server = app.getHttpAdapter().getInstance();
  server.get(/^\/(?!api\/v1(?:\/|$)).*/, (req: { path: string }, res: { sendFile(path: string): void }, next: () => void) => {
    const isAdmin = req.path === "/admin" || req.path.startsWith("/admin/");
    if (isAdmin && hasAdmin) return res.sendFile(resolve(adminDir, "index.html"));
    const fallback = resolve(webDir, "__spa-fallback.html");
    if (!isAdmin && hasWeb && existsSync(fallback)) return res.sendFile(fallback);
    next();
  });
}
