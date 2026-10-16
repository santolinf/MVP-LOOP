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

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ROLE: z.enum(["all", "api", "worker"]).default("all"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
});
export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return EnvSchema.parse(source);
}
