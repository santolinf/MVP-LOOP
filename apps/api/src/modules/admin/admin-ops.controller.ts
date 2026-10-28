import { Body, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Put, Query } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
// Explicit pipes: the dev runner (tsx/esbuild) emits no param types, so the global pipe cannot coerce query strings.
import { createZodDto, ZodValidationPipe } from "nestjs-zod";
import {
  AdminAuditListSchema,
  AdminCampaignDecisionSchema,
  AdminCampaignListSchema,
  AdminCampaignPreviewResultSchema,
  AdminCampaignPreviewSchema,
  AdminCampaignQuerySchema,
  AdminCampaignSchema,
  AdminCampaignSettingsSchema,
  AdminCreateCampaignSchema,
  AdminDeliveryListSchema,
  AdminDeliveryQuerySchema,
  AdminFoundingTrackerQuerySchema,
  AdminFoundingTrackerSchema,
  AdminProfileChangeListSchema,
  AdminProfileChangeQuerySchema,
  AdminPublishCampaignSettingsSchema,
  AdminAuditQuerySchema,
  AdminCreateStaffSchema,
  AdminCreateTemplateSchema,
  AdminFoundingSchema,
  AdminNewTemplateVersionSchema,
  AdminOkSchema,
  AdminOverrideIntroducerSchema,
  AdminOverviewSchema,
  AdminPublishReminderConfigSchema,
  AdminRecordVerificationSchema,
  AdminReferralListSchema,
  AdminReferralQuerySchema,
  AdminReminderConfigSchema,
  AdminResolveFlagSchema,
  AdminRewardListSchema,
  AdminRewardQuerySchema,
  AdminRewardRowSchema,
  AdminStaffListSchema,
  AdminStaffSchema,
  AdminTemplateDetailSchema,
  AdminTemplateListSchema,
  AdminUpdateStaffSchema,
} from "@loop/contracts";
import { AdminCampaignsService } from "./admin-campaigns.service.js";
import { AdminCommsService } from "./admin-comms.service.js";
import { AdminIntroductionsService } from "./admin-introductions.service.js";
import { AdminOverviewService } from "./admin-overview.service.js";
import { AdminReviewsService } from "./admin-reviews.service.js";
import { AdminRewardsService } from "./admin-rewards.service.js";
import { AdminStaffService } from "./admin-staff.service.js";
import { ApiQueries, AuditAccess, CurrentStaff, PAGE_QUERY, RequirePermission, StaffController, type StaffPrincipal } from "./staff-access.js";

class AdminOverviewDto extends createZodDto(AdminOverviewSchema) {}
class AdminOkDto extends createZodDto(AdminOkSchema) {}
class AdminReferralQueryDto extends createZodDto(AdminReferralQuerySchema) {}
class AdminReferralListDto extends createZodDto(AdminReferralListSchema) {}
class AdminFoundingDto extends createZodDto(AdminFoundingSchema) {}
class AdminOverrideDto extends createZodDto(AdminOverrideIntroducerSchema) {}
class AdminResolveFlagDto extends createZodDto(AdminResolveFlagSchema) {}
class AdminRewardQueryDto extends createZodDto(AdminRewardQuerySchema) {}
class AdminRewardListDto extends createZodDto(AdminRewardListSchema) {}
class AdminRewardRowDto extends createZodDto(AdminRewardRowSchema) {}
class AdminRecordVerificationDto extends createZodDto(AdminRecordVerificationSchema) {}
class AdminTemplateListDto extends createZodDto(AdminTemplateListSchema) {}
class AdminTemplateDetailDto extends createZodDto(AdminTemplateDetailSchema) {}
class AdminNewTemplateVersionDto extends createZodDto(AdminNewTemplateVersionSchema) {}
class AdminCreateTemplateDto extends createZodDto(AdminCreateTemplateSchema) {}
class AdminReminderConfigDto extends createZodDto(AdminReminderConfigSchema) {}
class AdminPublishReminderConfigDto extends createZodDto(AdminPublishReminderConfigSchema) {}
class AdminStaffListDto extends createZodDto(AdminStaffListSchema) {}
class AdminStaffDto extends createZodDto(AdminStaffSchema) {}
class AdminCreateStaffDto extends createZodDto(AdminCreateStaffSchema) {}
class AdminUpdateStaffDto extends createZodDto(AdminUpdateStaffSchema) {}
class AdminAuditQueryDto extends createZodDto(AdminAuditQuerySchema) {}
class AdminAuditListDto extends createZodDto(AdminAuditListSchema) {}
class AdminCampaignPreviewDto extends createZodDto(AdminCampaignPreviewSchema) {}
class AdminCampaignPreviewResultDto extends createZodDto(AdminCampaignPreviewResultSchema) {}
class AdminCreateCampaignDto extends createZodDto(AdminCreateCampaignSchema) {}
class AdminCampaignDto extends createZodDto(AdminCampaignSchema) {}
class AdminCampaignQueryDto extends createZodDto(AdminCampaignQuerySchema) {}
class AdminCampaignListDto extends createZodDto(AdminCampaignListSchema) {}
class AdminCampaignDecisionDto extends createZodDto(AdminCampaignDecisionSchema) {}
class AdminDeliveryQueryDto extends createZodDto(AdminDeliveryQuerySchema) {}
class AdminDeliveryListDto extends createZodDto(AdminDeliveryListSchema) {}
class AdminCampaignSettingsDto extends createZodDto(AdminCampaignSettingsSchema) {}
class AdminPublishCampaignSettingsDto extends createZodDto(AdminPublishCampaignSettingsSchema) {}
class AdminFoundingTrackerQueryDto extends createZodDto(AdminFoundingTrackerQuerySchema) {}
class AdminFoundingTrackerDto extends createZodDto(AdminFoundingTrackerSchema) {}
class AdminProfileChangeQueryDto extends createZodDto(AdminProfileChangeQuerySchema) {}
class AdminProfileChangeListDto extends createZodDto(AdminProfileChangeListSchema) {}

