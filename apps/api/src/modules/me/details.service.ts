import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@loop/db";
import { ProfileDetailsSchema, type ProfileDetails, type UpdateNameRequest } from "@loop/contracts";
import { AuditService } from "../../common/audit.service.js";

const EMPTY: ProfileDetails = { securityClearance: null, ir35Status: null, workPattern: null };

/**
 * Phase 7 app-spec fields (clearance, IR35 status, work pattern) and the contractor's name. Rates are the
 * existing `rateBand` preference. Saving these is not an availability confirmation.
 */
@Injectable()
export class DetailsService {
  // Explicit @Inject: the dev runner (tsx/esbuild) does not emit design:paramtypes metadata.
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  async get(contractorId: string): Promise<ProfileDetails> {
    const row = await prisma.contractorProfileDetails.findUnique({ where: { contractorId } });
    if (!row) return EMPTY;
    // Rows are only written through validated requests; parsing again guards against hand-edited data.
    const parsed = ProfileDetailsSchema.safeParse({
      securityClearance: row.securityClearance,
      ir35Status: row.ir35Status,
      workPattern: row.workPattern,
      summary: row.summary,
      qualifications: row.qualifications,
    });
    return parsed.success ? parsed.data : EMPTY;
  }

  /** Replaces the whole set. Naturally idempotent. */
  async replace(contractorId: string, req: ProfileDetails): Promise<ProfileDetails> {
    const exists = await prisma.contractor.findUnique({ where: { id: contractorId }, select: { id: true } });
    if (!exists) throw new NotFoundException("Contractor not found");
    const before = await this.get(contractorId);
    await prisma.contractorProfileDetails.upsert({ where: { contractorId }, create: { contractorId, ...req }, update: req });
    await this.audit.record({ actorId: contractorId, entityType: "Contractor", entityId: contractorId, action: "profile.details.updated", before, after: req });
    return req;
  }

  async updateName(contractorId: string, req: UpdateNameRequest): Promise<UpdateNameRequest> {
    const before = await prisma.contractor.findUnique({ where: { id: contractorId }, select: { firstName: true, lastName: true } });
    if (!before) throw new NotFoundException("Contractor not found");
    await prisma.contractor.update({ where: { id: contractorId }, data: { firstName: req.firstName, lastName: req.lastName } });
    await this.audit.record({ actorId: contractorId, entityType: "Contractor", entityId: contractorId, action: "profile.name.updated", before, after: req });
    return req;
  }
}
