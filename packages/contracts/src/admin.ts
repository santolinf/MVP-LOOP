import { z } from "zod";
import { AvailabilityColourSchema } from "./common.js";
import { EmploymentSituationSchema } from "./me.js";

/**
 * Phase 10 admin API (`/api/v1/admin/*`). A separate auth realm from contractors: staff accounts, email OTP plus TOTP.
 * Nullable helpers use the OpenAPI 3.0 form so Orval does not emit `string[]` for `type: [string, null]`.
 */
const nstr = () => z.string().nullable().meta({ type: "string", nullable: true } as never);
const ndate = () => z.string().datetime().nullable().meta({ type: "string", format: "date-time", nullable: true } as never);
const nint = () => z.number().int().nullable().meta({ type: "integer", nullable: true } as never);
const json = () => z.looseObject({});
const njson = () => json().nullable().meta({ type: "object", nullable: true } as never);

export const StaffRoleSchema = z.enum(["READ_ONLY", "OPERATOR", "ADMIN"]);
export const PermissionSchema = z.enum([
  "contractors.read",
  "availability.read",
  "availability.confirm",
  "availability.manage_tasks",
  "introductions.read",
  "introductions.review",
  "introductions.override",
  "rewards.read",
  "rewards.verify",
  "rewards.approve",
  "comms.read",
  "comms.send_message",
  "comms.manage_templates",
  "comms.approve",
  "config.read",
  "config.write",
  "audit.read",
  "staff.manage",
]);

const reason = z.string().trim().min(10, "Give a reason of at least 10 characters").max(500);
const page = { page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) };

// ---- auth -----------------------------------------------------------------------------------------------------

export const AdminOtpRequestSchema = z.object({ email: z.string().trim().email().max(254) }).strict();
export const AdminOtpRequestResultSchema = z.object({ accepted: z.literal(true), resendAfterSeconds: z.number().int() });
export const AdminOtpVerifySchema = z.object({ email: z.string().trim().email().max(254), code: z.string().trim().regex(/^\d{4,10}$/) }).strict();
export const AdminTotpCodeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/) }).strict();
export const AdminTotpSetupSchema = z.object({ secret: z.string(), otpauthUrl: z.string() });
export const AdminStageSchema = z.enum(["MFA_ENROL", "MFA_REQUIRED", "AUTHENTICATED"]);
export const AdminAuthResultSchema = z.object({ stage: AdminStageSchema });
export const AdminMeSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: nstr(),
  role: StaffRoleSchema,
  permissions: z.array(PermissionSchema),
});
export const AdminOkSchema = z.object({ ok: z.literal(true) });
export type AdminMe = z.infer<typeof AdminMeSchema>;

// ---- overview -------------------------------------------------------------------------------------------------

export const AdminOverviewSchema = z.object({
  contractors: z.object({ total: z.number().int(), live: z.number().int(), paused: z.number().int(), searchSuppressed: z.number().int() }),
  colours: z.object({ LIME: z.number().int(), ORANGE: z.number().int(), RED: z.number().int(), BLUE: z.number().int(), GREY: z.number().int() }),
  queues: z.object({
    openCallTasks: z.number().int(),
    openReferralFlags: z.number().int(),
    rewardsAwaitingVerification: z.number().int(),
    rewardsAwaitingApproval: z.number().int(),
  }),
  founding: z.object({ allocated: z.number().int(), cap: z.number().int() }),
});
export type AdminOverview = z.infer<typeof AdminOverviewSchema>;

// ---- contractors ----------------------------------------------------------------------------------------------

export const AdminContractorQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  live: z.enum(["true", "false"]).optional(),
  ...page,
});
export const AdminContractorRowSchema = z.object({
  id: z.string(),
  firstName: nstr(),
  lastName: nstr(),
  email: nstr(),
  live: z.boolean(),
  paused: z.boolean(),
  searchSuppressed: z.boolean(),
  colour: AvailabilityColourSchema,
  label: z.string(),
  lastConfirmedAt: ndate(),
  confirmationSource: nstr(),
  foundingPlace: nint(),
});
export const AdminContractorListSchema = z.object({ items: z.array(AdminContractorRowSchema), total: z.number().int(), page: z.number().int(), pageSize: z.number().int() });
export type AdminContractorRow = z.infer<typeof AdminContractorRowSchema>;

