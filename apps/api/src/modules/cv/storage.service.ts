import { Readable } from "node:stream";
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Inject, Injectable } from "@nestjs/common";
import type { Env } from "../../config/index.js";

export const CV_ENV = Symbol("CV_ENV");

export const QUARANTINE_PREFIX = "quarantine/";
export const READY_PREFIX = "cv/";

/** Private bucket only. Objects are never proxied through the app origin. */
@Injectable()
export class StorageService {
  private readonly client: S3Client;
  /** Same credentials, but the endpoint browsers can reach: presigned URLs bake in the host. */
  private readonly presigner: S3Client;
  private readonly bucket: string;

  constructor(@Inject(CV_ENV) env: Env) {
    this.bucket = env.S3_BUCKET;
    const config = {
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      // The SDK's default CRC32 checksums add headers that Google Cloud Storage's S3 interop API rejects.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials:
        env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
          : undefined,
    } as const;
    this.client = new S3Client({ ...config, endpoint: env.S3_ENDPOINT });
    this.presigner = new S3Client({ ...config, endpoint: env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT });
  }

  /**
   * The origin browsers use for presigned URLs (S3_PUBLIC_ENDPOINT, S3_ENDPOINT, or the provider's own host). The
   * Content-Security-Policy must allow it in connect-src, or the browser blocks the direct upload.
   */
  async browserOrigin(): Promise<string> {
    return new URL(await this.presignGet("csp-probe", "probe", 60)).origin;
  }

  /** Presigned PUT. The content type is signed, so the client must send exactly the declared one. */
  presignPut(key: string, contentType: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(this.presigner, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }), {
      expiresIn: expiresInSeconds,
      // Without this the presigner leaves content-type out of the signature and any type is accepted.
      signableHeaders: new Set(["content-type"]),
    });
  }

  /** Presigned GET that forces a download and blocks MIME sniffing. */
  presignGet(key: string, filename: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(
      this.presigner,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
        ResponseContentType: "application/octet-stream",
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  /** Size in bytes, or null if the object does not exist. */
  async size(key: string): Promise<number | null> {
    try {
      const out = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return out.ContentLength ?? 0;
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async readHead(key: string, bytes = 16): Promise<Uint8Array> {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
    return out.Body ? out.Body.transformToByteArray() : new Uint8Array();
  }

  async readStream(key: string): Promise<Readable> {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!(out.Body instanceof Readable)) throw new Error("Unexpected storage body");
    return out.Body;
  }

  async promote(fromKey: string, toKey: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({ Bucket: this.bucket, Key: toKey, CopySource: `${this.bucket}/${encodeURIComponent(fromKey).replace(/%2F/g, "/")}` }),
    );
    await this.delete(fromKey);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

function isNotFound(e: unknown): boolean {
  const x = e as { name?: string; $metadata?: { httpStatusCode?: number } };
  return x?.name === "NotFound" || x?.$metadata?.httpStatusCode === 404;
}
