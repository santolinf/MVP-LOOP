import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface Row {
  id: string;
  contractorId: string | null;
  status: string;
  objectKey: string | null;
  lastScannedAt: Date | null;
}
const h = vi.hoisted(() => ({ rows: [] as Row[] }));

vi.mock("@loop/db", () => ({
  prisma: {
    cvUpload: {
      findMany: vi.fn(async ({ where, take }: { where: { OR: [unknown, { lastScannedAt: { lte: Date } }] }; take: number }) => {
        const dueBefore = where.OR[1].lastScannedAt.lte;
        return h.rows
          .filter((r) => r.status === "READY" && r.objectKey && (r.lastScannedAt === null || r.lastScannedAt <= dueBefore))
          .sort((a, b) => (a.lastScannedAt?.getTime() ?? -Infinity) - (b.lastScannedAt?.getTime() ?? -Infinity))
          .slice(0, take);
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = h.rows.find((r) => r.id === where.id);
        if (!row) throw new Error("missing");
        Object.assign(row, data);
        return row;
      }),
    },
  },
}));
vi.mock("../../config/index.js", () => ({ loadEnv: vi.fn() }));
vi.mock("../../modules/cv/storage.service.js", () => ({ StorageService: class {} }));
vi.mock("../../modules/cv/clamav.service.js", () => ({ ClamavService: class {} }));
vi.mock("../../common/audit.service.js", () => ({ AuditService: class {} }));

const { runCvRescan } = await import("../cv-rescan.job.js");

const now = new Date("2026-10-29T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

beforeEach(() => {
  h.rows = [
    { id: "fresh", contractorId: "c1", status: "READY", objectKey: "cv/fresh", lastScannedAt: daysAgo(1) },
    { id: "stale", contractorId: "c2", status: "READY", objectKey: "cv/stale", lastScannedAt: daysAgo(10) },
    { id: "never", contractorId: "c3", status: "READY", objectKey: "cv/never", lastScannedAt: null },
    { id: "rejected", contractorId: "c4", status: "REJECTED", objectKey: null, lastScannedAt: daysAgo(30) },
  ];
});

function deps(verdicts: Record<string, "CLEAN" | "INFECTED" | Error>) {
  const store = {
    readStream: vi.fn(async (key: string) => Readable.from([key])),
    delete: vi.fn(async () => undefined),
  };
  const scanner = {
    scan: vi.fn(async (stream: Readable) => {
      const key = String((await stream.toArray())[0]);
      const v = verdicts[key] ?? "CLEAN";
      if (v instanceof Error) throw v;
      return v;
    }),
  };
  const audit = { record: vi.fn(async () => undefined) };
  return { store, scanner, audit };
}

describe("runCvRescan", () => {
  it("scans only READY files whose verdict is older than the interval, never-scanned first", async () => {
    const d = deps({});
    const res = await runCvRescan(d.store, d.scanner, d.audit, 7, now);
    expect(res).toEqual({ clean: 2, infected: 0, failed: 0 });
    expect(d.store.readStream.mock.calls.map((c) => c[0])).toEqual(["cv/never", "cv/stale"]);
    expect(h.rows.find((r) => r.id === "stale")?.lastScannedAt).toEqual(now);
    expect(h.rows.find((r) => r.id === "fresh")?.lastScannedAt).toEqual(daysAgo(1));
  });

  it("deletes a file that now scans INFECTED, rejects the upload and audits it", async () => {
    const d = deps({ "cv/stale": "INFECTED" });
    const res = await runCvRescan(d.store, d.scanner, d.audit, 7, now);
    expect(res).toEqual({ clean: 1, infected: 1, failed: 0 });
    expect(d.store.delete).toHaveBeenCalledWith("cv/stale");
    expect(h.rows.find((r) => r.id === "stale")?.status).toBe("REJECTED");
    expect(d.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: "SYSTEM", entityId: "stale", action: "CV_UPLOAD_RESCAN_INFECTED" }),
    );
  });

  it("leaves a file untouched and due when its scan errors, and carries on with the rest", async () => {
    const d = deps({ "cv/stale": new Error("scanner down") });
    const res = await runCvRescan(d.store, d.scanner, d.audit, 7, now);
    expect(res).toEqual({ clean: 1, infected: 0, failed: 1 });
    expect(h.rows.find((r) => r.id === "stale")).toMatchObject({ status: "READY", lastScannedAt: daysAgo(10) });
    expect(d.store.delete).not.toHaveBeenCalled();
  });

  it("throws when nothing could be scanned, so an outage is visible", async () => {
    const d = deps({ "cv/stale": new Error("down"), "cv/never": new Error("down") });
    await expect(runCvRescan(d.store, d.scanner, d.audit, 7, now)).rejects.toThrow(/no file could be scanned/);
  });

  it("is idempotent", async () => {
    const d = deps({ "cv/stale": "INFECTED" });
    await runCvRescan(d.store, d.scanner, d.audit, 7, now);
    expect(await runCvRescan(d.store, d.scanner, d.audit, 7, now)).toEqual({ clean: 0, infected: 0, failed: 0 });
  });
});
