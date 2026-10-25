import { z } from "zod";

export const ReferralLinkSchema = z.object({
  code: z.string(),
  url: z.string(),
});
export type ReferralLink = z.infer<typeof ReferralLinkSchema>;

export const ReferralItemSchema = z.object({
  id: z.string(),
  /** First name only; surnames and contact details of referees are never exposed. */
  refereeFirstName: z.string().nullable().meta({ type: "string", nullable: true } as never),
  registeredAt: z.string().datetime(),
  /** Whether this introduction counts: attribution locked at registration and no open review flag. */
  counted: z.boolean(),
  /** True while an unresolved same-device or duplicate-identity review is holding the count. */
  underReview: z.boolean(),
});
export type ReferralItem = z.infer<typeof ReferralItemSchema>;

export const ReferralListSchema = z.object({
  items: z.array(ReferralItemSchema),
  /** Lifetime count of introductions that count. Five is a milestone, not a cap. */
  lifetimeCount: z.number().int(),
  milestoneReached: z.boolean(),
});
export type ReferralList = z.infer<typeof ReferralListSchema>;

export const ReferralCodeCheckSchema = z.object({
  valid: z.boolean(),
  referrerFirstName: z.string().nullable().meta({ type: "string", nullable: true } as never),
});
export type ReferralCodeCheck = z.infer<typeof ReferralCodeCheckSchema>;

export const AttributeReferralRequestSchema = z.object({ code: z.string().min(1).max(32) }).strict();
export type AttributeReferralRequest = z.infer<typeof AttributeReferralRequestSchema>;

export const AttributeReferralResultSchema = z.object({ attributed: z.boolean() });
export type AttributeReferralResult = z.infer<typeof AttributeReferralResultSchema>;

/** Verbal introduction: exact email of an existing member. The result is a masked confirmation, never a directory. */
export const IntroducerLookupRequestSchema = z.object({ email: z.string().trim().email().max(254) }).strict();
export type IntroducerLookupRequest = z.infer<typeof IntroducerLookupRequestSchema>;

export const IntroducerLookupResultSchema = z.object({
  found: z.boolean(),
  /** e.g. "S*** J."; null when nothing matched. */
  maskedName: z.string().nullable().meta({ type: "string", nullable: true } as never),
  /** Pass to setIntroducer once the registrant confirms the masked name. */
  code: z.string().nullable().meta({ type: "string", nullable: true } as never),
});
export type IntroducerLookupResult = z.infer<typeof IntroducerLookupResultSchema>;

export const IntroducerSourceSchema = z.enum(["LINK", "CODE", "VERBAL"]);
export type IntroducerSource = z.infer<typeof IntroducerSourceSchema>;

export const SetIntroducerRequestSchema = z.object({ code: z.string().min(1).max(32), source: IntroducerSourceSchema }).strict();
export type SetIntroducerRequest = z.infer<typeof SetIntroducerRequestSchema>;

export const IntroducerSchema = z.object({
  /** Masked, e.g. "S*** J."; null when no introducer is recorded. */
  maskedName: z.string().nullable().meta({ type: "string", nullable: true } as never),
  /** True once attribution is locked at completed registration; only an audited Admin override changes it. */
  locked: z.boolean(),
});
export type Introducer = z.infer<typeof IntroducerSchema>;
