import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

function loadEnvironmentFiles(): void {
  if (typeof process.loadEnvFile === "function") {
    const searchPaths = [
      resolve(process.cwd(), ".env"),
      resolve(process.cwd(), "../../.env"),
      resolve(__dirname, "../../../.env"),
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

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_ROLE: z.enum(["all", "api", "worker"]).default("all"),
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().min(1),
    SESSION_SECRET: z.string().min(32).optional(),
    JWT_SECRET: z.string().min(32).optional(),
    EMAIL_FROM: z.string().min(1).default("LOOP <no-reply@loop.local>"),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().default(1025),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    for (const key of ["SESSION_SECRET", "JWT_SECRET"] as const) {
      if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required in production` });
    }
  })
  .transform((env) => ({
    ...env,
    SESSION_SECRET: env.SESSION_SECRET ?? DEV_SECRET,
    JWT_SECRET: env.JWT_SECRET ?? DEV_SECRET,
  }));
export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return EnvSchema.parse(source);
}
