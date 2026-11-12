import { describe, expect, it, vi } from "vitest";

vi.mock("@loop/db", () => ({ prisma: {} }));

const { CvController } = await import("../cv.controller.js");

function build() {
  const cv = {
    presign: vi.fn(async () => ({ uploadId: "u1" })),
    complete: vi.fn(async () => ({ uploadId: "u1", status: "READY", message: null })),
    status: vi.fn(async () => ({ uploadId: "u1", status: "PENDING", message: null })),
    download: vi.fn(async () => ({ url: "https://s3.test/x", expiresInSeconds: 300 })),
  };
  const drafts = {
    create: vi.fn(async () => ({ draftToken: "t", expiresAt: "x" })),
    resolve: vi.fn(async (token?: string) => {
      if (token !== "good") throw new Error("unauthorised");
      return { id: "d1" };
    }),
  };
  const eligibility = { record: vi.fn(async () => ({ declarationId: "e1" })) };
  const ctrl = new CvController(cv as never, drafts as never, eligibility as never);
  return { ctrl, cv, drafts, eligibility };
}

describe("CvController", () => {
  it("creates drafts from the caller IP", async () => {
    const { ctrl, drafts } = build();
    await ctrl.createDraft({ ip: "1.2.3.4" });
    expect(drafts.create).toHaveBeenCalledWith("1.2.3.4");
  });

  it("uses the signed-in contractor without consulting the draft token", async () => {
    const { ctrl, cv, drafts } = build();
    await ctrl.presign({ mimeType: "application/pdf", sizeBytes: 5 }, { ip: "1.2.3.4", contractorId: "c1" });
    expect(cv.presign).toHaveBeenCalledWith({ contractorId: "c1" }, expect.anything(), "1.2.3.4");
    expect(drafts.resolve).not.toHaveBeenCalled();
  });

  it("asks for an inline download only for disposition=inline", async () => {
    const { ctrl, cv } = build();
    await ctrl.download("u1", { ip: "1.2.3.4", contractorId: "c1" }, undefined, "inline");
    await ctrl.download("u1", { ip: "1.2.3.4", contractorId: "c1" }, undefined, "bogus");
    expect(cv.download).toHaveBeenNthCalledWith(1, { contractorId: "c1" }, "u1", true);
    expect(cv.download).toHaveBeenNthCalledWith(2, { contractorId: "c1" }, "u1", false);
  });

  it("resolves the anonymous draft token for every owner-scoped endpoint", async () => {
    const { ctrl, cv, eligibility } = build();
    const req = { ip: "1.2.3.4" };
    await ctrl.presign({ mimeType: "application/pdf", sizeBytes: 5 }, req, "good");
    await ctrl.complete("u1", req, "good");
    await ctrl.status("u1", req, "good");
    await ctrl.download("u1", req, "good");
    await ctrl.recordEligibility({} as never, req, "good");
    expect(cv.presign).toHaveBeenCalledWith({ draftId: "d1" }, expect.anything(), "1.2.3.4");
    expect(cv.complete).toHaveBeenCalledWith({ draftId: "d1" }, "u1");
    expect(cv.status).toHaveBeenCalledWith({ draftId: "d1" }, "u1");
    expect(cv.download).toHaveBeenCalledWith({ draftId: "d1" }, "u1", false);
    expect(eligibility.record).toHaveBeenCalledWith({ draftId: "d1" }, expect.anything(), "1.2.3.4");
  });

  it("rejects callers with neither a session nor a valid draft token", async () => {
    const { ctrl, cv } = build();
    await expect(ctrl.presign({ mimeType: "application/pdf", sizeBytes: 5 }, {}, undefined)).rejects.toThrow();
    await expect(ctrl.complete("u1", {}, "bad")).rejects.toThrow();
    expect(cv.presign).not.toHaveBeenCalled();
    expect(cv.complete).not.toHaveBeenCalled();
  });
});
