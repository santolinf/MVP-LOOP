import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@loop/db";
import { describeAvailability, londonDate } from "@loop/domain";
import type { ConfirmAvailabilityRequest, Me } from "@loop/contracts";
// Nest DI needs the runtime class reference for constructor injection.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../../common/audit.service.js";

type Row = NonNullable<Awaited<ReturnType<typeof prisma.contractor.findUnique>>>;

function toDateOnly(d: Date | null): string | null {
  return d ? londonDate(d) : null;
}

export function toMe(c: Row, now: Date): Me {
  const a = describeAvailability(
    { employment: c.employmentSituation ?? "CONTRACTING", availableFrom: c.availableFrom, lastConfirmedAt: c.lastConfirmedAt },
    now,
  );
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
      nextCheckAt: a.nextCheckAt?.toISOString() ?? null,
    },
  };
}

@Injectable()
export class MeService {
  constructor(private readonly audit: AuditService) {}

  async get(id: string, now = new Date()): Promise<Me> {
    const c = await prisma.contractor.findUnique({ where: { id } });
    if (!c) throw new NotFoundException("Contractor not found");
    return toMe(c, now);
  }

  /** B3/A5: a web confirmation is a meaningful confirmation; source is always WEB. */
  async confirmAvailability(id: string, req: ConfirmAvailabilityRequest, now = new Date()): Promise<Me> {
    const before = await prisma.contractor.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Contractor not found");
    const after = await prisma.contractor.update({
      where: { id },
      data: {
        employmentSituation: req.employment,
        availableFrom: req.availableFrom ? new Date(`${req.availableFrom}T00:00:00Z`) : null,
        lastConfirmedAt: now,
        confirmationSource: "WEB",
      },
    });
    const pick = (c: Row) => ({
      employmentSituation: c.employmentSituation,
      availableFrom: toDateOnly(c.availableFrom),
      lastConfirmedAt: c.lastConfirmedAt?.toISOString() ?? null,
      confirmationSource: c.confirmationSource,
    });
    await this.audit.record({
      actorId: id,
      entityType: "Contractor",
      entityId: id,
      action: "availability.confirmed",
      before: pick(before),
      after: pick(after),
    });
    return toMe(after, now);
  }
}
