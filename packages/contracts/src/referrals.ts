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
  /** Whether this introduction counts towards Founding (referee has a live profile). */
  counted: z.boolean(),
});
export type ReferralItem = z.infer<typeof ReferralItemSchema>;

export const ReferralListSchema = z.object({ items: z.array(ReferralItemSchema) });
export type ReferralList = z.infer<typeof ReferralListSchema>;

export const ReferralCodeCheckSchema = z.object({
  valid: z.boolean(),
  referrerFirstName: z.string().nullable().meta({ type: "string", nullable: true } as never),
});
export type ReferralCodeCheck = z.infer<typeof ReferralCodeCheckSchema>;

export const AttributeReferralRequestSchema = z.object({ code: z.string().min(1).max(32) });
export type AttributeReferralRequest = z.infer<typeof AttributeReferralRequestSchema>;

export const AttributeReferralResultSchema = z.object({ attributed: z.boolean() });
export type AttributeReferralResult = z.infer<typeof AttributeReferralResultSchema>;
