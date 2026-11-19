import { beforeEach, describe, expect, it, vi } from "vitest";

interface Upload {
  id: string;
  contractorId: string | null;
  draftId: string | null;
  declaredMime: string;
  declaredSize: number;
  quarantineKey: string;
  ipHash: string | null;
  status: string;
  objectKey: string | null;
  sizeBytes: number | null;
  detectedType: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

const h = vi.hoisted(() => ({ rows: [] as Upload[], versions: [] as Array<{ contractorId: string; cvUploadId: string; versionNumber: number }> }));

vi.mock("@loop/db", () => {
  const matches = (r: Upload, w: Record<string, unknown>): boolean =>
    Object.entries(w).every(([k, v]) => {
      if (k === "createdAt") return r.createdAt >= (v as { gte: Date }).gte;
      return (r as unknown as Record<string, unknown>)[k] === v;
    });
  return {
    Prisma: { PrismaClientKnownRequestError: class extends Error {} },
    prisma: {
      cvVersion: {
        findUnique: vi.fn(async ({ where }: { where: { cvUploadId: string } }) => h.versions.find((v) => v.cvUploadId === where.cvUploadId) ?? null),
        aggregate: vi.fn(async ({ where }: { where: { contractorId: string } }) => ({
          _max: { versionNumber: Math.max(0, ...h.versions.filter((v) => v.contractorId === where.contractorId).map((v) => v.versionNumber)) || null },
        })),
        create: vi.fn(async ({ data }: { data: { contractorId: string; cvUploadId: string; versionNumber: number } }) => {
          h.versions.push(data);
          return { id: `v${h.versions.length}`, ...data };
        }),
      },
      cvUpload: {
        count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => h.rows.filter((r) => matches(r, where)).length),
        create: vi.fn(async ({ data }: { data: Partial<Upload> }) => {
          const row: Upload = {
            id: `u${h.rows.length + 1}`,
            contractorId: null,
            draftId: null,
            ipHash: null,
            status: "PENDING",
            objectKey: null,
            sizeBytes: null,
            detectedType: null,
            createdAt: new Date(),
            completedAt: null,
            ...data,
          } as Upload;
          h.rows.push(row);
          return row;
        }),
        findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => h.rows.find((r) => matches(r, where)) ?? null),
        updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Upload> }) => {
          const hit = h.rows.filter((r) => matches(r, where));
          hit.forEach((r) => Object.assign(r, data));
          return { count: hit.length };
        }),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Upload> }) => {
          const r = h.rows.find((x) => x.id === where.id);
          if (!r) throw new Error("missing");
          Object.assign(r, data);
          return r;
        }),
      },
    },
  };
});

const { CvService } = await import("../cv.service.js");

const PDF = "application/pdf";
const env = {
  CV_MAX_BYTES_ANON: 1000,
  CV_MAX_BYTES_AUTH: 5000,
  CV_PRESIGN_TTL_SECONDS: 300,
  CV_ANON_UPLOADS_PER_IP_PER_HOUR: 2,
  CV_ANON_UPLOADS_GLOBAL_PER_HOUR: 3,
} as never;

const pdfHead = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const exeHead = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);

function build() {
  const storage = {
    presignPut: vi.fn(async (key: string) => `https://s3.test/${key}?sig`),
    presignGet: vi.fn(async (key: string, name: string) => `https://s3.test/${key}?name=${name}`),
    presignInlinePdf: vi.fn(async (key: string, name: string) => `https://s3.test/${key}?inline=${name}`),
    size: vi.fn(async (): Promise<number | null> => 500),
    readHead: vi.fn(async () => pdfHead),
    readStream: vi.fn(async () => ({}) as never),
    promote: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };
  const clamav = { scan: vi.fn(async (): Promise<string> => "CLEAN") };
  const audit = { record: vi.fn(async () => undefined) };
  const jobs = { send: vi.fn(async () => undefined) };
  const svc = new CvService(env, storage as never, clamav as never, audit as never, jobs as never);
  return { svc, storage, clamav, audit, jobs };
}

const anon = { draftId: "d1" };
const auth = { contractorId: "c1" };

beforeEach(() => {
  h.rows.length = 0;
  h.versions.length = 0;
});