@ApiTags("admin-overview")
@StaffController("overview")
export class AdminOverviewController {
  constructor(@Inject(AdminOverviewService) private readonly svc: AdminOverviewService) {}

  @Get()
  @RequirePermission("contractors.read")
  @ApiOperation({ operationId: "adminOverview" })
  @ApiOkResponse({ type: AdminOverviewDto })
  overview(): Promise<AdminOverviewDto> {
    return this.svc.overview();
  }
}

@ApiTags("admin-introductions")
@StaffController("introductions")
export class AdminIntroductionsController {
  constructor(@Inject(AdminIntroductionsService) private readonly svc: AdminIntroductionsService) {}

  @Get()
  @RequirePermission("introductions.read")
  @AuditAccess({ entityType: "Referral", action: "introductions.listed" })
  @ApiOperation({ operationId: "adminListIntroductions" })
  @ApiQueries({ name: "flagged", enum: ["true", "false"] }, ...PAGE_QUERY)
  @ApiOkResponse({ type: AdminReferralListDto })
  list(@Query(new ZodValidationPipe(AdminReferralQuerySchema)) q: AdminReferralQueryDto): Promise<AdminReferralListDto> {
    return this.svc.list(q);
  }

  @Get("founding")
  @RequirePermission("introductions.read")
  @AuditAccess({ entityType: "FoundingCounter", action: "founding.viewed" })
  @ApiOperation({ operationId: "adminFounding" })
  @ApiOkResponse({ type: AdminFoundingDto })
  founding(): Promise<AdminFoundingDto> {
    return this.svc.foundingSummary();
  }

  @Post(":id/override")
  @HttpCode(200)
  @RequirePermission("introductions.override")
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ operationId: "adminOverrideIntroducer" })
  @ApiBody({ type: AdminOverrideDto })
  @ApiOkResponse({ type: AdminOkDto })
  override(@Param("id", ParseUUIDPipe) id: string, @Body() body: AdminOverrideDto, @CurrentStaff() staff: StaffPrincipal): Promise<AdminOkDto> {
    return this.svc.overrideIntroducer(id, body, staff);
  }

  @Post("flags/:id/resolve")
  @HttpCode(200)
  @RequirePermission("introductions.review")
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ operationId: "adminResolveReferralFlag" })
  @ApiBody({ type: AdminResolveFlagDto })
  @ApiOkResponse({ type: AdminOkDto })
  resolveFlag(@Param("id", ParseUUIDPipe) id: string, @Body() body: AdminResolveFlagDto, @CurrentStaff() staff: StaffPrincipal): Promise<AdminOkDto> {
    return this.svc.resolveFlag(id, body, staff);
  }
}

@ApiTags("admin-rewards")
@StaffController("rewards")
export class AdminRewardsController {
  constructor(@Inject(AdminRewardsService) private readonly svc: AdminRewardsService) {}

  @Get()
  @RequirePermission("rewards.read")
  @AuditAccess({ entityType: "Reward", action: "rewards.listed" })
  @ApiOperation({ operationId: "adminListRewards" })
  @ApiQueries({ name: "status", enum: ["PENDING", "UNDER_VERIFICATION", "APPROVED", "PAID"] }, ...PAGE_QUERY)
  @ApiOkResponse({ type: AdminRewardListDto })
  list(@Query(new ZodValidationPipe(AdminRewardQuerySchema)) q: AdminRewardQueryDto, @CurrentStaff() staff: StaffPrincipal): Promise<AdminRewardListDto> {
    return this.svc.list(q, staff);
  }

