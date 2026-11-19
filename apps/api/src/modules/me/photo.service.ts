import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { prisma } from "@loop/db";
import { PHOTO_ALLOWED_MIMES, PHOTO_MAX_BYTES, PHOTO_MIME_TYPES, checkPhotoDeclaration, detectPhotoType, isPhotoKeyOwnedBy, photoKeyPrefix } from "@loop/domain";
import type { Photo, PhotoCompleteRequest, PhotoPresignRequest, PhotoPresignResponse } from "@loop/contracts";
import { AuditService } from "../../common/audit.service.js";
import { ClamavService } from "../cv/clamav.service.js";
import { StorageService } from "../cv/storage.service.js";

const TTL_SECONDS = 300;
const REJECT_MESSAGE = "We couldn't accept that photograph. Please choose a JPG, PNG or WebP image under 3 MB.";

/**
 * The contractor's own profile photograph. Uploaded straight to the private object store through a presigned URL
 * (ADR 0012), then verified here (size, magic bytes, malware scan) before it is attached to the contractor.
 * Only the owner ever receives a URL for it; this is the private desktop profile, not the agency-facing one.
 */
@Injectable()
export class PhotoService {
  // Explicit @Inject: the dev runner (tsx/esbuild) does not emit design:paramtypes metadata.
  constructor(
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(ClamavService) private readonly clamav: ClamavService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async presign(contractorId: string, input: PhotoPresignRequest): Promise<PhotoPresignResponse> {
    if (!checkPhotoDeclaration(input.mimeType, input.sizeBytes).ok) throw new BadRequestException(REJECT_MESSAGE);
    const objectKey = `${photoKeyPrefix(contractorId)}${randomUUID()}`;
    const uploadUrl = await this.storage.presignPut(objectKey, input.mimeType, TTL_SECONDS);
    return { objectKey, uploadUrl, method: "PUT", headers: { "Content-Type": input.mimeType }, expiresInSeconds: TTL_SECONDS, maxBytes: PHOTO_MAX_BYTES };
  }

  /** Verifies the uploaded object and attaches it, replacing (and deleting) any earlier photograph. */
  async complete(contractorId: string, input: PhotoCompleteRequest): Promise<Photo> {
    const key = input.objectKey;
    // Keys are issued per contractor; anyone else's (or an arbitrary) key is refused without touching storage.
    if (!isPhotoKeyOwnedBy(key, contractorId)) throw new BadRequestException(REJECT_MESSAGE);

    const size = await this.storage.size(key);
    if (size === null || size <= 0 || size > PHOTO_MAX_BYTES) return this.reject(key);
    const detected = detectPhotoType(await this.storage.readHead(key, 16));
    if (!detected) return this.reject(key);
    // A scanner error propagates and nothing is attached: the object stays unreferenced until the contractor retries.
    if ((await this.clamav.scan(await this.storage.readStream(key))) !== "CLEAN") return this.reject(key);

    const before = await prisma.contractor.findUnique({ where: { id: contractorId }, select: { photoKey: true } });
    await prisma.contractor.update({
      where: { id: contractorId },
      data: { photoKey: key, photoContentType: PHOTO_MIME_TYPES[detected], photoUpdatedAt: new Date() },
    });
    if (before?.photoKey && before.photoKey !== key) await this.storage.delete(before.photoKey);
    await this.audit.record({
      actorId: contractorId,
      entityType: "Contractor",
      entityId: contractorId,
      action: "profile.photo.updated",
      before: { hasPhoto: Boolean(before?.photoKey) },
      after: { hasPhoto: true, type: detected, sizeBytes: size },
    });
    return this.get(contractorId);
  }

  async get(contractorId: string): Promise<Photo> {
    const row = await prisma.contractor.findUnique({ where: { id: contractorId }, select: { photoKey: true, photoContentType: true } });
    if (!row?.photoKey) return { url: null, expiresInSeconds: TTL_SECONDS };
    // Only a type verified at upload is ever served as an image; anything else would be a stored-data fault, so show no photo.
    if (!row.photoContentType || !PHOTO_ALLOWED_MIMES.includes(row.photoContentType)) return { url: null, expiresInSeconds: TTL_SECONDS };
    return { url: await this.storage.presignInlineImage(row.photoKey, row.photoContentType, TTL_SECONDS), expiresInSeconds: TTL_SECONDS };
  }

  async remove(contractorId: string): Promise<Photo> {
    const row = await prisma.contractor.findUnique({ where: { id: contractorId }, select: { photoKey: true } });
    if (row?.photoKey) {
      await prisma.contractor.update({ where: { id: contractorId }, data: { photoKey: null, photoContentType: null, photoUpdatedAt: new Date() } });
      await this.storage.delete(row.photoKey);
      await this.audit.record({
        actorId: contractorId,
        entityType: "Contractor",
        entityId: contractorId,
        action: "profile.photo.removed",
        before: { hasPhoto: true },
        after: { hasPhoto: false },
      });
    }
    return { url: null, expiresInSeconds: TTL_SECONDS };
  }

  private async reject(key: string): Promise<never> {
    await this.storage.delete(key);
    throw new BadRequestException(REJECT_MESSAGE);
  }
}
