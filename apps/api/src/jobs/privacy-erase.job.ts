import type { PgBoss } from "pg-boss";
import { loadEnv } from "../config/index.js";
import { StorageService } from "../modules/cv/storage.service.js";
import { eraseContractor } from "../modules/privacy/erasure.js";

export const PRIVACY_ERASE_JOB = "privacy.erase";

export interface PrivacyEraseJobData {
  contractorId: string;
}

/** Retry policy applied when enqueuing (see PrivacyService.requestErasure). */
export const PRIVACY_ERASE_SEND_OPTIONS = { retryLimit: 5, retryDelay: 60, retryBackoff: true } as const;

export async function registerPrivacyErase(boss: PgBoss): Promise<void> {
  const storage = new StorageService(loadEnv());
  await boss.createQueue(PRIVACY_ERASE_JOB);
  await boss.work<PrivacyEraseJobData>(PRIVACY_ERASE_JOB, async (jobs) => {
    for (const job of jobs) await eraseContractor(job.data.contractorId, storage);
  });
}