export const AdminConfirmationEventSchema = z.object({
  id: z.string(),
  source: z.string(),
  employment: z.string(),
  availableFrom: nstr(),
  contractEndDate: nstr(),
  confirmedAt: z.string().datetime(),
});
export const AdminContractorDetailSchema = AdminContractorRowSchema.extend({
  phone: z.string(),
  employment: nstr(),
  availableFrom: nstr(),
  contractEndDate: nstr(),
  underlyingStatus: nstr(),
  freshnessState: nstr(),
  unconfirmedSince: ndate(),
  escalationStage: nstr(),
  createdAt: z.string().datetime(),
  introducer: z.object({ referralId: z.string(), referrerId: z.string(), referrerName: nstr(), locked: z.boolean() }).nullable().meta({ type: "object", nullable: true } as never),
  introductionsMade: z.number().int(),
  events: z.array(AdminConfirmationEventSchema),
  openCallTask: z.object({ id: z.string(), reason: z.string(), createdAt: z.string().datetime() }).nullable().meta({ type: "object", nullable: true } as never),
});
export type AdminContractorDetail = z.infer<typeof AdminContractorDetailSchema>;

/** Manual confirm "on behalf" (source = ADMIN). The reason is mandatory and audited. */
export const AdminConfirmOnBehalfSchema = z
  .object({
    employment: EmploymentSituationSchema,
    availableFrom: z.string().date().nullable(),
    contractEndDate: z.string().date().nullable().optional(),
    reason,
  })
  .strict();

export const AdminSendMessageSchema = z
  .object({ templateKey: z.string().max(100).optional(), subject: z.string().trim().min(1).max(150), body: z.string().trim().min(1).max(4000) })
  .strict();
export const AdminSendMessageResultSchema = z.object({ id: z.string() });

// ---- availability queue ---------------------------------------------------------------------------------------

export const AdminQueueQuerySchema = z.object({ stage: z.enum(["ALL", "UNCONFIRMED", "CALL_TASK", "SUPPRESSED"]).default("ALL"), ...page });
export const AdminQueueItemSchema = AdminContractorRowSchema.extend({
  unconfirmedSince: ndate(),
  escalationStage: nstr(),
  callTask: z.object({ id: z.string(), reason: z.string(), createdAt: z.string().datetime() }).nullable().meta({ type: "object", nullable: true } as never),
});
export const AdminQueueSchema = z.object({ items: z.array(AdminQueueItemSchema), total: z.number().int(), page: z.number().int(), pageSize: z.number().int() });
export const AdminResolveCallTaskSchema = z.object({ outcome: z.enum(["DONE", "CANCELLED"]), note: z.string().trim().max(500).optional() }).strict();

// ---- reminder schedule (versioned config) ---------------------------------------------------------------------

const days = z.number().int().min(1).max(3650);
export const AdminReminderConfigBodySchema = z.object({
  availableNow: z.object({ intervalDays: days }),
  contractEnd: z.object({ promptDaysBefore: z.array(days).max(10), onEndDate: z.boolean(), followUpDaysAfter: z.array(days).max(10) }),
  inContract: z.object({ intervalDays: days }),
  permanent: z.object({ intervalDays: days }),
  profileReview: z.object({ intervalDays: days }),
  cvReview: z.object({ intervalDays: days }),
  introductions: z.object({ nudgeAfterDays: days, progressMinGapDays: days }),
  futureStart: z.object({ promptDaysBefore: z.array(days).max(10) }),
  staleAfterDays: days,
  escalation: z.object({ callTaskAfterDays: days, suppressAfterDays: days }),
});
export const AdminReminderConfigSchema = z.object({
  version: z.number().int(),
  config: AdminReminderConfigBodySchema,
  history: z.array(z.object({ version: z.number().int(), note: nstr(), createdBy: nstr(), createdAt: z.string().datetime() })),
});
export const AdminPublishReminderConfigSchema = z.object({ config: AdminReminderConfigBodySchema, note: reason }).strict();

