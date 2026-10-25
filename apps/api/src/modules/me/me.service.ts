import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { prisma } from "@loop/db";
import {
  describeAvailability,
  londonDate,
  normaliseSituation,
  type AvailabilityFacts,
  type FreshnessThresholds,
} from "@loop/domain";
import type { ConfirmAvailabilityRequest, Me } from "@loop/contracts";
import { AuditService } from "../../common/audit.service.js";
import { loadFreshnessThresholds } from "../../common/freshness-config.js";
import { logger } from "../../common/logger.js";
import { REMINDER_REFRESH, type ReminderRefresher } from "../../common/reminder-refresh.js";
import { escalationPatch } from "../messaging/escalation.js";

type ConfirmationSource = "WEB" | "APP" | "EMAIL_LINK" | "ADMIN";
type Row =NonNullable<Awaited<ReturnType<typeof prisma.contractor.findUnique>>>;

function toDateOnly(d: Date | null): string | null {
  return d ? londonDate(d) : null;
}

/**
 * TODO(spec): availableNowConfirmed is derived from the explicit web confirmation (between contracts,
 * confirmed, start date not in the future) until a dedicated field exists.
 */
export function factsFor(c: Row, now: Date): AvailabilityFacts {
  const employment = c.employmentSituation ?? "CONTRACTING";
  const startedOrUndated = !c.availableFrom || londonDate(c.availableFrom) <= londonDate(now);
  return {
    employment,
    contractEndDate: c.contractEndDate,
    availableFrom: c.availableFrom,
    availableNowConfirmed: employment === "BETWEEN_CONTRACTS" && c.lastConfirmedAt !== null && startedOrUndated,
    lastConfirmedAt: c.lastConfirmedAt,
  };
}

export function toMe(c: Row, thresholds: FreshnessThresholds, now: Date): Me {
  const a = describeAvailability(factsFor(c, now), thresholds, now);
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    live: c.live,
    paused: c.paused,
    employment: c.employmentSituation,
    availableFrom: toDateOnly(c.availableFrom),
    contractEndDate: toDateOnly(c.contractEndDate),
    availability: {
      colour: a.colour,
      label: a.label,
      lastConfirmedAt: a.lastConfirmedAt?.toISOString() ?? null,
      underlyingStatus: a.underlyingStatus,
      freshnessState: a.freshnessState,
    },
  };
}

@Injectable()
export class MeService {
  // Explicit @Inject: the dev runner (tsx/esbuild) does not emit design:paramtypes metadata.
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Optional() @Inject(REMINDER_REFRESH) private readonly reminders?: ReminderRefresher,
  ) {}

  async get(id: string, now = new Date()): Promise<Me> {
    const c = await prisma.contractor.findUnique({ where: { id } });
    if (!c) throw new NotFoundException("Contractor not found");
    return toMe(c, await loadFreshnessThresholds(), now);
  }

  /**
   * B3/A5: an availability save is a meaningful confirmation. It stores the facts, stamps
   * lastConfirmedAt + confirmationSource and appends a ConfirmationEvent, atomically.
   * Dates never imply "available now"; that comes only from the explicit confirmation.
   */
  async confirmAvailability(
    id: string,
    req: ConfirmAvailabilityRequest,
    now = new Date(),
    source: ConfirmationSource = "WEB",
    /** Phase 10: set when staff confirm on the contractor's behalf; the audit event is then theirs, with the reason. */
    onBehalfOf?: { staffId: string; reason: string },
  ): Promise<Me> {
    const before = await prisma.contractor.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Contractor not found");
    const { value, issues } = normaliseSituation(
      { employment: req.employment, availableFrom: req.availableFrom, contractEndDate: req.contractEndDate ?? null },
      now,
    );
    if (issues.length > 0) throw new BadRequestException(issues.map((i) => `${i.field}: ${i.message}`).join("; "));
    const toDate = (v: string | null) => (v ? new Date(`${v}T00:00:00Z`) : null);
    const thresholds = await loadFreshnessThresholds();

    const after = await prisma.$transaction(async (tx) => {
      const confirmed = await tx.contractor.update({
        where: { id },
        data: {
          employmentSituation: value.employment,
          availableFrom: toDate(value.availableFrom),
          contractEndDate: toDate(value.contractEndDate),
          lastConfirmedAt: now,
          confirmationSource: source,
          confirmationChannel: source,
        },
      });
      await tx.confirmationEvent.create({
        data: {
          contractorId: id,
          source,
          employmentSituation: value.employment,
          availableFrom: confirmed.availableFrom,
          contractEndDate: confirmed.contractEndDate,
          confirmedAt: now,
        },
      });
      // Cache the derived values for search; colour is still computed by the domain only.
      const a = describeAvailability(factsFor(confirmed, now), thresholds, now);
      return tx.contractor.update({
        where: { id },
        data: {
          underlyingStatus: a.underlyingStatus,
          freshnessState: a.freshnessState,
          searchColour: a.colour,
          // Phase 8: a confirmation ends escalation and lifts a suppression that escalation applied.
          ...escalationPatch(confirmed, a.freshnessState, now),
        },
      });
    });
    const pick = (c: Row) => ({
      employmentSituation: c.employmentSituation,
      availableFrom: toDateOnly(c.availableFrom),
      contractEndDate: toDateOnly(c.contractEndDate),
      lastConfirmedAt: c.lastConfirmedAt?.toISOString() ?? null,
      confirmationSource: c.confirmationSource,
      confirmationChannel: c.confirmationChannel,
      underlyingStatus: c.underlyingStatus,
      freshnessState: c.freshnessState,
      searchSuppressed: c.searchSuppressed,
    });
    await this.audit.record({
      actorId: onBehalfOf?.staffId ?? id,
      actorType: onBehalfOf ? "STAFF" : undefined,
      entityType: "Contractor",
      entityId: id,
      action: onBehalfOf ? "availability.confirmed_on_behalf" : "availability.confirmed",
      before: pick(before),
      after: onBehalfOf ? { ...pick(after), reason: onBehalfOf.reason } : pick(after),
    });
    // Phase 8: the old plan no longer applies, so cancel obsolete follow-ups now. A failure here must not undo the confirmation.
    try {
      await this.reminders?.refresh(id, now);
    } catch (e) {
      logger.error({ contractorId: id, err: e instanceof Error ? e.name : "unknown" }, "reminder refresh failed after confirmation");
    }
    return toMe(after, thresholds, now);
  }
}
