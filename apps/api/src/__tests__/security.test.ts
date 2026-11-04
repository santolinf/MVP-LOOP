import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCsp, cors, inlineScriptHashes, securityHeaders } from "../common/security.js";
import { ConfigError, loadEnv } from "../config/index.js";

function fakeRes() {
  const headers: Record<string, string> = {};
  const res = {
    headers,
    statusCode: 200,
    ended: false,
    setHeader: (k: string, v: string) => void (headers[k.toLowerCase()] = v),
    append: (k: string, v: string) => void (headers[k.toLowerCase()] = v),
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    end() {
      res.ended = true;
    },
  };
  return res;
}

describe("inlineScriptHashes / buildCsp", () => {
  it("hashes inline scripts only and never allows unsafe-inline scripts", () => {
    const root = mkdtempSync(join(tmpdir(), "csp-"));
    mkdirSync(join(root, "web"));
    writeFileSync(
      join(root, "web", "index.html"),
      `<script>window.a=1</script><script type="module" src="/x.js"></script>`,
    );
    const hash = `'sha256-${createHash("sha256").update("window.a=1").digest("base64")}'`;
    expect(inlineScriptHashes(root)).toEqual([hash]);
    const csp = buildCsp([hash], true);
    expect(csp).toContain(`script-src 'self' ${hash}`);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).toContain("connect-src 'self';");
  });

  it("allows the object store origin in connect-src so browsers can upload CVs directly", () => {
    const csp = buildCsp([], false, ["http://localhost:9000"]);
    expect(csp).toContain("connect-src 'self' http://localhost:9000;");
    expect(csp).toContain("default-src 'self'");
  });
});

describe("securityHeaders", () => {
  it("sets hardening headers, HSTS only in production, and no-store for the API", () => {
    const prod = fakeRes();
    securityHeaders({ csp: "default-src 'self'", production: true })(
      { method: "GET", path: "/api/v1/me", headers: {} },
      prod,
      () => undefined,
    );
    expect(prod.headers["content-security-policy"]).toBe("default-src 'self'");
    expect(prod.headers["x-content-type-options"]).toBe("nosniff");
    expect(prod.headers["strict-transport-security"]).toContain("max-age=");
    expect(prod.headers["cache-control"]).toBe("no-store");

    const dev = fakeRes();
    securityHeaders({ csp: "x", production: false })({ method: "GET", path: "/", headers: {} }, dev, () => undefined);
    expect(dev.headers["strict-transport-security"]).toBeUndefined();
    expect(dev.headers["cache-control"]).toBeUndefined();
  });
});

describe("cors", () => {
  const mw = cors(["https://app.loop.test"]);
  it("allows a listed origin and answers preflight", () => {
    const res = fakeRes();
    let nexted = false;
    mw({ method: "OPTIONS", path: "/api/v1/me", headers: { origin: "https://app.loop.test" } }, res, () => (nexted = true));
    expect(res.headers["access-control-allow-origin"]).toBe("https://app.loop.test");
    expect(res.statusCode).toBe(204);
    expect(nexted).toBe(false);
  });
  it("gives unknown origins no CORS headers", () => {
    const res = fakeRes();
    let nexted = false;
    mw({ method: "GET", path: "/api/v1/me", headers: { origin: "https://evil.test" } }, res, () => (nexted = true));
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(nexted).toBe(true);
  });
});

describe("loadEnv (fails closed)", () => {
  const base = { DATABASE_URL: "postgres://u:p@h/db" };
  it("accepts a dev environment with defaults", () => {
    expect(loadEnv(base).production).toBe(false);
  });
  it("rejects production without secrets, with wildcard CORS, and never echoes values", () => {
    const bad = "wildcard-secret-value";
    try {
      loadEnv({ ...base, NODE_ENV: "production", CORS_ORIGINS: "*", SESSION_SECRET: bad });
      throw new Error("expected ConfigError");
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const message = (err as ConfigError).message;
      expect(message).toContain("JWT_SECRET");
      expect(message).toContain("SMTP_HOST");
      expect(message).toContain("CORS_ORIGINS");
      expect(message).not.toContain(bad);
    }
  });
  it("accepts a complete production environment", () => {
    const env = loadEnv({
      ...base,
      NODE_ENV: "production",
      SESSION_SECRET: "s".repeat(40),
      JWT_SECRET: "j".repeat(40),
      SMTP_HOST: "smtp.example.com",
      SMTP_USER: "smtp-user",
      SMTP_PASSWORD: "smtp-password",
      S3_REGION: "eu-west-2",
      S3_ACCESS_KEY_ID: "test-access-key",
      S3_SECRET_ACCESS_KEY: "test-secret-key",
      CLAMAV_URL: "https://clamav-scanner-abc.a.run.app",
      CLAMAV_AUTH_TOKEN: "c".repeat(40),
      CORS_ORIGINS: "https://app.loop.test",
    });
    expect(env.CORS_ORIGINS).toEqual(["https://app.loop.test"]);
  });
  describe("production SMTP", () => {
    const prod = {
      ...base,
      NODE_ENV: "production",
      SESSION_SECRET: "s".repeat(40),
      JWT_SECRET: "j".repeat(40),
      S3_REGION: "eu-west-2",
      S3_ACCESS_KEY_ID: "test-access-key",
      S3_SECRET_ACCESS_KEY: "test-secret-key",
      CLAMAV_URL: "https://clamav-scanner-abc.a.run.app",
      CLAMAV_AUTH_TOKEN: "c".repeat(40),
      SMTP_HOST: "smtp.example.com",
    };
    it("defaults to starttls and requires credentials", () => {
      expect(() => loadEnv(prod)).toThrow(/SMTP_USER[\s\S]*SMTP_PASSWORD/);
      const env = loadEnv({ ...prod, SMTP_USER: "u", SMTP_PASSWORD: "p" });
      expect(env.SMTP_TLS).toBe("starttls");
    });
    it("refuses plain-text SMTP", () => {
      expect(() => loadEnv({ ...prod, SMTP_USER: "u", SMTP_PASSWORD: "p", SMTP_TLS: "none" })).toThrow(/SMTP_TLS/);
    });
    it("does not demand SMTP settings when Postmark is the provider", () => {
      const env = loadEnv({ ...prod, POSTMARK_SERVER_TOKEN: "tok", POSTMARK_WEBHOOK_SECRET: "w".repeat(20) });
      expect(env.SMTP_TLS).toBe("starttls");
    });
  });
  it("rejects production without the ClamAV scanner settings", () => {
    expect(() =>
      loadEnv({
        ...base,
        NODE_ENV: "production",
        SESSION_SECRET: "s".repeat(40),
        JWT_SECRET: "j".repeat(40),
        SMTP_HOST: "smtp.example.com",
        S3_ACCESS_KEY_ID: "test-access-key",
        S3_SECRET_ACCESS_KEY: "test-secret-key",
      }),
    ).toThrow(/CLAMAV_URL[\s\S]*CLAMAV_AUTH_TOKEN/);
  });
});
