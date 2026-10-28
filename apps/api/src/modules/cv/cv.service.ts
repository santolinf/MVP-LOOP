import { randomUUID } from "node:crypto";
import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@loop/db";
import { checkCvDeclaration, decideAnonymousUpload, detectCvType, detectedMatchesDeclared } from "@loop/domain";
import type { CvDownload, CvPresignRequest, CvPresignResponse, CvUploadStatus } from "@loop/contracts";
import { AuditService } from "../../common/audit.service.js";
import { hashKey } from "../../common/rate-limit.js";
import type { Env } from "../../config/index.js";
import { CV_EXTRACT_JOB, CV_EXTRACT_SEND_OPTIONS } from "../../jobs/cv-extract.job.js";
import { recordCvVersion } from "./cv-changes.js";
import { ClamavService } from "./clamav.service.js";
import type { CvOwner } from "./eligibility.service.js";
import { JOB_QUEUE, type JobQueue } from "./job-queue.service.js";
import { CV_ENV, QUARANTINE_PREFIX, READY_PREFIX, StorageService } from "./storage.service.js";

const REJECT_MESSAGE = "We couldn't accept that file. Please check it is a PDF, DOC or DOCX and try again.";
const EXT = { PDF: "pdf", DOC: "doc", DOCX: "docx" } as const;

type UploadStatus = CvUploadStatus["status"];

@Injectable()
export class CvService {
  constructor(
    @Inject(CV_ENV) private readonly env: Env,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(ClamavService) private readonly clamav: ClamavService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
  ) {}

  async presign(owner: CvOwner, input: CvPresignRequest, ip: string | undefined, now = new Date()): Promise<CvPresignResponse> {
    const authenticated = Boolean(owner.contractorId);
    const maxBytes = authenticated ? this.env.CV_MAX_BYTES_AUTH : this.env.CV_MAX_BYTES_ANON;
    const check = checkCvDeclaration(input.mimeType, input.sizeBytes, maxBytes);
    if (!check.ok) throw new BadRequestException(check.reason === "TOO_LARGE" ? "File is too large" : "Unsupported or empty file");

    const ipHash = ip ? hashKey(ip) : null;
    if (!authenticated) {
      const since = new Date(now.getTime() - 3_600_000);
      const [uploadsLastHourForIp, anonUploadsLastHourGlobal] = await Promise.all([
        ipHash ? prisma.cvUpload.count({ where: { contractorId: null, ipHash, createdAt: { gte: since } } }) : Promise.resolve(0),
        prisma.cvUpload.count({ where: { contractorId: null, createdAt: { gte: since } } }),
      ]);
      const decision = decideAnonymousUpload(
        { authenticated, uploadsLastHourForIp, anonUploadsLastHourGlobal },
        { perIpPerHour: this.env.CV_ANON_UPLOADS_PER_IP_PER_HOUR, globalPerHour: this.env.CV_ANON_UPLOADS_GLOBAL_PER_HOUR },
      );
      if (!decision.allowed) throw new HttpException("Too many uploads. Please try again later.", HttpStatus.TOO_MANY_REQUESTS);
    }

    const quarantineKey = `${QUARANTINE_PREFIX}${randomUUID()}`;
    const row = await prisma.cvUpload.create({
      data: {
        contractorId: owner.contractorId ?? null,
        draftId: owner.contractorId ? null : (owner.draftId ?? null),
        declaredMime: input.mimeType,
        declaredSize: input.sizeBytes,
        quarantineKey,
        ipHash,
      },
    });
    const ttl = this.env.CV_PRESIGN_TTL_SECONDS;
    const uploadUrl = await this.storage.presignPut(quarantineKey, input.mimeType, ttl);
    return { uploadId: row.id, uploadUrl, method: "PUT", headers: { "Content-Type": input.mimeType }, expiresInSeconds: ttl, maxBytes };
  }