// ---- introductions and founding -------------------------------------------------------------------------------

export const AdminReferralQuerySchema = z.object({ flagged: z.enum(["true", "false"]).optional(), ...page });
const person = z.object({ id: z.string(), name: nstr() });
export const AdminReferralFlagSchema = z.object({ id: z.string(), reason: z.string(), status: z.string(), createdAt: z.string().datetime(), resolvedAt: ndate() });
export const AdminReferralRowSchema = z.object({
  id: z.string(),
  referrer: person,
  referee: person,
  source: z.string(),
  locked: z.boolean(),
  counted: z.boolean(),
  createdAt: z.string().datetime(),
  flags: z.array(AdminReferralFlagSchema),
});
export const AdminReferralListSchema = z.object({ items: z.array(AdminReferralRowSchema), total: z.number().int(), page: z.number().int(), pageSize: z.number().int() });
export const AdminFoundingSchema = z.object({
  allocated: z.number().int(),
  cap: z.number().int(),
  recent: z.array(z.object({ contractorId: z.string(), name: nstr(), place: z.number().int() })),
});
/** Introducer override. `referrerId` is the new introducer's contractor id. */
export const AdminOverrideIntroducerSchema = z.object({ referrerId: z.string().uuid(), reason }).strict();
export const AdminResolveFlagSchema = z.object({ status: z.enum(["CLEARED", "CONFIRMED"]), note: reason }).strict();

// ---- rewards --------------------------------------------------------------------------------------------------

export const AdminRewardQuerySchema = z.object({ status: z.enum(["PENDING", "UNDER_VERIFICATION", "APPROVED", "PAID"]).optional(), ...page });
export const AdminRewardRowSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: z.string(),
  amountPence: nint(),
  beneficiary: person,
  qualifyingContractor: person,
  supplyingCompany: nstr(),
  serviceStart: nstr(),
  serviceEnd: nstr(),
  paidServiceMonths: z.number().int(),
  evidence: njson(),
  agencyVerifiedAt: ndate(),
  verificationRecordedBy: nstr(),
  approvedAt: ndate(),
  approvedBy: nstr(),
  createdAt: z.string().datetime(),
  /** Computed by the API (rules B7 and four-eyes); clients never recompute it. */
  approval: z.object({ allowed: z.boolean(), blockedReason: nstr() }),
});
export const AdminRewardListSchema = z.object({ items: z.array(AdminRewardRowSchema), total: z.number().int(), page: z.number().int(), pageSize: z.number().int() });
export type AdminRewardRow = z.infer<typeof AdminRewardRowSchema>;
/** Evidence is entered by staff from agency-supplied material (B7); the contractor never types it. */
export const AdminRecordVerificationSchema = z
  .object({
    serviceStart: z.string().date(),
    serviceEnd: z.string().date(),
    reference: z.string().trim().min(3).max(200),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

// ---- templates ------------------------------------------------------------------------------------------------

export const AdminTemplateKindSchema = z.enum(["REMINDER_EMAIL", "LOOP_MESSAGE", "NOTIFICATION"]);
export const AdminTemplateVersionSchema = z.object({
  version: z.number().int(),
  subject: z.string(),
  body: z.array(z.string()),
  note: nstr(),
  createdBy: nstr(),
  createdAt: z.string().datetime(),
});
export const AdminTemplateSummarySchema = z.object({
  key: z.string(),
  kind: AdminTemplateKindSchema,
  label: z.string(),
  /** 0 = the built-in default is in force. */
  version: z.number().int(),
  subject: z.string(),
  updatedAt: ndate(),
});
export const AdminTemplateListSchema = z.object({ items: z.array(AdminTemplateSummarySchema) });
export const AdminTemplateDetailSchema = AdminTemplateSummarySchema.extend({
  body: z.array(z.string()),
  placeholders: z.array(z.string()),
  history: z.array(AdminTemplateVersionSchema),
});
export const AdminNewTemplateVersionSchema = z
  .object({ subject: z.string().max(150), body: z.array(z.string().max(2000)).min(1).max(12), note: reason })
  .strict();
export const AdminCreateTemplateSchema = AdminNewTemplateVersionSchema.extend({
  kind: z.enum(["LOOP_MESSAGE", "NOTIFICATION"]),
  key: z.string().min(3).max(80),
}).strict();

// ---- staff and audit ------------------------------------------------------------------------------------------

export const AdminStaffSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: nstr(),
  role: StaffRoleSchema,
  active: z.boolean(),
  totpEnrolled: z.boolean(),
  lastSignInAt: ndate(),
  createdAt: z.string().datetime(),
});
export const AdminStaffListSchema = z.object({ items: z.array(AdminStaffSchema) });
export const AdminCreateStaffSchema = z.object({ email: z.string().trim().email().max(254), name: z.string().trim().max(100).optional(), role: StaffRoleSchema }).strict();
export const AdminUpdateStaffSchema = z
  .object({ role: StaffRoleSchema.optional(), active: z.boolean().optional(), name: z.string().trim().max(100).optional(), reason })
  .strict();

