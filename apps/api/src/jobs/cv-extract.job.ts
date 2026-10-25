import type { PgBoss } from "pg-boss";
import { prisma } from "@loop/db";
import { isReadableCvText, verifyExtraction } from "@loop/domain";
import { LlmOutputSchema, type LlmOutput } from "@loop/contracts";
import { loadEnv } from "../config/index.js";
import { proposeCvChanges } from "../modules/cv/cv-changes.js";

export const CV_EXTRACT_JOB = "cv.extract";

export interface CvExtractJobData {
  uploadId: string;
}

/** Retry policy applied when enqueuing (see CvService.complete). */
export const CV_EXTRACT_SEND_OPTIONS = { retryLimit: 3, retryDelay: 30, retryBackoff: true } as const;

/** Turns a stored CV object into plain text. */
export interface TextExtractor {
  extract(objectKey: string, detectedType: string): Promise<string>;
}

/** Sends CV text (and nothing else, for data minimisation) to an LLM and returns candidate fields. */
export interface LlmProvider {
  extractFields(cvText: string): Promise<unknown>;
}

/**
 * MVP stub: the real LLM call is out of scope for now. Returns no fields, so every run lands in
 * the "enter your details manually" state. Swap for a real provider behind this interface.
 */
export class MockLlmProvider implements LlmProvider {
  async extractFields(): Promise<LlmOutput> {
    return { fields: [] };
  }
}

/**
 * TODO(spec): no PDF/DOC/DOCX text-extraction library is installed in apps/api, and adding a
 * runtime dependency needs sign-off. Until then this returns empty text, which maps to COULD_NOT_READ.
 */
export class UnavailableTextExtractor implements TextExtractor {
  async extract(): Promise<string> {
    return "";
  }
}

export interface CvExtractDeps {
  text: TextExtractor;
  llm: LlmProvider;
  minConfidence: number;
  minChars: number;
  maxTextChars: number;
}

const TERMINAL = new Set(["READY", "COULD_NOT_READ"]);

/**
 * Idempotent: a run already in a terminal state is left alone. CV text is untrusted, so the
 * provider output is Zod-validated and every field must carry a verbatim excerpt from the CV (A4).
 * Never logs CV content.
 */
export async function runCvExtract(data: CvExtractJobData, deps: CvExtractDeps): Promise<string> {
  const upload = await prisma.cvUpload.findUnique({ where: { id: data.uploadId } });
  if (!upload || upload.status !== "READY" || !upload.objectKey || !upload.detectedType) return "SKIPPED";

  const existing = await prisma.extractionRun.findUnique({ where: { cvUploadId: upload.id } });
  if (existing && TERMINAL.has(existing.status)) {
    // The proposal step is idempotent, so a retry after a failure between "READY" and here still completes it.
    if (existing.status === "READY") await proposeCvChanges(upload.id);
    return existing.status;
  }

  await prisma.extractionRun.upsert({
    where: { cvUploadId: upload.id },
    create: { cvUploadId: upload.id, contractorId: upload.contractorId, status: "PENDING" },
    update: { status: "PENDING", error: null },
  });

  const finish = (status: string, fields: unknown[] = []) =>
    prisma.extractionRun.update({
      where: { cvUploadId: upload.id },
      data: { status, fields: fields as never, completedAt: new Date() },
    });

  const raw = await deps.text.extract(upload.objectKey, upload.detectedType);
  const cvText = raw.slice(0, deps.maxTextChars);
  if (!isReadableCvText(cvText, deps.minChars)) {
    await finish("COULD_NOT_READ");
    return "COULD_NOT_READ";
  }

  const parsed = LlmOutputSchema.safeParse(await deps.llm.extractFields(cvText));
  const candidates = parsed.success ? parsed.data.fields : [];
  const verified = verifyExtraction(candidates, cvText, deps.minConfidence);
  if (verified.fields.length === 0) {
    await finish("COULD_NOT_READ");
    return "COULD_NOT_READ";
  }

  await finish(
    "READY",
    verified.fields.map((f, i) => ({ id: `f${i + 1}`, ...f })),
  );
  await proposeCvChanges(upload.id);
  return "READY";
}

export async function registerCvExtract(boss: PgBoss): Promise<void> {
  const env = loadEnv();
  const deps: CvExtractDeps = {
    text: new UnavailableTextExtractor(),
    llm: new MockLlmProvider(),
    minConfidence: env.EXTRACTION_MIN_CONFIDENCE,
    minChars: env.EXTRACTION_MIN_CHARS,
    maxTextChars: env.EXTRACTION_MAX_TEXT_CHARS,
  };
  await boss.createQueue(CV_EXTRACT_JOB);
  await boss.work<CvExtractJobData>(CV_EXTRACT_JOB, async (jobs) => {
    for (const job of jobs) await runCvExtract(job.data, deps);
  });
}
