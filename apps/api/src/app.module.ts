import { Module } from "@nestjs/common";
import { APP_PIPE } from "@nestjs/core";
import { ZodValidationPipe } from "nestjs-zod";
import { HealthModule } from "./modules/health/health.module.js";
import { MeModule } from "./modules/me/me.module.js";

@Module({ imports: [HealthModule, MeModule], providers: [{ provide: APP_PIPE, useClass: ZodValidationPipe }] })
export class AppModule {}
