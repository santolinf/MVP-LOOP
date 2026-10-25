import { pino, type Logger, type LoggerOptions } from "pino";

/** Keys whose values are never logged, at any of the first three nesting levels. */
const SENSITIVE_KEYS = [
  "email",
  "to",
  "phone",
  "mobile",
  "name",
  "firstName",
  "lastName",
  "token",
  "accessToken",
  "refreshToken",
  "sessionToken",
  "csrfToken",
  "otp",
  "code",
  "password",
  "secret",
  "authorization",
  "cookie",
  "cvText",
  "text",
  "html",
  "body",
];

export const REDACT_PATHS = [
  ...SENSITIVE_KEYS.flatMap((k) => [k, `*.${k}`, `*.*.${k}`]),
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
// UK mobile/landline in national or international form, with optional spaces or dashes.
const PHONE = /(?:\+44|0044|\b0)[\s-]?\d(?:[\s-]?\d){8,10}\b/g;
// OTP-style codes: 6 digits standing alone.
const OTP = /\b\d{6}\b/g;
// Long opaque tokens (hex / base64url), 32+ chars.
const TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g;

/** Free-text scrubber for message strings and error text. Names cannot be detected reliably, so callers must not put them in messages. */
export function scrub(value: string): string {
  return value
    .replace(EMAIL, "[email]")
    .replace(PHONE, "[phone]")
    .replace(TOKEN, "[token]")
    .replace(OTP, "[code]");
}

export function loggerOptions(level = process.env["LOG_LEVEL"] ?? "info"): LoggerOptions {
  return {
    level,
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    formatters: {
      log(object) {
        // Scrub string values that slipped through under non-sensitive keys (e.g. err.message).
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(object)) out[k] = typeof v === "string" ? scrub(v) : v;
        return out;
      },
    },
    hooks: {
      logMethod(args, method) {
        const [first, ...rest] = args;
        if (typeof first === "string") return method.apply(this, [scrub(first), ...rest] as never);
        if (typeof rest[0] === "string") return method.apply(this, [first, scrub(rest[0]), ...rest.slice(1)] as never);
        return method.apply(this, args);
      },
    },
  };
}

export function createLogger(destination?: NodeJS.WritableStream): Logger {
  return destination ? pino(loggerOptions(), destination) : pino(loggerOptions());
}

export const logger = createLogger();
