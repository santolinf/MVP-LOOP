import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@loop/db";
import { PreferencesSchema, type Preferences, type UpdatePreferencesRequest } from "@loop/contracts";
import { AuditService } from "../../common/audit.service.js";

const EMPTY: Preferences = { workTypes: [], rateBand: null, remote: null, regions: [], sectors: [], noticePeriod: null };

type Row = NonNullable<Awaited<ReturnType<typeof prisma.contractorPreferences.findUnique>>>;

/** Rows are written only through validated requests; parsing again guards against hand-edited data. */
function toPreferences(r: Row | null): Preferences {
  if (!r) return EMPTY;
  const parsed = PreferencesSchema.safeParse({
    workTypes: r.workTypes,
    rateBand: r.rateBand,
    remote: r.remote,
    regions: r.regions,
    sectors: r.sectors,
    noticePeriod: r.noticePeriod,
  });
  return parsed.success ? parsed.data : EMPTY;
}

/**
 * Phase 5 preferences. Saving preferences is not an availability confirmation: it never touches
 * lastConfirmedAt or confirmationSource.
 */
@Injectable()
export class PreferencesService {
  // Explicit @Inject: the dev runner (tsx/esbuild) does not emit design:paramtypes metadata.
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  async get(contractorId: string): Promise<Preferences> {
    return toPreferences(await prisma.contractorPreferences.findUnique({ where: { contractorId } }));
  }

  async replace(contractorId: string, req: UpdatePreferencesRequest): Promise<Preferences> {
    const exists = await prisma.contractor.findUnique({ where: { id: contractorId }, select: { id: true } });
    if (!exists) throw new NotFoundException("Contractor not found");
    const before = await this.get(contractorId);
    const row = await prisma.contractorPreferences.upsert({
      where: { contractorId },
      create: { contractorId, ...req },
      update: req,
    });
    const after = toPreferences(row);
    await this.audit.record({
      actorId: contractorId,
      entityType: "Contractor",
      entityId: contractorId,
      action: "preferences.updated",
      before,
      after,
    });
    return after;
  }
}
