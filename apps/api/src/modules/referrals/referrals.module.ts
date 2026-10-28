import { Module } from "@nestjs/common";
import { RateLimitStore } from "../../common/rate-limit.js";
import { AuditService } from "../../common/audit.service.js";
import { FoundingModule } from "../founding/founding.module.js";
import { ReferralsController } from "./referrals.controller.js";
import { ReferralsService } from "./referrals.service.js";

@Module({
  imports: [FoundingModule],
  controllers: [ReferralsController],
  providers: [ReferralsService, AuditService, RateLimitStore],
  exports: [ReferralsService],
})
export class ReferralsModule {}
