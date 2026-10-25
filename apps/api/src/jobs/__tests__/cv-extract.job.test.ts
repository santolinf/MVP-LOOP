import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  upload: null as null | { id: string; contractorId: string | null; status: string; objectKey: string | null; detectedType: string | null },
  run: null as null | { cvUploadId: string; status: string; fields?: unknown; error?: string | null },
}));

vi.mock("@loop/db", () => ({
  prisma: {
    cvUpload: { findUnique: vi.fn(async () => h.upload) },
    extractionRun: {
      findUnique: vi.fn(async () => h.run),
      upsert: vi.fn(async ({ create, update }: { create: { cvUploadId: string }; update: object }) => {
        h.run = h.run ? { ...h.run, ...update } : { ...create, status: "PENDING" };
        return h.run;
      }),
      update: vi.fn(async ({ data }: { data: object }) => {
        h.run = { ...(h.run as NonNullable<typeof h.run>), ...data };
        return h.run;
      }),
    },
  },
}));
vi.mock("../../config/index.js", () => ({ loadEnv: vi.fn() }));
const propose = vi.hoisted(() => vi.fn(async () => 0));
vi.mock("../../modules/cv/cv-changes.js", () => ({ proposeCvChanges: propose }));

const { runCvExtract, MockLlmProvider } = await import("../cv-extract.job.js");

const CV =
  "Jane Doe. Senior Platform Engineer with ten years of experience in London. Skills include Kubernetes, Terraform and TypeScript.";

function deps(text: string, llmOut: unknown) {
  return {
    text: { extract: vi.fn(async () => text) },
    llm: { extractFields: vi.fn(async () => llmOut) },
    minConfidence: 0.5,
    minChars: 20,
    maxTextChars: 10_000,
  };
}

beforeEach(() => {
  propose.mockClear();
  h.upload = { id: "u1", contractorId: "c1", status: "READY", objectKey: "k", detectedType: "pdf" };
  h.run = null;
});

describe("runCvExtract", () => {
  it("skips uploads that are missing or not READY", async () => {
    h.upload = null;
    expect(await runCvExtract({ uploadId: "u1" }, deps(CV, {}))).toBe("SKIPPED");
    h.upload = { id: "u1", contractorId: "c1", status: "PENDING", objectKey: null, detectedType: null };
    expect(await runCvExtract({ uploadId: "u1" }, deps(CV, {}))).toBe("SKIPPED");
    expect(h.run).toBeNull();
  });

  it("leaves a terminal run alone (idempotent)", async () => {
    h.run = { cvUploadId: "u1", status: "READY" };
    const d = deps(CV, {});
    expect(await runCvExtract({ uploadId: "u1" }, d)).toBe("READY");
    expect(d.text.extract).not.toHaveBeenCalled();
    expect(propose).toHaveBeenCalledWith("u1");
  });

  it("marks COULD_NOT_READ when text is unreadable, without calling the LLM", async () => {
    const d = deps("  ", {});
    expect(await runCvExtract({ uploadId: "u1" }, d)).toBe("COULD_NOT_READ");
    expect(d.llm.extractFields).not.toHaveBeenCalled();
    expect(h.run?.status).toBe("COULD_NOT_READ");
  });

  it("MockLlmProvider yields COULD_NOT_READ", async () => {
    const d = { ...deps(CV, null), llm: new MockLlmProvider() };
    expect(await runCvExtract({ uploadId: "u1" }, d)).toBe("COULD_NOT_READ");
  });

  it("stores verified fields as READY", async () => {
    const out = { fields: [{ key: "currentRole", value: "Senior Platform Engineer", sourceExcerpt: "Senior Platform Engineer", confidence: 0.9 }] };
    expect(await runCvExtract({ uploadId: "u1" }, deps(CV, out))).toBe("READY");
    expect(h.run?.fields).toEqual([{ id: "f1", ...out.fields[0] }]);
    expect(propose).toHaveBeenCalledWith("u1");
  });

  it("drops fields whose excerpt is not in the CV or whose confidence is low", async () => {
    const out = {
      fields: [
        { key: "skill", value: "Rust", sourceExcerpt: "Expert in Rust", confidence: 0.99 },
        { key: "skill", value: "Terraform", sourceExcerpt: "Terraform", confidence: 0.1 },
        { key: "skill", value: "Kubernetes", sourceExcerpt: "Kubernetes", confidence: 0.8 },
      ],
    };
    expect(await runCvExtract({ uploadId: "u1" }, deps(CV, out))).toBe("READY");
    expect(h.run?.fields).toHaveLength(1);
    expect((h.run?.fields as { value: string }[])[0]?.value).toBe("Kubernetes");
  });

  it("treats invalid LLM output as no fields", async () => {
    expect(await runCvExtract({ uploadId: "u1" }, deps(CV, { fields: "nope" }))).toBe("COULD_NOT_READ");
  });
});