  @Post(":id/verification")
  @HttpCode(200)
  @RequirePermission("rewards.verify")
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ operationId: "adminRecordRewardVerification" })
  @ApiBody({ type: AdminRecordVerificationDto })
  @ApiOkResponse({ type: AdminRewardRowDto })
  verify(@Param("id", ParseUUIDPipe) id: string, @Body() body: AdminRecordVerificationDto, @CurrentStaff() staff: StaffPrincipal): Promise<AdminRewardRowDto> {
    return this.svc.recordVerification(id, body, staff);
  }

  @Post(":id/approve")
  @HttpCode(200)
  @RequirePermission("rewards.approve")
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ operationId: "adminApproveReward" })
  @ApiOkResponse({ type: AdminRewardRowDto })
  approve(@Param("id", ParseUUIDPipe) id: string, @CurrentStaff() staff: StaffPrincipal): Promise<AdminRewardRowDto> {
    return this.svc.approve(id, staff);
  }
}

@ApiTags("admin-comms")
@StaffController("comms")
export class AdminCommsController {
  constructor(@Inject(AdminCommsService) private readonly svc: AdminCommsService) {}

  @Get("templates")
  @RequirePermission("comms.read")
  @ApiOperation({ operationId: "adminListTemplates" })
  @ApiOkResponse({ type: AdminTemplateListDto })
  templates(): Promise<AdminTemplateListDto> {
    return this.svc.listTemplates();
  }

  @Post("templates")
  @HttpCode(200)
  @RequirePermission("comms.manage_templates")
  @ApiOperation({ operationId: "adminCreateTemplate" })
  @ApiBody({ type: AdminCreateTemplateDto })
  @ApiOkResponse({ type: AdminTemplateDetailDto })
  create(@Body() body: AdminCreateTemplateDto, @CurrentStaff() staff: StaffPrincipal): Promise<AdminTemplateDetailDto> {
    return this.svc.createTemplate(body, staff);
  }

  @Get("templates/:key")
  @RequirePermission("comms.read")
  @ApiParam({ name: "key", type: String })
  @ApiOperation({ operationId: "adminGetTemplate" })
  @ApiOkResponse({ type: AdminTemplateDetailDto })
  template(@Param("key") key: string): Promise<AdminTemplateDetailDto> {
    return this.svc.templateDetail(key);
  }

  @Post("templates/:key/versions")
  @HttpCode(200)
  @RequirePermission("comms.manage_templates")
  @ApiParam({ name: "key", type: String })
  @ApiOperation({ operationId: "adminPublishTemplateVersion" })
  @ApiBody({ type: AdminNewTemplateVersionDto })
  @ApiOkResponse({ type: AdminTemplateDetailDto })
  publish(@Param("key") key: string, @Body() body: AdminNewTemplateVersionDto, @CurrentStaff() staff: StaffPrincipal): Promise<AdminTemplateDetailDto> {
    return this.svc.newVersion(key, body, staff);
  }

  @Get("reminder-schedule")
  @RequirePermission("config.read")
  @ApiOperation({ operationId: "adminGetReminderSchedule" })
  @ApiOkResponse({ type: AdminReminderConfigDto })
  schedule(): Promise<AdminReminderConfigDto> {
    return this.svc.reminderConfig();
  }

  @Put("reminder-schedule")
  @RequirePermission("config.write")
  @ApiOperation({ operationId: "adminPublishReminderSchedule" })
  @ApiBody({ type: AdminPublishReminderConfigDto })
  @ApiOkResponse({ type: AdminReminderConfigDto })
  publishSchedule(@Body() body: AdminPublishReminderConfigDto, @CurrentStaff() staff: StaffPrincipal): Promise<AdminReminderConfigDto> {
    return this.svc.publishReminderConfig(body, staff);
  }
}

@ApiTags("admin-campaigns")
@StaffController("comms/campaigns")
export class AdminCampaignsController {
  constructor(@Inject(AdminCampaignsService) private readonly svc: AdminCampaignsService) {}