describe("CvService.presign", () => {
  it("returns a quarantine PUT URL for a valid anonymous request", async () => {
    const { svc, storage } = build();
    const res = await svc.presign(anon, { mimeType: PDF, sizeBytes: 500 }, "1.2.3.4");
    expect(res.method).toBe("PUT");
    expect(res.maxBytes).toBe(1000);
    expect(h.rows[0]?.quarantineKey).toMatch(/^quarantine\//);
    expect(h.rows[0]?.draftId).toBe("d1");
    expect(storage.presignPut).toHaveBeenCalledOnce();
  });

  it("rejects oversize, empty and unsupported declarations", async () => {
    const { svc } = build();
    await expect(svc.presign(anon, { mimeType: PDF, sizeBytes: 1001 }, "1.2.3.4")).rejects.toThrow("File is too large");
    await expect(svc.presign(anon, { mimeType: PDF, sizeBytes: 0 }, "1.2.3.4")).rejects.toThrow("Unsupported or empty file");
    await expect(svc.presign(anon, { mimeType: "image/png", sizeBytes: 10 }, "1.2.3.4")).rejects.toThrow("Unsupported or empty file");
    expect(h.rows).toHaveLength(0);
  });

  it("allows a larger file once signed in", async () => {
    const { svc } = build();
    const res = await svc.presign(auth, { mimeType: PDF, sizeBytes: 4000 }, "1.2.3.4");
    expect(res.maxBytes).toBe(5000);
    expect(h.rows[0]?.contractorId).toBe("c1");
  });

  it("applies the per-IP anonymous quota with 429", async () => {
    const { svc } = build();
    await svc.presign(anon, { mimeType: PDF, sizeBytes: 10 }, "1.2.3.4");
    await svc.presign(anon, { mimeType: PDF, sizeBytes: 10 }, "1.2.3.4");
    await expect(svc.presign(anon, { mimeType: PDF, sizeBytes: 10 }, "1.2.3.4")).rejects.toMatchObject({ status: 429 });
  });

  it("applies the global anonymous quota with 429", async () => {
    const { svc } = build();
    for (const ip of ["1.1.1.1", "2.2.2.2", "3.3.3.3"]) await svc.presign(anon, { mimeType: PDF, sizeBytes: 10 }, ip);
    await expect(svc.presign(anon, { mimeType: PDF, sizeBytes: 10 }, "4.4.4.4")).rejects.toMatchObject({ status: 429 });
  });

  it("does not apply anonymous quotas to signed-in contractors", async () => {
    const { svc } = build();
    for (let i = 0; i < 5; i++) await svc.presign(auth, { mimeType: PDF, sizeBytes: 10 }, "1.2.3.4");
    expect(h.rows).toHaveLength(5);
  });
});

describe("CvService.complete", () => {
  async function pending(owner: typeof anon | typeof auth = auth) {
    const ctx = build();
    const { uploadId } = await ctx.svc.presign(owner, { mimeType: PDF, sizeBytes: 500 }, "1.2.3.4");
    return { ...ctx, uploadId };
  }

  it("promotes a clean file and audits for a signed-in owner", async () => {
    const { svc, storage, audit, uploadId } = await pending();
    const res = await svc.complete(auth, uploadId);
    expect(res).toEqual({ uploadId, status: "READY", message: null });
    expect(storage.promote).toHaveBeenCalledWith(expect.stringMatching(/^quarantine\//), expect.stringMatching(/^cv\//));
    expect(h.rows[0]).toMatchObject({ status: "READY", detectedType: "PDF", sizeBytes: 500 });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "CV_UPLOAD_READY", actorId: "c1" }));
  });

  it("numbers each signed-in upload as the next CV version, once per upload", async () => {
    const first = await pending();
    await first.svc.complete(auth, first.uploadId);
    await first.svc.complete(auth, first.uploadId);
    const second = await pending();
    await second.svc.complete(auth, second.uploadId);
    expect(h.versions.map((v) => v.versionNumber)).toEqual([1, 2]);
  });

  it("does not create a version for an anonymous upload", async () => {
    const { svc, uploadId } = await pending(anon);
    await svc.complete(anon, uploadId);
    expect(h.versions).toHaveLength(0);
  });

  it("rejects a magic-byte mismatch without scanning, deleting the quarantine object", async () => {
    const { svc, storage, clamav, uploadId } = await pending();
    storage.readHead.mockResolvedValue(exeHead);
    const res = await svc.complete(auth, uploadId);
    expect(res.status).toBe("REJECTED");
    expect(clamav.scan).not.toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalledOnce();
    expect(storage.promote).not.toHaveBeenCalled();
  });

  it("rejects an infected file with a generic message and deletes the object", async () => {
    const { svc, storage, clamav, audit, uploadId } = await pending();
    clamav.scan.mockResolvedValue("INFECTED");
    const res = await svc.complete(auth, uploadId);
    expect(res.status).toBe("REJECTED");
    expect(res.message).toMatch(/couldn't accept that file/);
    expect(res.message).not.toMatch(/virus|malware|infect/i);
    expect(storage.delete).toHaveBeenCalledOnce();
    expect(storage.promote).not.toHaveBeenCalled();
    expect(h.rows[0]?.objectKey).toBeNull();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "CV_UPLOAD_REJECTED" }));
  });

  it("rejects when the object is missing or oversize", async () => {
    const a = await pending();
    a.storage.size.mockResolvedValue(null);
    expect((await a.svc.complete(auth, a.uploadId)).status).toBe("REJECTED");

    h.rows.length = 0;
    const b = await pending();
    b.storage.size.mockResolvedValue(999_999);
    expect((await b.svc.complete(auth, b.uploadId)).status).toBe("REJECTED");
  });

  it("reverts to PENDING and rethrows when the scanner fails, never promoting", async () => {
    const { svc, storage, clamav, uploadId } = await pending();
    clamav.scan.mockRejectedValue(new Error("clamd down"));
    await expect(svc.complete(auth, uploadId)).rejects.toThrow("clamd down");
    expect(h.rows[0]?.status).toBe("PENDING");
    expect(storage.promote).not.toHaveBeenCalled();
  });

  it("is idempotent once finished", async () => {
    const { svc, storage, uploadId } = await pending();
    await svc.complete(auth, uploadId);
    const again = await svc.complete(auth, uploadId);
    expect(again.status).toBe("READY");
    expect(storage.promote).toHaveBeenCalledOnce();
  });

  it("does not write audit events for anonymous owners", async () => {
    const { svc, audit, uploadId } = await pending(anon);
    await svc.complete(anon, uploadId);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("treats another owner's upload as not found", async () => {
    const { svc, uploadId } = await pending(auth);
    await expect(svc.complete({ contractorId: "other" }, uploadId)).rejects.toThrow("Upload not found");
    await expect(svc.status({ draftId: "d9" }, uploadId)).rejects.toThrow("Upload not found");
    await expect(svc.status({}, uploadId)).rejects.toThrow("Upload not found");
  });
});

