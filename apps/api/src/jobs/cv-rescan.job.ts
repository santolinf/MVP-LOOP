import type { PgBoss } from "pg-boss";
import { prisma } from "@loop/db";
import { loadEnv } from "../config/index.js";
import { AuditService } from "../common/audit.service.js";
import { ClamavService, type ScanVerdict } from "../modules/cv/clamav.service.js";
import { StorageService } from "../modules/cv/storage.service.js";

export const CV_RESCAN = "cv-rescan";
const BATCH = 50;

interface Store {
  readStream(key: string): ReturnType<StorageService["readStream"]>;
  delete(key: string): Promise<void>;
}
interface Scanner {
  scan(stream: Awaited<ReturnType<StorageService["readStream"]>>): Promise<ScanVerdict>;
}
interface Audit {
  record: AuditService["record"];
}

/**
 * Re-scans stored (READY) CVs whose last clean verdict is older than `intervalDays`, oldest first, because signatures
 * improve after upload (ADR 0012). A file that now scans INFECTED is deleted and its upload REJECTED, with an audit
 * event. A scan error leaves the file as it was (still READY, still due) and the job retries on its next run; the run
 * throws only when nothing at all could be scanned, so an outage is visible.
 */
export async function runCvRescan(
  store: Store,
  scanner: Scanner,
  audit: Audit,
  intervalDays: number,
  now = new Date(),
): Promise<{ clean: number; infected: number; failed: number }> {
  const dueBefore = new Date(now.getTime() - intervalDays * 86_400_000);
  const due = await prisma.cvUpload.findMany({
    where: { status: "READY", objectKey: { not: null }, OR: [{ lastScannedAt: null }, { lastScannedAt: { lte: dueBefore } }] },
    orderBy: { lastScannedAt: { sort: "asc", nulls: "first" } },
    take: BATCH,
    select: { id: true, contractorId: true, objectKey: true },
  });

  const out = { clean: 0, infected: 0, failed: 0 };
  for (const u of due) {
    if (!u.objectKey) continue;
    try {
      const verdict = await scanner.scan(await store.readStream(u.objectKey));
      if (verdict === "CLEAN") {
        await prisma.cvUpload.update({ where: { id: u.id }, data: { lastScannedAt: now } });
        out.clean++;
        continue;
      }
      await store.delete(u.objectKey);
      await prisma.cvUpload.update({ where: { id: u.id }, data: { status: "REJECTED", lastScannedAt: now } });
      await audit.record({
        actorType: "SYSTEM",
        entityType: "CvUpload",
        entityId: u.id,
        action: "CV_UPLOAD_RESCAN_INFECTED",
        before: { status: "READY" },
        after: { status: "REJECTED" },
      });
      out.infected++;
    } catch {
      // No file content or scanner output in logs.
      console.warn(`cv.rescan failed for upload ${u.id}`);
      out.failed++;
    }
  }
  if (out.failed > 0 && out.clean + out.infected === 0) throw new Error("cv.rescan: no file could be scanned");
  return out;
}

export async function registerCvRescan(boss: PgBoss): Promise<void> {
  const env = loadEnv();
  const storage = new StorageService(env);
  const clamav = new ClamavService(env);
  const audit = new AuditService();
  await boss.createQueue(CV_RESCAN);
  await boss.work(CV_RESCAN, async () => {
    await runCvRescan(storage, clamav, audit, env.CV_RESCAN_INTERVAL_DAYS);
  });
  await boss.schedule(CV_RESCAN, "41 * * * *", {}, { singletonKey: CV_RESCAN });
}