  @Get()
  @RequirePermission("comms.read")
  @AuditAccess({ entityType: "Campaign", action: "campaigns.listed" })
  @ApiOperation({ operationId: "adminListCampaigns" })
  @ApiQueries({ name: "status", enum: ["PENDING_APPROVAL", "SENDING", "SENT", "REJECTED", "CANCELLED"] }, ...PAGE_QUERY)
  @ApiOkResponse({ type: AdminCampaignListDto })
  list(@Query(new ZodValidationPipe(AdminCampaignQuerySchema)) q: AdminCampaignQueryDto, @CurrentStaff() staff: StaffPrincipal): Promise<AdminCampaignListDto> {
    return this.svc.list(q, staff);
  }

  @Post("preview")
  @HttpCode(200)
  @RequirePermission("comms.send_message")
  @ApiOperation({ operationId: "adminPreviewCampaignAudience" })
  @ApiBody({ type: AdminCampaignPreviewDto })
  @ApiOkResponse({ type: AdminCampaignPreviewResultDto })
  preview(@Body() body: AdminCampaignPreviewDto, @CurrentStaff() staff: StaffPrincipal): Promise<AdminCampaignPreviewResultDto> {
    return this.svc.preview(body, staff);
  }

  @Post()
  @HttpCode(200)
  @RequirePermission("comms.send_message")
  @ApiOperation({ operationId: "adminCreateCampaign" })
  @ApiBody({ type: AdminCreateCampaignDto })
  @ApiOkResponse({ type: AdminCampaignDto })
  create(@Body() body: AdminCreateCampaignDto, @CurrentStaff() staff: StaffPrincipal): Promise<AdminCampaignDto> {
    return this.svc.create(body, staff);
  }

  @Get("settings")
  @RequirePermission("config.read")
  @AuditAccess({ entityType: "CampaignSettings", action: "campaign_settings.viewed" })
  @ApiOperation({ operationId: "adminGetCampaignSettings" })
  @ApiOkResponse({ type: AdminCampaignSettingsDto })
  settings(): Promise<AdminCampaignSettingsDto> {
    return this.svc.settings();
  }

  @Put("settings")
  @RequirePermission("config.write")
  @ApiOperation({ operationId: "adminPublishCampaignSettings" })
  @ApiBody({ type: AdminPublishCampaignSettingsDto })
  @ApiOkResponse({ type: AdminCampaignSettingsDto })
  publishSettings(@Body() body: AdminPublishCampaignSettingsDto, @CurrentStaff() staff: StaffPrincipal): Promise<AdminCampaignSettingsDto> {
    return this.svc.publishSettings(body, staff);
  }

  @Get(":id")
  @RequirePermission("comms.read")
  @AuditAccess({ entityType: "Campaign", idParam: "id", action: "campaign.viewed" })
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ operationId: "adminGetCampaign" })
  @ApiOkResponse({ type: AdminCampaignDto })
  get(@Param("id", ParseUUIDPipe) id: string, @CurrentStaff() staff: StaffPrincipal): Promise<AdminCampaignDto> {
    return this.svc.detail(id, staff);
  }

  @Get(":id/deliveries")
  @RequirePermission("comms.read")
  @AuditAccess({ entityType: "Campaign", idParam: "id", action: "campaign.delivery_log_viewed" })
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ operationId: "adminListCampaignDeliveries" })
  @ApiQueries({ name: "status", enum: ["QUEUED", "SENT", "FAILED", "SKIPPED"] }, ...PAGE_QUERY)
  @ApiOkResponse({ type: AdminDeliveryListDto })
  deliveries(@Param("id", ParseUUIDPipe) id: string, @Query(new ZodValidationPipe(AdminDeliveryQuerySchema)) q: AdminDeliveryQueryDto): Promise<AdminDeliveryListDto> {
    return this.svc.deliveries(id, q);
  }

  @Post(":id/approve")
  @HttpCode(200)
  @RequirePermission("comms.approve")
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ operationId: "adminApproveCampaign" })
  @ApiBody({ type: AdminCampaignDecisionDto })
  @ApiOkResponse({ type: AdminCampaignDto })
  approve(@Param("id", ParseUUIDPipe) id: string, @Body() body: AdminCampaignDecisionDto, @CurrentStaff() staff: StaffPrincipal): Promise<AdminCampaignDto> {
    return this.svc.approve(id, body, staff);
  }

  @Post(":id/reject")
  @HttpCode(200)
  @RequirePermission("comms.approve")
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ operationId: "adminRejectCampaign" })
  @ApiBody({ type: AdminCampaignDecisionDto })
  @ApiOkResponse({ type: AdminCampaignDto })
  reject(@Param("id", ParseUUIDPipe) id: string, @Body() body: AdminCampaignDecisionDto, @CurrentStaff() staff: StaffPrincipal): Promise<AdminCampaignDto> {
    return this.svc.reject(id, body, staff);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @RequirePermission("comms.send_message")
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ operationId: "adminCancelCampaign" })
  @ApiBody({ type: AdminCampaignDecisionDto })
  @ApiOkResponse({ type: AdminCampaignDto })
  cancel(@Param("id", ParseUUIDPipe) id: string, @Body() body: AdminCampaignDecisionDto, @CurrentStaff() staff: StaffPrincipal): Promise<AdminCampaignDto> {
    return this.svc.cancel(id, body, staff);
  }
}