  /** Verifies, scans and promotes. A scan or storage error never promotes: the row reverts to PENDING and the error propagates. */
  async complete(owner: CvOwner, uploadId: string): Promise<CvUploadStatus> {
    const upload = await this.findOwned(owner, uploadId);
    if (upload.status !== "PENDING") return toStatus(upload);

    const claimed = await prisma.cvUpload.updateMany({ where: { id: upload.id, status: "PENDING" }, data: { status: "SCANNING" } });
    if (claimed.count !== 1) return toStatus((await this.findOwned(owner, uploadId)) ?? upload);

    try {
      const maxBytes = owner.contractorId ? this.env.CV_MAX_BYTES_AUTH : this.env.CV_MAX_BYTES_ANON;
      const size = await this.storage.size(upload.quarantineKey);
      const sizeOk = size !== null && checkCvDeclaration(upload.declaredMime, size, maxBytes).ok;
      if (!sizeOk) return await this.reject(upload.id, upload.quarantineKey, owner, "SIZE_OR_MISSING");

      const detected = detectCvType(await this.storage.readHead(upload.quarantineKey, 600));
      if (!detected || !detectedMatchesDeclared(detected, upload.declaredMime)) {
        return await this.reject(upload.id, upload.quarantineKey, owner, "TYPE_MISMATCH");
      }

      const verdict = await this.clamav.scan(await this.storage.readStream(upload.quarantineKey));
      if (verdict !== "CLEAN") return await this.reject(upload.id, upload.quarantineKey, owner, "MALWARE");

      const objectKey = `${READY_PREFIX}${randomUUID()}`;
      await this.storage.promote(upload.quarantineKey, objectKey);
      const done = await prisma.cvUpload.update({
        where: { id: upload.id },
        data: { status: "READY", objectKey, sizeBytes: size, detectedType: detected, completedAt: new Date() },
      });
      await this.auditUpload(owner, upload.id, "CV_UPLOAD_READY", { detectedType: detected, sizeBytes: size });
      // Phase 7: a signed-in upload is a new CV version; the extraction job compares it with the confirmed profile.
      if (owner.contractorId) await recordCvVersion(owner.contractorId, upload.id);
      // The upload is already READY; a queue failure must not revert it. The job is idempotent and can be re-enqueued.
      try {
        await this.jobs.send(CV_EXTRACT_JOB, { uploadId: upload.id }, { ...CV_EXTRACT_SEND_OPTIONS, singletonKey: upload.id });
      } catch {
        // Deliberately no error detail logged beyond the id: avoid leaking anything CV-related.
        console.warn(`cv.extract enqueue failed for upload ${upload.id}`);
      }
      return toStatus(done);
    } catch (e) {
      await prisma.cvUpload.updateMany({ where: { id: upload.id, status: "SCANNING" }, data: { status: "PENDING" } });
      throw e;
    }
  }

  async status(owner: CvOwner, uploadId: string): Promise<CvUploadStatus> {
    return toStatus(await this.findOwned(owner, uploadId));
  }

  /** Short-lived presigned GET (attachment, octet-stream). Only READY uploads. */
  async download(owner: CvOwner, uploadId: string): Promise<CvDownload> {
    const upload = await this.findOwned(owner, uploadId);
    if (upload.status !== "READY" || !upload.objectKey || !upload.detectedType) throw new NotFoundException("Upload not found");
    const ttl = this.env.CV_PRESIGN_TTL_SECONDS;
    const ext = EXT[upload.detectedType as keyof typeof EXT] ?? "bin";
    return { url: await this.storage.presignGet(upload.objectKey, `cv.${ext}`, ttl), expiresInSeconds: ttl };
  }

  private async reject(id: string, quarantineKey: string, owner: CvOwner, reason: string): Promise<CvUploadStatus> {
    await this.storage.delete(quarantineKey);
    const row = await prisma.cvUpload.update({ where: { id }, data: { status: "REJECTED", completedAt: new Date() } });
    await this.auditUpload(owner, id, "CV_UPLOAD_REJECTED", { reason });
    return toStatus(row);
  }

  private async auditUpload(owner: CvOwner, uploadId: string, action: string, after: Record<string, unknown>): Promise<void> {
    if (!owner.contractorId) return;
    await this.audit.record({ actorId: owner.contractorId, entityType: "CvUpload", entityId: uploadId, action, after });
  }

  /** Foreign and missing uploads are indistinguishable. */
  private async findOwned(owner: CvOwner, uploadId: string) {
    const where = owner.contractorId ? { id: uploadId, contractorId: owner.contractorId } : owner.draftId ? { id: uploadId, draftId: owner.draftId } : null;
    const row = where ? await prisma.cvUpload.findFirst({ where }) : null;
    if (!row) throw new NotFoundException("Upload not found");
    return row;
  }
}

function toStatus(row: { id: string; status: string }): CvUploadStatus {
  const status = row.status as UploadStatus;
  return { uploadId: row.id, status, message: status === "REJECTED" ? REJECT_MESSAGE : null };
}
