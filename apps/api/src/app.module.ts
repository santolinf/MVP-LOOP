import { Module } from "@nestjs/common";
import { APP_GUARD, APP_PIPE } from "@nestjs/core";
import { ZodValidationPipe } from "nestjs-zod";
import { AuthGuard } from "./common/auth.guard.js";
import { RATE_LIMITS, RateLimitGuard, RateLimitStore } from "./common/rate-limit.js";
import { loadEnv } from "./config/index.js";
import { AdminModule } from "./modules/admin/admin.module.js";
import { AssignmentsModule } from "./modules/assignments/assignments.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { CvModule } from "./modules/cv/cv.module.js";
import { ExtractionModule } from "./modules/extraction/extraction.module.js";
import { FoundingModule } from "./modules/founding/founding.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { MeModule } from "./modules/me/me.module.js";
import { MessagingModule } from "./modules/messaging/messaging.module.js";
import { PrivacyModule } from "./modules/privacy/privacy.module.js";
import { PublicModule } from "./modules/public/public.module.js";
import { ReferralsModule } from "./modules/referrals/referrals.module.js";
import { RewardsModule } from "./modules/rewards/rewards.module.js";

@Module({
  imports: [AuthModule, HealthModule, MeModule, ReferralsModule, FoundingModule, RewardsModule, PublicModule, CvModule, ExtractionModule, AssignmentsModule, PrivacyModule, MessagingModule, AdminModule],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_GUARD, useClass: AuthGuard },
    RateLimitStore,
    {
      provide: RATE_LIMITS,
      useFactory: () => {
        const env = loadEnv();
        return { ip: env.RATE_LIMIT_IP_PER_MIN, account: env.RATE_LIMIT_ACCOUNT_PER_MIN, device: env.RATE_LIMIT_DEVICE_PER_MIN };
      },
    },
    // Registered after AuthGuard so req.contractorId is available for the per-account limit.
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
