import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@loop/db";
import { ManualProfileSchema, type ManualProfile } from "@loop/contracts";
import { AuditService } from "../../common/audit.service.js";

const runIdFor = (contractorId: string): string => `manual:${contractorId}`;

/**
 * Profile details the contractor types themselves. They are stored as ConfirmedProfileField rows under a
 * per-contractor pseudo run id (`manual:<id>`), so they stay separate from AI extraction runs (A5) and
 * satisfy the (extractionRunId, fieldId) unique key without a schema change.
 */
@Injectable()
export class ProfileService {
  // Explicit @Inject: the dev runner (tsx/esbuild) does not emit design:paramtypes metadata.
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  async get(contractorId: string): Promise<ManualProfile> {
    const rows = await prisma.confirmedProfileField.findMany({
      where: { contractorId, extractionRunId: runIdFor(contractorId) },
      orderBy: { fieldId: "asc" },
    });
    const parsed = ManualProfileSchema.safeParse({
      headline: rows.find((r) => r.key === "headline")?.value ?? null,
      skills: rows.filter((r) => r.key === "skill").map((r) => r.value),
    });
    return parsed.success ? parsed.data : { headline: null, skills: [] };
  }

  /** Replaces the typed headline and skills. Naturally idempotent. */
  async replace(contractorId: string, req: ManualProfile): Promise<ManualProfile> {
    const exists = await prisma.contractor.findUnique({ where: { id: contractorId }, select: { id: true } });
    if (!exists) throw new NotFoundException("Contractor not found");
    const before = await this.get(contractorId);
    const extractionRunId = runIdFor(contractorId);
    const skills = [...new Set(req.skills)];
    await prisma.$transaction(async (tx) => {
      await tx.confirmedProfileField.deleteMany({ where: { contractorId, extractionRunId } });
      const rows = [
        ...(req.headline ? [{ fieldId: "headline", key: "headline", value: req.headline }] : []),
        ...skills.map((value, i) => ({ fieldId: `skill-${String(i + 1).padStart(2, "0")}`, key: "skill", value })),
      ];
      if (rows.length > 0) {
        await tx.confirmedProfileField.createMany({
          data: rows.map((r) => ({ ...r, contractorId, extractionRunId, edited: true })),
        });
      }
    });
    const after: ManualProfile = { headline: req.headline, skills };
    await this.audit.record({
      actorId: contractorId,
      entityType: "Contractor",
      entityId: contractorId,
      action: "profile.manual.updated",
      before,
      after,
    });
    return after;
  }
}
