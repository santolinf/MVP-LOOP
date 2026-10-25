// Phase 12 admin communications rules (pure): which consent a send needs, who may be sent to, when a second person
// must approve, and the send-rate settings. Controllers and the send job call these; they never re-implement them.
import type { ConsentPurpose } from "../consent/index.js";

export const CAMPAIGN_KINDS = ["BROADCAST", "TARGETED"] as const;
export type CampaignKind = (typeof CAMPAIGN_KINDS)[number];

export const CAMPAIGN_STATUSES = ["PENDING_APPROVAL", "SENDING", "SENT", "REJECTED", "CANCELLED"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/** A broadcast is marketing and needs LOOP_MARKETING; a targeted message is a service message and needs OPERATIONAL_EMAIL. */
export function requiredConsent(kind: CampaignKind): Extract<ConsentPurpose, "LOOP_MARKETING" | "OPERATIONAL_EMAIL"> {
  return kind === "BROADCAST" ? "LOOP_MARKETING" : "OPERATIONAL_EMAIL";
}

export const CAMPAIGN_LIMITS = { targetedRecipients: 500, nameLength: 100 } as const;

export interface CampaignSettings {
  /** A send to more than this many eligible recipients needs a second person's approval. */
  approvalThreshold: number;
  /** Messages the send job may attempt per run (it runs every minute). */
  ratePerMinute: number;
}

export const DEFAULT_CAMPAIGN_SETTINGS: CampaignSettings = { approvalThreshold: 100, ratePerMinute: 200 };

/** Merges stored settings over the defaults so an older or partial row still loads. */
export function mergeCampaignSettings(stored: unknown): CampaignSettings {
  const s = (stored && typeof stored === "object" ? stored : {}) as Partial<Record<keyof CampaignSettings, unknown>>;
  const pick = (v: unknown, d: number) => (typeof v === "number" && Number.isInteger(v) ? v : d);
  return {
    approvalThreshold: pick(s.approvalThreshold, DEFAULT_CAMPAIGN_SETTINGS.approvalThreshold),
    ratePerMinute: pick(s.ratePerMinute, DEFAULT_CAMPAIGN_SETTINGS.ratePerMinute),
  };
}

/** Human-readable problems; empty when the settings are safe to store. */
export function validateCampaignSettings(s: CampaignSettings): string[] {
  const issues: string[] = [];
  if (!Number.isInteger(s.approvalThreshold) || s.approvalThreshold < 0 || s.approvalThreshold > 100_000) {
    issues.push("approvalThreshold must be a whole number from 0 to 100000");
  }
  if (!Number.isInteger(s.ratePerMinute) || s.ratePerMinute < 1 || s.ratePerMinute > 2000) {
    issues.push("ratePerMinute must be a whole number from 1 to 2000");
  }
  return issues;
}

/** Two-person rule: only sends above the threshold are held for approval. A threshold of 0 holds every send. */
export function needsApproval(recipientCount: number, settings: Pick<CampaignSettings, "approvalThreshold">): boolean {
  return recipientCount > settings.approvalThreshold;
}

/** The author of a send may not approve their own. */
export function mayApproveCampaign(p: { approverId: string; authorId: string }): boolean {
  return p.approverId !== p.authorId;
}

export type SkipReason = "ERASED" | "NO_EMAIL" | "NO_CONSENT" | "EMAIL_SUPPRESSED" | "DAILY_CAP";

export interface RecipientFacts {
  kind: CampaignKind;
  erased: boolean;
  hasEmail: boolean;
  consents: ReadonlySet<ConsentPurpose>;
  emailSuppressed: boolean;
  /** An admin message has already gone to this contractor today (London date). Only known at send time. */
  receivedAdminToday?: boolean;
}

/**
 * The consent filter. Applied server-side twice: at submit (to build and size the audience) and again at send time,
 * because consent can be withdrawn in between. Returns why a contractor is skipped, or null when they may be emailed.
 */
export function skipReason(r: RecipientFacts): SkipReason | null {
  if (r.erased) return "ERASED";
  if (!r.hasEmail) return "NO_EMAIL";
  if (!r.consents.has(requiredConsent(r.kind))) return "NO_CONSENT";
  if (r.emailSuppressed) return "EMAIL_SUPPRESSED";
  if (r.receivedAdminToday) return "DAILY_CAP";
  return null;
}

/** How many of the queued recipients this run may attempt. */
export function batchSize(settings: Pick<CampaignSettings, "ratePerMinute">, alreadyAttempted: number): number {
  return Math.max(0, settings.ratePerMinute - alreadyAttempted);
}

export const CAMPAIGN_FOOTER: Record<CampaignKind, string> = {
  BROADCAST: "You get this because you agreed to news and offers from LOOP. You can opt out at any time in My LOOP.",
  TARGETED: "This is a service message from the LOOP team about your profile. You can manage your email preferences in My LOOP.",
};
