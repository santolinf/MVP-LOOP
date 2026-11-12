import { beforeEach, describe, expect, it, vi } from "vitest";
import { PHOTO_MAX_BYTES } from "@loop/domain";

const db = vi.hoisted(() => ({ contractor: { findUnique: vi.fn(), update: vi.fn() } }));
vi.mock("@loop/db", () => ({ prisma: db }));

const { PhotoService } = await import("../photo.service.js");

const storage = {
  presignPut: vi.fn(),
  presignInlineImage: vi.fn(),
  size: vi.fn(),
  readHead: vi.fn(),
  readStream: vi.fn(),
  delete: vi.fn(),
};
const clamav = { scan: vi.fn() };
const audit = { record: vi.fn() };
const svc = new PhotoService(storage as never, clamav as never, audit as never);

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
const KEY = "photos/c1/abc";

beforeEach(() => {
  vi.clearAllMocks();
  storage.presignPut.mockResolvedValue("https://store/put");
  storage.presignInlineImage.mockResolvedValue("https://store/get");
  storage.size.mockResolvedValue(1000);
  storage.readHead.mockResolvedValue(JPEG);
  storage.readStream.mockResolvedValue("stream");
  clamav.scan.mockResolvedValue("CLEAN");
  db.contractor.findUnique.mockResolvedValue({ photoKey: null, photoContentType: null });
});

describe("PhotoService.presign", () => {
  it("issues an owner-namespaced key and signs the declared type", async () => {
    const out = await svc.presign("c1", { mimeType: "image/png", sizeBytes: 2000 });
    expect(out.objectKey).toMatch(/^photos\/c1\/[0-9a-f-]{36}$/);
    expect(out).toMatchObject({ uploadUrl: "https://store/put", method: "PUT", headers: { "Content-Type": "image/png" }, maxBytes: PHOTO_MAX_BYTES });
    expect(storage.presignPut).toHaveBeenCalledWith(out.objectKey, "image/png", 300);
  });

  it.each([
    ["svg", "image/svg+xml", 1000],
    ["pdf", "application/pdf", 1000],
    ["too large", "image/png", PHOTO_MAX_BYTES + 1],
  ])("rejects %s", async (_n, mimeType, sizeBytes) => {
    await expect(svc.presign("c1", { mimeType, sizeBytes })).rejects.toThrow(/couldn't accept/);
    expect(storage.presignPut).not.toHaveBeenCalled();
  });
});

describe("PhotoService.complete", () => {
  it("attaches a verified photo, removes the previous one and audits", async () => {
    db.contractor.findUnique
      .mockResolvedValueOnce({ photoKey: "photos/c1/old" })
      .mockResolvedValueOnce({ photoKey: KEY, photoContentType: "image/jpeg" });
    const out = await svc.complete("c1", { objectKey: KEY });
    expect(out).toEqual({ url: "https://store/get", expiresInSeconds: 300 });
    expect(db.contractor.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: expect.objectContaining({ photoKey: KEY, photoContentType: "image/jpeg" }),
    });
    expect(storage.delete).toHaveBeenCalledWith("photos/c1/old");
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ actorId: "c1", action: "profile.photo.updated" }));
  });

  it.each(["photos/c2/abc", "cv/ready/abc", "photos/c1/", "photos/c1/a/b"])("refuses a key that is not this contractor's: %s", async (objectKey) => {
    await expect(svc.complete("c1", { objectKey })).rejects.toThrow(/couldn't accept/);
    expect(storage.size).not.toHaveBeenCalled();
    expect(db.contractor.update).not.toHaveBeenCalled();
  });

  it.each([
    ["missing object", () => storage.size.mockResolvedValue(null)],
    ["empty object", () => storage.size.mockResolvedValue(0)],
    ["oversized object", () => storage.size.mockResolvedValue(PHOTO_MAX_BYTES + 1)],
    ["content that is not an image", () => storage.readHead.mockResolvedValue(Uint8Array.from(Buffer.from("<svg xmlns=")))],
    ["infected file", () => clamav.scan.mockResolvedValue("INFECTED")],
  ])("rejects and deletes the upload: %s", async (_n, arrange) => {
    arrange();
    await expect(svc.complete("c1", { objectKey: KEY })).rejects.toThrow(/couldn't accept/);
    expect(storage.delete).toHaveBeenCalledWith(KEY);
    expect(db.contractor.update).not.toHaveBeenCalled();
  });

  it("attaches nothing when the scanner is unavailable", async () => {
    clamav.scan.mockRejectedValue(new Error("scanner down"));
    await expect(svc.complete("c1", { objectKey: KEY })).rejects.toThrow("scanner down");
    expect(db.contractor.update).not.toHaveBeenCalled();
  });
});

describe("PhotoService.get / remove", () => {
  it("returns null when there is no photograph", async () => {
    expect(await svc.get("c1")).toEqual({ url: null, expiresInSeconds: 300 });
    expect(storage.presignInlineImage).not.toHaveBeenCalled();
  });

  it("serves the verified image type inline, and nothing for an unexpected stored type", async () => {
    db.contractor.findUnique.mockResolvedValue({ photoKey: KEY, photoContentType: "image/png" });
    await svc.get("c1");
    expect(storage.presignInlineImage).toHaveBeenCalledWith(KEY, "image/png", 300);
    db.contractor.findUnique.mockResolvedValue({ photoKey: KEY, photoContentType: "image/svg+xml" });
    expect(await svc.get("c1")).toEqual({ url: null, expiresInSeconds: 300 });
  });

  it("removes the stored object and clears the reference", async () => {
    db.contractor.findUnique.mockResolvedValue({ photoKey: KEY });
    expect(await svc.remove("c1")).toEqual({ url: null, expiresInSeconds: 300 });
    expect(db.contractor.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: expect.objectContaining({ photoKey: null, photoContentType: null }) });
    expect(storage.delete).toHaveBeenCalledWith(KEY);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "profile.photo.removed" }));
  });

  it("is a no-op without a photograph", async () => {
    await svc.remove("c1");
    expect(db.contractor.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
