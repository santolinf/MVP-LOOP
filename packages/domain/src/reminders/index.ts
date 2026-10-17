import type { UnderlyingStatus } from "../availability/index.js";
import { addLondonDays, londonDaysBetween } from "../time/index.js";

export type ReminderType =
  | "AVAILABLE_NOW_CHECK"
  | "CONTRACT_END_PROMPT"
  | "CONTRACT_END_DATE"
  | "CONTRACT_END_FOLLOW_UP"
  | "IN_CONTRACT_CHECK"
  | "PERMANENT_CHECK"
  | "PROFILE_REVIEW"
  | "CV_REVIEW"
  | "INTRODUCTIONS_NUDGE"
  | "FUTURE_START_PROMPT";

export interface ReminderConfig {
  availableNow: { intervalDays: number };
  contractEnd: { promptDaysBefore: number[]; onEndDate: boolean; followUpDaysAfter: number[] };
  inContract: { intervalDays: number };
  permanent: { intervalDays: number };
  profileReview: { intervalDays: number };
  cvReview: { intervalDays: number };
  introductions: { nudgeAfterDays: number; progressMinGapDays: number };
  /** TODO(spec): Q2 — empty until the product owner decides future-start prompts. */
  futureStart: { promptDaysBefore: number[] };
}

/** Plan §3.3 defaults. Runtime values come from the ReminderConfig table. */
export const DEFAULT_REMINDER_CONFIG: ReminderConfig = {
  availableNow: { intervalDays: 7 },
  contractEnd: { promptDaysBefore: [28, 14, 7], onEndDate: true, followUpDaysAfter: [3, 7] },
  inContract: { intervalDays: 30 },
  permanent: { intervalDays: 60 },
  profileReview: { intervalDays: 90 },
  cvReview: { intervalDays: 180 },
  introductions: { nudgeAfterDays: 14, progressMinGapDays: 14 },
  futureStart: { promptDaysBefore: [] },
};

export interface ReminderContext {
  status: UnderlyingStatus;
  contractEndDate: Date | null;
  availableFrom: Date | null;
  /** Last confirmation of the availability reminder family. */
  lastConfirmedAt: Date | null;
  /** Last whole-profile confirmation; a CV upload does not reset it (WP5). */
  profileLastVerifiedAt: Date | null;
  /** Q9: the later of last CV upload and last CV-review response. */
  lastCvActivityAt: Date | null;
  registeredAt: Date;
  introductionCount: number;
}

export interface PlannedReminder {
  type: ReminderType;
  dueAt: Date;
  /** Unique per (contractor-independent) occurrence; caller prefixes the contractor id. */
  dedupeKey: string;
}

const dateKey = (d: Date) => d.toISOString().slice(0, 10);

function make(type: ReminderType, dueAt: Date, discriminator: string): PlannedReminder {
  return { type, dueAt, dedupeKey: `${type}:${discriminator}:${dateKey(dueAt)}` };
}

function plus(base: Date, days: number): Date {
  return addLondonDays(base, days);
}

/**
 * The set of reminders that should be scheduled for a contractor right now. Callers reconcile
 * against stored ScheduledReminder rows by dedupeKey: missing -> insert, obsolete -> CANCELLED.
 * A status change therefore cancels reminders for the old status simply by not planning them.
 */
export function planReminders(ctx: ReminderContext, cfg: ReminderConfig): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  const confirmed = ctx.lastConfirmedAt ?? ctx.registeredAt;
  const tag = ctx.status;

  switch (ctx.status) {
    case "AVAILABLE_NOW":
      out.push(make("AVAILABLE_NOW_CHECK", plus(confirmed, cfg.availableNow.intervalDays), tag));
      break;
    case "ENDING_SOON":
    case "IN_CONTRACT":
    case "END_DATE_REACHED": {
      const end = ctx.contractEndDate;
      if (end) {
        for (const d of cfg.contractEnd.promptDaysBefore) {
          out.push(make("CONTRACT_END_PROMPT", plus(end, -d), `${dateKey(end)}:${d}`));
        }
        if (cfg.contractEnd.onEndDate) out.push(make("CONTRACT_END_DATE", end, dateKey(end)));
        for (const d of cfg.contractEnd.followUpDaysAfter) {
          out.push(make("CONTRACT_END_FOLLOW_UP", plus(end, d), `${dateKey(end)}:${d}`));
        }
      }
      if (ctx.status === "IN_CONTRACT") {
        out.push(make("IN_CONTRACT_CHECK", plus(confirmed, cfg.inContract.intervalDays), tag));
      }
      if (ctx.availableFrom && !end) {
        for (const d of cfg.futureStart.promptDaysBefore) {
          out.push(make("FUTURE_START_PROMPT", plus(ctx.availableFrom, -d), `${dateKey(ctx.availableFrom)}:${d}`));
        }
      }
      break;
    }
    case "PERMANENT":
      out.push(make("PERMANENT_CHECK", plus(confirmed, cfg.permanent.intervalDays), tag));
      break;
    case "UNCONFIRMED":
      break;
  }

  const profileBase = ctx.profileLastVerifiedAt ?? ctx.registeredAt;
  out.push(make("PROFILE_REVIEW", plus(profileBase, cfg.profileReview.intervalDays), "profile"));
  out.push(make("CV_REVIEW", plus(ctx.lastCvActivityAt ?? ctx.registeredAt, cfg.cvReview.intervalDays), "cv"));
  if (ctx.introductionCount === 0) {
    out.push(make("INTRODUCTIONS_NUDGE", plus(ctx.registeredAt, cfg.introductions.nudgeAfterDays), "intro"));
  }
  return out;
}

/** Q10: whether an introductions-progress message may be sent given the previous one. */
export function canSendIntroProgress(lastSentAt: Date | null, now: Date, cfg: ReminderConfig): boolean {
  return !lastSentAt || londonDaysBetween(lastSentAt, now) >= cfg.introductions.progressMinGapDays;
}
