import { Prisma, prisma } from "@loop/db";
import { diffCvExtraction, type FieldValue } from "@loop/domain";
import { ExtractionFieldKeySchema } from "@loop/contracts";

interface RunField extends FieldValue {
  sourceExcerpt: string;
}

function runFields(json: unknown): RunField[] {
  if (!Array.isArray(json)) return [];
  const out: RunField[] = [];
  for (const raw of json) {
    const f = raw as { id?: unknown; key?: unknown; value?: unknown; sourceExcerpt?: unknown } | null;
    const key = ExtractionFieldKeySchema.safeParse(f?.key);
    if (!f || !key.success || typeof f.id !== "string" || typeof f.value !== "string") continue;
    out.push({ id: f.id, key: key.data, value: f.value, sourceExcerpt: String(f.sourceExcerpt ?? "") });
  }
  return out;
}

/**
 * Phase 7: gives an authenticated READY upload its place in the contractor's history. Idempotent per upload;
 * a numbering clash with a parallel upload retries with the next number.
 */
export async function recordCvVersion(contractorId: string, cvUploadId: string): Promise<{ id: string; versionNumber: number }> {
  for (let attempt = 0; ; attempt++) {
    const existing = await prisma.cvVersion.findUnique({ where: { cvUploadId } });
    if (existing) return existing;
    const last = await prisma.cvVersion.aggregate({ where: { contractorId }, _max: { versionNumber: true } });
    try {
      return await prisma.cvVersion.create({ data: { contractorId, cvUploadId, versionNumber: (last._max.versionNumber ?? 0) + 1 } });
    } catch (e) {
      if (attempt < 3 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
}

/**
 * Compares a newer CV's extraction with the contractor-confirmed profile and stores every difference as a PENDING
 * CvChange (A5). Never touches ConfirmedProfileField. Version 1 goes through the normal first-time review, so it
 * proposes nothing. Idempotent: a version that already has changes is left alone.
 */
export async function proposeCvChanges(cvUploadId: string): Promise<number> {
  const version = await prisma.cvVersion.findUnique({ where: { cvUploadId } });
  if (!version || version.versionNumber <= 1) return 0;
  if ((await prisma.cvChange.count({ where: { cvVersionId: version.id } })) > 0) return 0;
  const run = await prisma.extractionRun.findUnique({ where: { cvUploadId } });
  if (!run || run.status !== "READY") return 0;

  const proposed = runFields(run.fields);
  const confirmed = await prisma.confirmedProfileField.findMany({
    where: { contractorId: version.contractorId, extractionRunId: { not: run.id } },
    orderBy: { createdAt: "asc" },
  });
  const changes = diffCvExtraction(
    confirmed.map((c) => ({ id: c.id, key: c.key, value: c.value })),
    proposed,
  );
  if (changes.length === 0) return 0;
  const excerpts = new Map(proposed.map((p) => [p.id, p.sourceExcerpt]));
  await prisma.cvChange.createMany({
    data: changes.map((c) => ({
      contractorId: version.contractorId,
      cvVersionId: version.id,
      key: c.key,
      kind: c.kind,
      material: c.material,
      previousFieldId: c.previous?.id ?? null,
      previousValue: c.previous?.value ?? null,
      proposedFieldId: c.proposed?.id ?? null,
      proposedValue: c.proposed?.value ?? null,
      proposedExcerpt: c.proposed ? (excerpts.get(c.proposed.id) ?? null) : null,
    })),
  });
  return changes.length;
}

interface ObjectStore {
  delete(key: string): Promise<void>;
}

/**
 * Removes every CV file and everything derived from it: versions, pending changes, extraction runs and upload rows.
 * Objects go first so a storage failure leaves the rows to retry from. Contractor-confirmed profile fields stay;
 * they are the contractor's own data and are removed only by account erasure.
 */
export async function purgeCvData(contractorId: string, store: ObjectStore): Promise<number> {
  const uploads = await prisma.cvUpload.findMany({ where: { contractorId }, select: { id: true, quarantineKey: true, objectKey: true } });
  for (const u of uploads) {
    await store.delete(u.quarantineKey);
    if (u.objectKey) await store.delete(u.objectKey);
  }
  await prisma.$transaction([
    prisma.cvChange.deleteMany({ where: { contractorId } }),
    prisma.cvVersion.deleteMany({ where: { contractorId } }),
    prisma.extractionRun.deleteMany({ where: { OR: [{ contractorId }, { cvUploadId: { in: uploads.map((u) => u.id) } }] } }),
    prisma.cvUpload.deleteMany({ where: { contractorId } }),
  ]);
  return uploads.length;
}
