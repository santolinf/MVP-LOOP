import "reflect-metadata";
// Must stay before AppModule: importing it loads .env, and @loop/db reads DATABASE_URL at import time.
import { ConfigError, loadEnv, type Env } from "./config/index.js";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { PgBoss } from "pg-boss";
import { AppModule } from "./app.module.js";
import { ProblemFilter } from "./common/problem.filter.js";
import { buildCsp, cors, inlineScriptHashes, securityHeaders } from "./common/security.js";
import { registerCvOrphanCleanup } from "./jobs/cv-orphan-cleanup.job.js";
import { registerCvRescan } from "./jobs/cv-rescan.job.js";
import { registerPrivacyErase } from "./jobs/privacy-erase.job.js";
import { registerCvExtract } from "./jobs/cv-extract.job.js";
import { registerJobs } from "./jobs/freshness-sweep.job.js";
import { registerCampaignSend } from "./jobs/campaign-send.job.js";
import { registerReminderSweep } from "./jobs/reminder-sweep.job.js";
import { registerRateLimitCleanup } from "./jobs/rate-limit-cleanup.job.js";
import { StorageService } from "./modules/cv/storage.service.js";
import { serveStatic } from "./static.js";

async function bootstrap() {
  let env: Env;
  try {
    env = loadEnv();
  } catch (err) {
    if (err instanceof ConfigError) {
      // Fail closed: names and rules only, never values.
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
  if (env.APP_ROLE !== "worker") {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    app.disable("x-powered-by");
    if (env.TRUST_PROXY_HOPS > 0) app.set("trust proxy", env.TRUST_PROXY_HOPS);
    app.useBodyParser("json", { limit: "100kb" });
    app.useBodyParser("urlencoded", { extended: false, limit: "100kb" });
    // Browsers upload CVs straight to the object store, so its origin must be allowed in connect-src.
    const storageOrigin = await new StorageService(env).browserOrigin();
    app.use(securityHeaders({ csp: buildCsp(inlineScriptHashes(process.cwd()), env.production, [storageOrigin]), production: env.production }));
    app.use(cors(env.CORS_ORIGINS));
    app.setGlobalPrefix("api/v1");
    app.useGlobalFilters(new ProblemFilter());
    serveStatic(app, process.cwd());
    await app.listen(env.PORT);
  }
  if (env.APP_ROLE !== "api") {
    const boss = new PgBoss(env.DATABASE_URL);
    await boss.start();
    await registerJobs(boss);
    await registerReminderSweep(boss);
    await registerCampaignSend(boss);
    await registerRateLimitCleanup(boss);
    await registerCvOrphanCleanup(boss);
    await registerCvRescan(boss);
    await registerCvExtract(boss);
    await registerPrivacyErase(boss);
  }
}

void bootstrap();
