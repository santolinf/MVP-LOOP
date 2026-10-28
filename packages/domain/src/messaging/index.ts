// Phase 8 send rules (pure): quiet hours, one-a-day cap and priority, staleness, consent/suppression gates,
// escalation stages and one-touch link checks. Controllers and jobs call these; they never re-implement them.
import type { ReminderConfig, ReminderType } from "../reminders/index.js";
import { londonDate, londonDaysBetween } from "../time/index.js";

/** Highest priority first. Contract-end asks outrank routine checks; housekeeping reviews come last. */
export const REMINDER_PRIORITY: readonly ReminderType[] = [
  "CONTRACT_END_DATE",
  "CONTRACT_END_FOLLOW_UP",
  "CONTRACT_END_PROMPT",
  "FUTURE_START_PROMPT",
  "AVAILABLE_NOW_CHECK",
  "IN_CONTRACT_CHECK",
  "PERMANENT_CHECK",
  "PROFILE_REVIEW",
  "CV_REVIEW",
  "INTRODUCTIONS_NUDGE",
];

/** Europe/London: nothing is sent from 21:00 until 08:00. */
export const QUIET_HOURS = { startHour: 21, endHour: 8 } as const;

export function londonHour(instant: Date): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }).format(instant);
  return Number(h);
}

export function isQuietHours(instant: Date): boolean {
  const h = londonHour(instant);
  return h >= QUIET_HOURS.startHour || h < QUIET_HOURS.endHour;
}

/** `instant` if sending is allowed, otherwise the first minute that is outside quiet hours, i.e. 08:00 London (DST-safe). */
export function nextSendTime(instant: Date): Date {
  if (!isQuietHours(instant)) return instant;
  let t = new Date(Math.floor(instant.getTime() / 60_000) * 60_000);
  for (let i = 0; i < 1440 && isQuietHours(t); i++) t = new Date(t.getTime() + 60_000);
  return t;
}

export interface DueReminder {
  id: string;
  type: ReminderType;
  dueAt: Date;
}

export type BlockReason = "NO_EMAIL" | "NO_OPERATIONAL_CONSENT" | "EMAIL_SUPPRESSED" | "ERASED";

export interface SendInput {
  now: Date;
  /** Pending reminders whose dueAt has passed. */
  due: readonly DueReminder[];
  /** A routine reminder was already sent to this contractor today (London date). */
  sentToday: boolean;
  hasEmail: boolean;
  operationalConsent: boolean;
  emailSuppressed: boolean;
  erased: boolean;
  staleAfterDays: ReminderConfig["staleAfterDays"];
}

export interface SendDecision {
  /** Dropped for good: too old to be useful. */
  stale: DueReminder[];
  /** The one reminder to send now. */
  send: DueReminder | null;
  /** Left pending to compete again later. */
  deferred: DueReminder[];
  blocked?: BlockReason;
  /** Set when sending is held for quiet hours. */
  heldUntil?: Date;
}

function rank(t: ReminderType): number {
  const i = REMINDER_PRIORITY.indexOf(t);
  return i === -1 ? REMINDER_PRIORITY.length : i;
}

/** Consent and suppression are decided here at send time, never trusted from scheduling time. */
export function decideSend(i: SendInput): SendDecision {
  const stale = i.due.filter((r) => londonDaysBetween(r.dueAt, i.now) > i.staleAfterDays);
  const live = i.due.filter((r) => !stale.includes(r));
  const base: SendDecision = { stale, send: null, deferred: live };

  const blocked: BlockReason | undefined = i.erased
    ? "ERASED"
    : !i.hasEmail
      ? "NO_EMAIL"
      : !i.operationalConsent
        ? "NO_OPERATIONAL_CONSENT"
        : i.emailSuppressed
          ? "EMAIL_SUPPRESSED"
          : undefined;
  if (blocked) return { ...base, blocked };
  if (live.length === 0) return base;
  if (isQuietHours(i.now)) return { ...base, heldUntil: nextSendTime(i.now) };
  if (i.sentToday) return base;

  const ordered = [...live].sort((a, b) => rank(a.type) - rank(b.type) || a.dueAt.getTime() - b.dueAt.getTime());
  const [winner, ...rest] = ordered;
  return { stale, send: winner ?? null, deferred: rest };
}

export function isSameLondonDay(a: Date, b: Date): boolean {
  return londonDate(a) === londonDate(b);
}

// ---- Escalation (spec: follow-up, then manual call task for Admin, then search suppression) ------------------

export type EscalationStage = "NONE" | "FOLLOW_UP" | "CALL_TASK" | "SUPPRESS";

/**
 * `unconfirmedSince` is when the contractor turned grey (freshness UNCONFIRMED); null when they are not grey.
 * Escalation never changes the availability colour; it only adds a call task and suppresses search.
 */
export function escalationStage(unconfirmedSince: Date | null, now: Date, cfg: ReminderConfig): EscalationStage {
  if (!unconfirmedSince) return "NONE";
  const days = londonDaysBetween(unconfirmedSince, now);
  if (days >= cfg.escalation.suppressAfterDays) return "SUPPRESS";
  if (days >= cfg.escalation.callTaskAfterDays) return "CALL_TASK";
  return "FOLLOW_UP";
}

// ---- One-touch confirm links -----------------------------------------------------------------------------------

export interface LinkFacts {
  employment: string;
  availableFrom: Date | null;
  contractEndDate: Date | null;
}

/** Stable text for "the facts the contractor is being asked to confirm"; compared at redeem time. */
export function factsFingerprint(f: LinkFacts): string {
  const d = (v: Date | null) => (v ? londonDate(v) : "-");
  return `${f.employment}|${d(f.availableFrom)}|${d(f.contractEndDate)}`;
}

export type LinkCheck = "OK" | "USED" | "EXPIRED" | "FACTS_CHANGED" | "END_DATE_PASSED";

/**
 * A link can only say "still the same". It is refused (sign-in required) when the facts moved on, or the contract
 * end date has passed: an end date passing never turns into "available" on a click (B3).
 */
export function checkConfirmLink(
  link: { expiresAt: Date; usedAt: Date | null; fingerprint: string },
  current: LinkFacts,
  now: Date,
): LinkCheck {
  if (link.usedAt) return "USED";
  if (link.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  if (link.fingerprint !== factsFingerprint(current)) return "FACTS_CHANGED";
  if (current.contractEndDate && londonDate(current.contractEndDate) < londonDate(now)) return "END_DATE_PASSED";
  return "OK";
}
