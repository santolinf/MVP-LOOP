import "reflect-metadata";
// Must stay before AppModule: importing it loads .env, and @loop/db reads DATABASE_URL at import time.
import { loadEnv } from "./config/index.js";
import { NestFactory } from "@nestjs/core";
import { PgBoss } from "pg-boss";
import { AppModule } from "./app.module.js";
import { ProblemFilter } from "./common/problem.filter.js";
import { registerJobs } from "./jobs/freshness-sweep.job.js";

async function bootstrap() {
  const env = loadEnv();
  if (env.APP_ROLE !== "worker") {
    const app = await NestFactory.create(AppModule);
    app.setGlobalPrefix("api/v1");
    app.useGlobalFilters(new ProblemFilter());
    await app.listen(env.PORT);
  }
  if (env.APP_ROLE !== "api") {
    const boss = new PgBoss(env.DATABASE_URL);
    await boss.start();
    await registerJobs(boss);
  }
}

void bootstrap();
