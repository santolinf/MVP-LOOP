import type { PgBoss } from "pg-boss";
import { prisma } from "@loop/db";
import { loadEnv } from "../config/index.js";
import { StorageService } from "../modules/cv/storage.service.js";

export const CV_ORPHAN_CLEANUP = "cv-orphan-cleanup";

interface ObjectStore {
  delete(key: string): Promise<void>;
}

/**
 * Removes anonymous uploads that were never adopted by an account (expired drafts) and
 * abandoned PENDING uploads, deleting their S3 objects first. Idempotent: S3 deletes of
 * missing keys succeed and rows are removed only after their objects are gone.
 * TODO(spec): retention period for orphaned uploads is Open Question 2; CV_ORPHAN_TTL_HOURS is a placeholder.
 */
export async function runCvOrphanCleanup(
  store: ObjectStore,
  ttlHours: number,
  now = new Date(),
): Promise<{ uploads: number; drafts: number }> {
  const staleBefore = new Date(now.getTime() - ttlHours * 3_600_000);

  const expiredDrafts = await prisma.uploadDraft.findMany({
    where: { adoptedById: null, expiresAt: { lte: now } },
    select: { id: true },
  });
  const draftIds = expiredDrafts.map((d) => d.id);

  const uploads = await prisma.cvUpload.findMany({
    where: {
      OR: [
        { contractorId: null, draftId: { in: draftIds } },
        { contractorId: null, status: "PENDING", createdAt: { lte: staleBefore } },
      ],
    },
    select: { id: true, quarantineKey: true, objectKey: true },
  });

  for (const u of uploads) {
    await store.delete(u.quarantineKey);
    if (u.objectKey) await store.delete(u.objectKey);
  }
  const removedUploads = await prisma.cvUpload.deleteMany({ where: { id: { in: uploads.map((u) => u.id) } } });

  await prisma.eligibilityDeclaration.deleteMany({ where: { contractorId: null, draftId: { in: draftIds } } });
  const removedDrafts = await prisma.uploadDraft.deleteMany({ where: { id: { in: draftIds }, adoptedById: null } });
  return { uploads: removedUploads.count, drafts: removedDrafts.count };
}

export async function registerCvOrphanCleanup(boss: PgBoss): Promise<void> {
  const env = loadEnv();
  const storage = new StorageService(env);
  await boss.createQueue(CV_ORPHAN_CLEANUP);
  await boss.work(CV_ORPHAN_CLEANUP, async () => {
    await runCvOrphanCleanup(storage, env.CV_ORPHAN_TTL_HOURS);
  });
  await boss.schedule(CV_ORPHAN_CLEANUP, "17 * * * *", {}, { singletonKey: CV_ORPHAN_CLEANUP });
}