describe("CvService.download", () => {
  it("only serves READY uploads, via a presigned attachment URL", async () => {
    const { svc, storage } = build();
    const { uploadId } = await svc.presign(auth, { mimeType: PDF, sizeBytes: 500 }, "1.2.3.4");
    await expect(svc.download(auth, uploadId)).rejects.toThrow("Upload not found");

    await svc.complete(auth, uploadId);
    const res = await svc.download(auth, uploadId);
    expect(res.expiresInSeconds).toBe(300);
    expect(res.url).toMatch(/^https:\/\/s3\.test\/cv\//);
    expect(res.inline).toBe(false);
    expect(storage.presignGet).toHaveBeenCalledWith(expect.stringMatching(/^cv\//), "cv.pdf", 300);
    expect(storage.presignInlinePdf).not.toHaveBeenCalled();
  });

  it("opens a PDF inline only when asked", async () => {
    const { svc, storage } = build();
    const { uploadId } = await svc.presign(auth, { mimeType: PDF, sizeBytes: 500 }, "1.2.3.4");
    await svc.complete(auth, uploadId);
    const res = await svc.download(auth, uploadId, true);
    expect(res.inline).toBe(true);
    expect(res.url).toContain("inline=cv.pdf");
    expect(storage.presignInlinePdf).toHaveBeenCalledWith(expect.stringMatching(/^cv\//), "cv.pdf", 300);
  });

  it("refuses a rejected upload", async () => {
    const { svc, clamav } = build();
    const { uploadId } = await svc.presign(auth, { mimeType: PDF, sizeBytes: 500 }, "1.2.3.4");
    clamav.scan.mockResolvedValue("INFECTED");
    await svc.complete(auth, uploadId);
    await expect(svc.download(auth, uploadId)).rejects.toThrow("Upload not found");
  });
});
