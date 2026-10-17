import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@loop/db";
import { describeAvailability, londonDate, type AvailabilityFacts, type FreshnessThresholds } from "@loop/domain";
import type { ConfirmAvailabilityRequest, Me } from "@loop/contracts";
import { AuditService } from "../../common/audit.service.js";
import { loadFreshnessThresholds } from "../../common/freshness-config.js";

type Row = NonNullable<Awaited<ReturnType<typeof prisma.contractor.findUnique>>>;

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
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  async get(id: string, now = new Date()): Promise<Me> {
    const c = await prisma.contractor.findUnique({ where: { id } });
    if (!c) throw new NotFoundException("Contractor not found");
    return toMe(c, await loadFreshnessThresholds(), now);
  }

  /** B3/A5: a web confirmation is a meaningful confirmation; source is always WEB. */
  async confirmAvailability(id: string, req: ConfirmAvailabilityRequest, now = new Date()): Promise<Me> {
    const before = await prisma.contractor.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Contractor not found");
    const thresholds = await loadFreshnessThresholds();
    const confirmed = await prisma.contractor.update({
      where: { id },
      data: {
        employmentSituation: req.employment,
        availableFrom: req.availableFrom ? new Date(`${req.availableFrom}T00:00:00Z`) : null,
        lastConfirmedAt: now,
        confirmationSource: "WEB",
        confirmationChannel: "WEB",
      },
    });
    // Cache the derived values for search; colour is still computed by the domain only.
    const a = describeAvailability(factsFor(confirmed, now), thresholds, now);
    const after = await prisma.contractor.update({
      where: { id },
      data: { underlyingStatus: a.underlyingStatus, freshnessState: a.freshnessState, searchColour: a.colour },
    });
    const pick = (c: Row) => ({
      employmentSituation: c.employmentSituation,
      availableFrom: toDateOnly(c.availableFrom),
      lastConfirmedAt: c.lastConfirmedAt?.toISOString() ?? null,
      confirmationSource: c.confirmationSource,
      confirmationChannel: c.confirmationChannel,
      underlyingStatus: c.underlyingStatus,
      freshnessState: c.freshnessState,
    });
    await this.audit.record({
      actorId: id,
      entityType: "Contractor",
      entityId: id,
      action: "availability.confirmed",
      before: pick(before),
      after: pick(after),
    });
    return toMe(after, thresholds, now);
  }
}