export const AdminAuditQuerySchema = z.object({
  entityType: z.string().max(60).optional(),
  entityId: z.string().max(100).optional(),
  actorId: z.string().max(100).optional(),
  action: z.string().max(100).optional(),
  ...page,
});
export const AdminAuditItemSchema = z.object({
  id: z.string(),
  createdAt: z.string().datetime(),
  actorType: z.string(),
  actorId: nstr(),
  entityType: z.string(),
  entityId: z.string(),
  action: z.string(),
  before: njson(),
  after: njson(),
});
export const AdminAuditListSchema = z.object({ items: z.array(AdminAuditItemSchema), total: z.number().int(), page: z.number().int(), pageSize: z.number().int() });

// ---- Phase 12: campaigns (broadcast / targeted sends) ---------------------------------------------------------

export const AdminCampaignKindSchema = z.enum(["BROADCAST", "TARGETED"]);
export const AdminCampaignStatusSchema = z.enum(["PENDING_APPROVAL", "SENDING", "SENT", "REJECTED", "CANCELLED"]);
export const AdminSkipReasonSchema = z.enum(["ERASED", "NO_EMAIL", "NO_CONSENT", "EMAIL_SUPPRESSED", "DAILY_CAP", "CANCELLED"]);

/**
 * Who a send goes to. A broadcast is filtered by situation and cached search colour (colour is never calculated
 * here); a targeted send names contractors. Either way the consent filter is applied by the server, never the client.
 */
export const AdminAudienceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("BROADCAST"),
    liveOnly: z.boolean().default(true),
    situations: z.array(EmploymentSituationSchema).max(3).default([]),
    colours: z.array(AvailabilityColourSchema).max(5).default([]),
  }),
  z.object({ kind: z.literal("TARGETED"), contractorIds: z.array(z.string().uuid()).min(1).max(500) }),
]);

const campaignContent = {
  subject: z.string().trim().min(1).max(150),
  body: z.array(z.string().max(2000)).min(1).max(12),
};

export const AdminCampaignPreviewSchema = z.object({ audience: AdminAudienceSchema }).strict();
export const AdminCampaignPreviewResultSchema = z.object({
  matched: z.number().int(),
  eligible: z.number().int(),
  skipped: z.array(z.object({ reason: AdminSkipReasonSchema, count: z.number().int() })),
  /** First names only, so the sender can sanity-check the audience without a list of everyone. */
  sample: z.array(z.object({ contractorId: z.string(), name: nstr() })),
  requiresApproval: z.boolean(),
  approvalThreshold: z.number().int(),
  consentRequired: z.enum(["LOOP_MARKETING", "OPERATIONAL_EMAIL"]),
});
export const AdminCreateCampaignSchema = z
  .object({ name: z.string().trim().min(3).max(100), audience: AdminAudienceSchema, ...campaignContent })
  .strict();

