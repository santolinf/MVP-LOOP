import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AuditService } from "../../common/audit.service.js";
import { RateLimitStore } from "../../common/rate-limit.js";
import { ConsentModule } from "../consent/consent.module.js";
import { FoundingModule } from "../founding/founding.module.js";
import { MeModule } from "../me/me.module.js";
import { MessagingModule } from "../messaging/messaging.module.js";
import { RewardsModule } from "../rewards/rewards.module.js";
import { AdminCampaignsService } from "./admin-campaigns.service.js";
import { AdminCommsService } from "./admin-comms.service.js";
import { AdminContractorsController, AdminAvailabilityController } from "./admin-contractors.controller.js";
import { AdminContractorsService } from "./admin-contractors.service.js";
import { AdminIntroductionsService } from "./admin-introductions.service.js";
import {
  AdminAuditController,
  AdminCampaignsController,
  AdminCommsController,
  AdminIntroductionsController,
  AdminOverviewController,
  AdminReviewsController,
  AdminRewardsController,
  AdminStaffController,
} from "./admin-ops.controller.js";
import { AdminOverviewService } from "./admin-overview.service.js";
import { AdminReviewsService } from "./admin-reviews.service.js";
import { AdminRewardsService } from "./admin-rewards.service.js";
import { AdminStaffService } from "./admin-staff.service.js";
import { StaffAuditInterceptor } from "./staff-audit.interceptor.js";
import { StaffAuthController } from "./staff-auth.controller.js";
import { StaffAuthService } from "./staff-auth.service.js";
import { StaffSessionService } from "./staff-session.service.js";
import { StaffGuard } from "./staff.guard.js";

/**
 * Phase 10 admin and operations. A separate auth realm from contractors: StaffGuard (global, but only acting on
 * @StaffController routes) enforces IP allow-list, staff session + TOTP, CSRF and per-route permission.
 */
@Module({
  imports: [ConsentModule, MeModule, MessagingModule, FoundingModule, RewardsModule],
  controllers: [
    StaffAuthController,
    AdminOverviewController,
    AdminContractorsController,
    AdminAvailabilityController,
    AdminIntroductionsController,
    AdminRewardsController,
    AdminCommsController,
    AdminCampaignsController,
    AdminReviewsController,
    AdminStaffController,
    AdminAuditController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: StaffGuard },
    { provide: APP_INTERCEPTOR, useClass: StaffAuditInterceptor },
    AuditService,
    RateLimitStore,
    StaffSessionService,
    StaffAuthService,
    AdminOverviewService,
    AdminContractorsService,
    AdminIntroductionsService,
    AdminRewardsService,
    AdminCommsService,
    AdminCampaignsService,
    AdminReviewsService,
    AdminStaffService,
  ],
})
export class AdminModule {}
