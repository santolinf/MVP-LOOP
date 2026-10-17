import { Module } from "@nestjs/common";
import { APP_PIPE } from "@nestjs/core";
import { ZodValidationPipe } from "nestjs-zod";
import { FoundingModule } from "./modules/founding/founding.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { MeModule } from "./modules/me/me.module.js";
import { PublicModule } from "./modules/public/public.module.js";
import { ReferralsModule } from "./modules/referrals/referrals.module.js";
import { RewardsModule } from "./modules/rewards/rewards.module.js";

@Module({
  imports: [HealthModule, MeModule, ReferralsModule, FoundingModule, RewardsModule, PublicModule],
  providers: [{ provide: APP_PIPE, useClass: ZodValidationPipe }],
})
export class AppModule {}