export const AdminCampaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: AdminCampaignKindSchema,
  status: AdminCampaignStatusSchema,
  subject: z.string(),
  body: z.array(z.string()),
  audience: AdminAudienceSchema,
  recipientCount: z.number().int(),
  skippedCount: z.number().int(),
  approvalRequired: z.boolean(),
  createdBy: z.string(),
  approvedBy: nstr(),
  approvedAt: ndate(),
  decisionNote: nstr(),
  sentAt: ndate(),
  createdAt: z.string().datetime(),
  /** Live tallies from the recipient rows. */
  counts: z.object({ queued: z.number().int(), sent: z.number().int(), failed: z.number().int(), skipped: z.number().int() }),
  /** Whether the signed-in staff member may approve it right now (not the author, and still pending). */
  canApprove: z.boolean(),
});
export const AdminCampaignQuerySchema = z.object({ status: AdminCampaignStatusSchema.optional(), ...page });
export const AdminCampaignListSchema = z.object({ items: z.array(AdminCampaignSchema), total: z.number().int(), page: z.number().int(), pageSize: z.number().int() });
export const AdminCampaignDecisionSchema = z.object({ note: reason }).strict();

export const AdminDeliveryQuerySchema = z.object({ status: z.enum(["QUEUED", "SENT", "FAILED", "SKIPPED"]).optional(), ...page });
export const AdminDeliveryRowSchema = z.object({
  contractorId: z.string(),
  name: nstr(),
  status: z.enum(["QUEUED", "SENT", "FAILED", "SKIPPED"]),
  skipReason: AdminSkipReasonSchema.nullable().meta({ type: "string", nullable: true } as never),
  sentAt: ndate(),
  /** Delivery events in order (SENT, DELIVERED, BOUNCED ...). No addresses are ever shown. */
  events: z.array(z.object({ event: z.string(), occurredAt: z.string().datetime() })),
});
export const AdminDeliveryListSchema = z.object({ items: z.array(AdminDeliveryRowSchema), total: z.number().int(), page: z.number().int(), pageSize: z.number().int() });

export const AdminCampaignSettingsSchema = z.object({
  approvalThreshold: z.number().int().min(0).max(100_000),
  ratePerMinute: z.number().int().min(1).max(2000),
  updatedAt: ndate(),
  updatedBy: nstr(),
});
export const AdminPublishCampaignSettingsSchema = z
  .object({ approvalThreshold: z.number().int().min(0).max(100_000), ratePerMinute: z.number().int().min(1).max(2000), note: reason })
  .strict();

// ---- Phase 12: review queues ----------------------------------------------------------------------------------

export const AdminFoundingTrackerQuerySchema = z.object({ ...page });
export const AdminFoundingTrackerRowSchema = z.object({
  contractorId: z.string(),
  name: nstr(),
  registeredReferrals: z.number().int(),
  required: z.number().int(),
  isCurrent: z.boolean(),
  /** QUALIFIED: meets both conditions but has no place (e.g. cap reached). IN_PROGRESS: still short. */
  state: z.enum(["QUALIFIED", "IN_PROGRESS"]),
});
export const AdminFoundingTrackerSchema = z.object({
  allocated: z.number().int(),
  cap: z.number().int(),
  remaining: z.number().int(),
  items: z.array(AdminFoundingTrackerRowSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export const AdminProfileChangeQuerySchema = z.object({ materialOnly: z.enum(["true", "false"]).optional(), ...page });
export const AdminProfileChangeRowSchema = z.object({
  contractorId: z.string(),
  name: nstr(),
  pending: z.number().int(),
  material: z.number().int(),
  oldestAt: z.string().datetime(),
});
export const AdminProfileChangeListSchema = z.object({ items: z.array(AdminProfileChangeRowSchema), total: z.number().int(), page: z.number().int(), pageSize: z.number().int() });
