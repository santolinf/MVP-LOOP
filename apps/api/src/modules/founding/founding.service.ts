import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@loop/db";
import { FOUNDING_REQUIRED_REFERRALS, describeAvailability, isFoundingEligible } from "@loop/domain";
import type { FoundingStatus } from "@loop/contracts";
import { AuditService } from "../../common/audit.service.js";
import { loadFreshnessThresholds } from "../../common/freshness-config.js";
import { factsFor } from "../me/me.service.js";

class AlreadyAllocated extends Error {}

const candidate = (s: { registeredReferrals: number; isCurrent: boolean; requireAppSignIn: boolean; hasAppSignIn: boolean }) => ({
  uniqueRegisteredDirectReferrals: s.registeredReferrals,
  isCurrent: s.isCurrent,
  requireAppSignIn: s.requireAppSignIn,
  hasVerifiedAppSignIn: s.hasAppSignIn,
});

@Injectable()
export class FoundingService {
  // Explicit @Inject: the dev runner (tsx/esbuild) does not emit design:paramtypes metadata.
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  /**
   * "Registered" = attribution locked at GO LIVE and not held by an open or confirmed review flag (Phase 9).
   * TODO(spec): Open Question 11 - the verified first app sign-in condition is behind the
   * `founding.require_app_signin` flag, off by default because the app is deferred.
   */
  private async snapshot(id: string, now: Date) {
    const c = await prisma.contractor.findUnique({ where: { id } });
    if (!c) throw new NotFoundException("Contractor not found");
    const refs = await prisma.referral.findMany({ where: { referrerId: id, lockedAt: { not: null } }, select: { id: true } });
    const held = refs.length
      ? await prisma.referralFlag.findMany({
          where: { referralId: { in: refs.map((r) => r.id) }, status: { in: ["OPEN", "CONFIRMED"] } },
          select: { referralId: true },
        })
      : [];
    const heldIds = new Set(held.map((h) => h.referralId));
    const registeredReferrals = refs.filter((r) => !heldIds.has(r.id)).length;
    const requireAppSignIn = (await prisma.featureFlag.findUnique({ where: { key: "founding.require_app_signin" } }))?.enabled ?? false;
    // "Current" = availability confirmed and not stale (anything but grey).
    const isCurrent =
      describeAvailability(factsFor(c, now), await loadFreshnessThresholds(), now).colour !== "GREY";
    return { place: c.foundingPlace, registeredReferrals, isCurrent, requireAppSignIn, hasAppSignIn: Boolean(c.firstAppSignInAt) };
  }

  async status(id: string, now = new Date()): Promise<FoundingStatus> {
    const s = await this.snapshot(id, now);
    return {
      required: FOUNDING_REQUIRED_REFERRALS,
      registeredReferrals: s.registeredReferrals,
      isCurrentProfile: s.isCurrent,
      eligible: isFoundingEligible(candidate(s)),
      place: s.place,
    };
  }

  /**
   * B6: allocate the next place if eligible. One conditional counter update plus the contractor
   * update in a single transaction; never count-then-insert. Returns the place, or null.
   * Invoked when a referee completes registration. TODO(spec): also invoke when a contractor reconfirms availability.
   */
  async allocateIfEligible(id: string, now = new Date()): Promise<number | null> {
    const s = await this.snapshot(id, now);
    if (s.place !== null) return s.place;
    if (!isFoundingEligible(candidate(s))) return null;
    let place: number | null;
    try {
      place = await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ allocated: number }[]>`
          UPDATE "FoundingCounter" SET "allocated" = "allocated" + 1
          WHERE "id" = 1 AND "allocated" < "cap" RETURNING "allocated"`;
        const next = rows[0]?.allocated;
        if (next === undefined) return null; // cap reached
        const res = await tx.contractor.updateMany({ where: { id, foundingPlace: null }, data: { foundingPlace: next } });
        if (res.count === 0) throw new AlreadyAllocated(); // lost a race for this contractor: roll the counter back
        return next;
      });
    } catch (e) {
      if (e instanceof AlreadyAllocated) return (await this.snapshot(id, now)).place;
      throw e;
    }
    if (place !== null) {
      await this.audit.record({
        actorId: id,
        entityType: "Contractor",
        entityId: id,
        action: "founding.allocated",
        before: { foundingPlace: null },
        after: { foundingPlace: place },
      });
    }
    return place;
  }
}
