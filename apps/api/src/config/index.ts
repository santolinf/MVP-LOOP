import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

function loadEnvironmentFiles(): void {
  if (typeof process.loadEnvFile === "function") {
    const searchPaths = [
      resolve(process.cwd(), ".env"),
      resolve(process.cwd(), "../../.env"),
      resolve(import.meta.dirname, "../../../.env"),
    ];

    for (const envPath of searchPaths) {
      if (existsSync(envPath)) {
        try {
          process.loadEnvFile(envPath);
          break;
        } catch {
          // Continue if file is unreadable or malformed
        }
      }
    }
  }
}

loadEnvironmentFiles();

// Dev/test only; production must supply real secrets (from Secrets Manager).
const DEV_SECRET = "dev-only-secret-do-not-use-in-production-0000";

const csvList = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_ROLE: z.enum(["all", "api", "worker"]).default("all"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.string().min(1),
    SESSION_SECRET: z.string().min(32).optional(),
    JWT_SECRET: z.string().min(32).optional(),
    EMAIL_FROM: z.string().min(1).default("LOOP <no-reply@loop.local>"),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().default(1025),
    /** Postmark server token. When set, email goes through Postmark (OQ4); SMTP stays the local Mailpit path. */
    POSTMARK_SERVER_TOKEN: z.string().min(1).optional(),
    /** Shared secret for the Postmark bounce/complaint webhook (HTTP Basic auth password). */
    POSTMARK_WEBHOOK_SECRET: z.string().min(16).optional(),
    /** Public origin of the site, used to build links in emails. */
    APP_BASE_URL: z.string().url().default("http://localhost:3000"),
    /** Phase 8: how long a one-touch confirm link stays valid. */
    CONFIRM_LINK_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(72),
    /** Phase 10: staff IP allow-list (exact IPs or IPv4 CIDRs, comma separated). Empty = unrestricted here (use the edge). */
    ADMIN_IP_ALLOWLIST: csvList,
    /** Browser origins allowed for cross-origin API calls (comma separated). Same-origin needs none. */
    CORS_ORIGINS: csvList,
    /** Number of reverse-proxy hops to trust for client IP (ALB/CloudFront). 0 = none. */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    /** Global per-IP request budget per minute (complements the OTP-specific limits). */
    RATE_LIMIT_IP_PER_MIN: z.coerce.number().int().min(1).default(300),
    /** Global per-account (authenticated contractor) request budget per minute. */
    RATE_LIMIT_ACCOUNT_PER_MIN: z.coerce.number().int().min(1).default(600),
    /** Global per-device (x-device-id header) request budget per minute. */
    RATE_LIMIT_DEVICE_PER_MIN: z.coerce.number().int().min(1).default(300),
    /** S3-compatible private bucket for CV files (MinIO locally). Personal data: UK region only. */
    S3_ENDPOINT: z.string().min(1).optional(),
    S3_REGION: z.string().min(1).default("eu-west-2"),
    S3_BUCKET: z.string().min(1).default("loop-cv"),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    S3_FORCE_PATH_STYLE: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    CLAMAV_HOST: z.string().min(1).default("localhost"),
    CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
    // TODO(spec): final CV limits are set by the business (OQ2); these are placeholders.
    CV_MAX_BYTES_ANON: z.coerce.number().int().min(1).default(5 * 1024 * 1024),
    CV_MAX_BYTES_AUTH: z.coerce.number().int().min(1).default(10 * 1024 * 1024),
    CV_ORPHAN_TTL_HOURS: z.coerce.number().int().min(1).default(24),
    /** Presigned URL lifetime in seconds (upload and download). */
    CV_PRESIGN_TTL_SECONDS: z.coerce.number().int().min(30).max(900).default(300),
    /** Anonymous upload quotas: per IP per hour, and across all anonymous users per hour. */
    CV_ANON_UPLOADS_PER_IP_PER_HOUR: z.coerce.number().int().min(1).default(5),
    CV_ANON_UPLOADS_GLOBAL_PER_HOUR: z.coerce.number().int().min(1).default(500),
    // TODO(spec): extraction thresholds are placeholders until the LLM vendor and accuracy bar are set (OQ4).
    EXTRACTION_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.5),
    /** Fewer readable characters than this means the "couldn't read this CV" fallback. */
    EXTRACTION_MIN_CHARS: z.coerce.number().int().min(1).default(200),
    /** Cap on CV text handed to the LLM provider (data minimisation). */
    EXTRACTION_MAX_TEXT_CHARS: z.coerce.number().int().min(1000).default(60000),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    for (const key of ["SESSION_SECRET", "JWT_SECRET"] as const) {
      const value = env[key];
      if (!value) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required in production` });
      else if (value === DEV_SECRET)
        ctx.addIssue({ code: "custom", path: [key], message: `${key} must not be the development secret` });
    }
    if (!env.SMTP_HOST && !env.POSTMARK_SERVER_TOKEN)
      ctx.addIssue({ code: "custom", path: ["POSTMARK_SERVER_TOKEN"], message: "POSTMARK_SERVER_TOKEN (or SMTP_HOST) is required in production" });
    if (env.POSTMARK_SERVER_TOKEN && !env.POSTMARK_WEBHOOK_SECRET)
      ctx.addIssue({ code: "custom", path: ["POSTMARK_WEBHOOK_SECRET"], message: "POSTMARK_WEBHOOK_SECRET is required with POSTMARK_SERVER_TOKEN" });
    for (const key of ["S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
      if (!env[key])
        ctx.addIssue({ code: "custom", path: [key], message: `${key} is required in production` });
    }
    for (const origin of env.CORS_ORIGINS) {
      if (origin === "*" || !/^https:\/\/[^/\s]+$/.test(origin))
        ctx.addIssue({
          code: "custom",
          path: ["CORS_ORIGINS"],
          message: "CORS_ORIGINS must be exact https origins (no wildcard, path or trailing slash) in production",
        });
    }
  })
  .transform((env) => ({
    ...env,
    SESSION_SECRET: env.SESSION_SECRET ?? DEV_SECRET,
    JWT_SECRET: env.JWT_SECRET ?? DEV_SECRET,
    production: env.NODE_ENV === "production",
  }));
export type Env = z.infer<typeof EnvSchema>;

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid configuration:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

/**
 * Validates the environment and fails closed: throws ConfigError listing every problem by variable
 * name and rule only. Values are never echoed, so a bad secret cannot leak into boot logs.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((i) => `${i.path.join(".") || "(env)"}: ${i.message}`));
  }
  return result.data;
}
