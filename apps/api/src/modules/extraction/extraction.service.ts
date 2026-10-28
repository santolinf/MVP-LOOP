import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@loop/db";
import type { ExtractedField, ExtractionReview } from "@loop/contracts";
import { ExtractionFieldKeySchema } from "@loop/contracts";
import { AuditService } from "../../common/audit.service.js";
import type { CvOwner } from "../cv/eligibility.service.js";

interface StoredField {
  id: string;
  key: string;
  value: string;
  sourceExcerpt: string;
  confidence: number;
}

function storedFields(json: unknown): StoredField[] {
  if (!Array.isArray(json)) return [];
  const out: StoredField[] = [];
  for (const raw of json) {
    const f = raw as Partial<StoredField> | null;
    const key = ExtractionFieldKeySchema.safeParse(f?.key);
    if (!f || !key.success || typeof f.id !== "string" || typeof f.value !== "string") continue;
    out.push({
      id: f.id,
      key: key.data,
      value: f.value,
      sourceExcerpt: String(f.sourceExcerpt ?? ""),
      confidence: Number(f.confidence ?? 0),
    });
  }
  return out;
}

/** A5: AI suggestions live in ExtractionRun; contractor-confirmed values live in ConfirmedProfileField. */
@Injectable()
export class ExtractionService {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  private async findOwnedUpload(owner: CvOwner, uploadId: string) {
    const where = owner.contractorId
      ? { id: uploadId, contractorId: owner.contractorId }
      : { id: uploadId, draftId: owner.draftId };
    const upload = await prisma.cvUpload.findFirst({ where });
    if (!upload) throw new NotFoundException("Upload not found");
    return upload;
  }

  async getReview(owner: CvOwner, uploadId: string): Promise<ExtractionReview> {
    const upload = await this.findOwnedUpload(owner, uploadId);
    const run = await prisma.extractionRun.findUnique({ where: { cvUploadId: upload.id } });
    if (!run || run.status === "PENDING") return { uploadId, status: "PENDING", fields: [] };
    if (run.status !== "READY") return { uploadId, status: "COULD_NOT_READ", fields: [] };

    const confirmed = await prisma.confirmedProfileField.findMany({ where: { extractionRunId: run.id } });
    const byField = new Map(confirmed.map((c) => [c.fieldId, c.value]));
    const fields: ExtractedField[] = storedFields(run.fields).map((f) => ({
      id: f.id,
      key: f.key as ExtractedField["key"],
      suggestedValue: f.value,
      sourceExcerpt: f.sourceExcerpt,
      confidence: f.confidence,
      confirmedValue: byField.get(f.id) ?? null,
    }));
    return { uploadId, status: "READY", fields };
  }

  /**
   * Confirm the suggestion as-is, or edit it by supplying a value. Anonymous draft owners may confirm too
   * (the journey reviews the CV before registration); their confirmations move to the contractor on adoption.
   */
  async confirmField(
    owner: CvOwner,
    uploadId: string,
    fieldId: string,
    value: string | undefined,
  ): Promise<ExtractedField> {
    const upload = await this.findOwnedUpload(owner, uploadId);
    const run = await prisma.extractionRun.findUnique({ where: { cvUploadId: upload.id } });
    const field = run?.status === "READY" ? storedFields(run.fields).find((f) => f.id === fieldId) : undefined;
    if (!run || !field) throw new NotFoundException("Field not found");
    // Phase 7: a replacement CV never writes confirmed data directly; its differences go through the change review.
    const version = owner.contractorId ? await prisma.cvVersion.findUnique({ where: { cvUploadId: upload.id } }) : null;
    if (version && version.versionNumber > 1) throw new ConflictException("Review the changes from your new CV instead");

    const final = value ?? field.value;
    const contractorId = owner.contractorId ?? null;
    const draftId = owner.contractorId ? null : (owner.draftId ?? null);
    const before = await prisma.confirmedProfileField.findUnique({
      where: { extractionRunId_fieldId: { extractionRunId: run.id, fieldId } },
    });
    const row = await prisma.confirmedProfileField.upsert({
      where: { extractionRunId_fieldId: { extractionRunId: run.id, fieldId } },
      create: {
        contractorId,
        draftId,
        extractionRunId: run.id,
        fieldId,
        key: field.key,
        value: final,
        edited: final !== field.value,
      },
      update: { value: final, edited: final !== field.value },
    });
    await this.audit.record({
      actorId: contractorId ?? undefined,
      entityType: "ConfirmedProfileField",
      entityId: row.id,
      action: before ? "PROFILE_FIELD_RECONFIRMED" : "PROFILE_FIELD_CONFIRMED",
      before: before ? { value: before.value, edited: before.edited } : undefined,
      after: { key: field.key, value: row.value, edited: row.edited, ...(draftId ? { draftId } : {}) },
    });
    return {
      id: field.id,
      key: field.key as ExtractedField["key"],
      suggestedValue: field.value,
      sourceExcerpt: field.sourceExcerpt,
      confidence: field.confidence,
      confirmedValue: row.value,
    };
  }
}
