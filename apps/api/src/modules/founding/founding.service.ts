import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@loop/db";
import { FOUNDING_REQUIRED_REFERRALS, describeAvailability, isFoundingEligible } from "@loop/domain";
import type { FoundingStatus } from "@loop/contracts";
import { AuditService } from "../../common/audit.service.js";

class AlreadyAllocated extends Error {}

@Injectable()
export class FoundingService {
  // Explicit @Inject: the dev runner (tsx/esbuild) does not emit design:paramtypes metadata.
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  /** TODO(spec): confirm "registered" means the referee is live. */
  private async snapshot(id: string, now: Date) {
    const c = await prisma.contractor.findUnique({ where: { id } });
    if (!c) throw new NotFoundException("Contractor not found");
    const refs = await prisma.referral.findMany({ where: { referrerId: id }, select: { refereeId: true } });
    const registeredReferrals = refs.length
      ? await prisma.contractor.count({ where: { id: { in: refs.map((r) => r.refereeId) }, live: true } })
      : 0;
    // "Current" = availability confirmed and not stale (anything but grey).
    const isCurrent =
      describeAvailability(
        { employment: c.employmentSituation ?? "CONTRACTING", availableFrom: c.availableFrom, lastConfirmedAt: c.lastConfirmedAt },
        now,
      ).colour !== "GREY";
    return { place: c.foundingPlace, registeredReferrals, isCurrent };
  }

  async status(id: string, now = new Date()): Promise<FoundingStatus> {
    const s = await this.snapshot(id, now);
    return {
      required: FOUNDING_REQUIRED_REFERRALS,
      registeredReferrals: s.registeredReferrals,
      isCurrentProfile: s.isCurrent,
      eligible: isFoundingEligible({ uniqueRegisteredDirectReferrals: s.registeredReferrals, isCurrent: s.isCurrent }),
      place: s.place,
    };
  }

  /**
   * B6: allocate the next place if eligible. One conditional counter update plus the contractor
   * update in a single transaction; never count-then-insert. Returns the place, or null.
   * TODO(spec): also invoke when a referee goes live or a contractor reconfirms availability.
   */
  async allocateIfEligible(id: string, now = new Date()): Promise<number | null> {
    const s = await this.snapshot(id, now);
    if (s.place !== null) return s.place;
    if (!isFoundingEligible({ uniqueRegisteredDirectReferrals: s.registeredReferrals, isCurrent: s.isCurrent })) return null;
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
