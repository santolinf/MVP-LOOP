import { Inject, Injectable } from "@nestjs/common";
import { prisma } from "@loop/db";
import { ELIGIBILITY_WORDING_VERSION } from "@loop/domain";
import type { EligibilityDeclarationRequest, EligibilityDeclarationResult } from "@loop/contracts";
import { AuditService } from "../../common/audit.service.js";
import { hashKey } from "../../common/rate-limit.js";

export interface CvOwner {
  contractorId?: string;
  draftId?: string;
}

/** Append-only: a declaration is never updated, a new one is inserted. */
@Injectable()
export class EligibilityService {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  async record(owner: CvOwner, input: EligibilityDeclarationRequest, ip: string | undefined): Promise<EligibilityDeclarationResult> {
    const row = await prisma.eligibilityDeclaration.create({
      data: {
        contractorId: owner.contractorId ?? null,
        draftId: owner.contractorId ? null : (owner.draftId ?? null),
        ukBased: input.ukBased,
        rightToWork: input.rightToWork,
        wordingVersion: input.wordingVersion || ELIGIBILITY_WORDING_VERSION,
        ipHash: ip ? hashKey(ip) : null,
      },
    });
    if (owner.contractorId) {
      await this.audit.record({
        actorId: owner.contractorId,
        entityType: "Contractor",
        entityId: owner.contractorId,
        action: "ELIGIBILITY_DECLARED",
        after: { wordingVersion: row.wordingVersion, ukBased: row.ukBased, rightToWork: row.rightToWork },
      });
    }
    return { recorded: true, wordingVersion: row.wordingVersion, recordedAt: row.createdAt.toISOString() };
  }
}