@ApiTags("admin-reviews")
@StaffController("reviews")
export class AdminReviewsController {
  constructor(@Inject(AdminReviewsService) private readonly svc: AdminReviewsService) {}

  @Get("founding-tracker")
  @RequirePermission("introductions.read")
  @AuditAccess({ entityType: "Referral", action: "founding_tracker.viewed" })
  @ApiOperation({ operationId: "adminFoundingTracker" })
  @ApiQueries(...PAGE_QUERY)
  @ApiOkResponse({ type: AdminFoundingTrackerDto })
  founding(@Query(new ZodValidationPipe(AdminFoundingTrackerQuerySchema)) q: AdminFoundingTrackerQueryDto): Promise<AdminFoundingTrackerDto> {
    return this.svc.foundingTracker(q);
  }

  @Get("profile-changes")
  @RequirePermission("contractors.read")
  @AuditAccess({ entityType: "CvChange", action: "profile_changes.listed" })
  @ApiOperation({ operationId: "adminListProfileChanges" })
  @ApiQueries({ name: "materialOnly", enum: ["true", "false"] }, ...PAGE_QUERY)
  @ApiOkResponse({ type: AdminProfileChangeListDto })
  profileChanges(@Query(new ZodValidationPipe(AdminProfileChangeQuerySchema)) q: AdminProfileChangeQueryDto): Promise<AdminProfileChangeListDto> {
    return this.svc.profileChanges(q);
  }
}

@ApiTags("admin-staff")
@StaffController("staff")
export class AdminStaffController {
  constructor(@Inject(AdminStaffService) private readonly svc: AdminStaffService) {}

  @Get()
  @RequirePermission("staff.manage")
  @AuditAccess({ entityType: "StaffUser", action: "staff.listed" })
  @ApiOperation({ operationId: "adminListStaff" })
  @ApiOkResponse({ type: AdminStaffListDto })
  list(): Promise<AdminStaffListDto> {
    return this.svc.list();
  }

  @Post()
  @HttpCode(200)
  @RequirePermission("staff.manage")
  @ApiOperation({ operationId: "adminCreateStaff" })
  @ApiBody({ type: AdminCreateStaffDto })
  @ApiOkResponse({ type: AdminStaffDto })
  create(@Body() body: AdminCreateStaffDto, @CurrentStaff() staff: StaffPrincipal): Promise<AdminStaffDto> {
    return this.svc.create(body, staff);
  }

  @Patch(":id")
  @RequirePermission("staff.manage")
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ operationId: "adminUpdateStaff" })
  @ApiBody({ type: AdminUpdateStaffDto })
  @ApiOkResponse({ type: AdminStaffDto })
  update(@Param("id", ParseUUIDPipe) id: string, @Body() body: AdminUpdateStaffDto, @CurrentStaff() staff: StaffPrincipal): Promise<AdminStaffDto> {
    return this.svc.update(id, body, staff);
  }

  @Post(":id/reset-mfa")
  @HttpCode(200)
  @RequirePermission("staff.manage")
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ operationId: "adminResetStaffMfa" })
  @ApiOkResponse({ type: AdminOkDto })
  reset(@Param("id", ParseUUIDPipe) id: string, @CurrentStaff() staff: StaffPrincipal): Promise<AdminOkDto> {
    return this.svc.resetMfa(id, staff);
  }
}

@ApiTags("admin-audit")
@StaffController("audit")
export class AdminAuditController {
  constructor(@Inject(AdminOverviewService) private readonly svc: AdminOverviewService) {}

  @Get()
  @RequirePermission("audit.read")
  @AuditAccess({ entityType: "AuditEvent", action: "audit_log.viewed" })
  @ApiOperation({ operationId: "adminAuditLog" })
  @ApiQueries({ name: "entityType" }, { name: "entityId" }, { name: "actorId" }, { name: "action" }, ...PAGE_QUERY)
  @ApiOkResponse({ type: AdminAuditListDto })
  list(@Query(new ZodValidationPipe(AdminAuditQuerySchema)) q: AdminAuditQueryDto): Promise<AdminAuditListDto> {
    return this.svc.audit(q);
  }
}
