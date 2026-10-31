import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadEnv } from "../../../config/index.js";
import { StorageService } from "../storage.service.js";

// ADR 0012 storage contract. Runs the exact operations the CV pipeline relies on against whatever the S3_* env points
// at: MinIO from `docker compose up -d` by default, or any candidate backend (AWS S3, GCS interop, R2, ...) by
// pointing S3_* at it, e.g. in a scratch bucket. The bucket must already exist. Needs the backend, not Docker itself:
// `pnpm --filter @loop/api test:integration`.
const env = loadEnv();
const storage = new StorageService(env);
const prefix = `conformance/${randomUUID()}/`;
const created: string[] = [];
const body = Buffer.from("%PDF-1.7 conformance payload, longer than sixteen bytes");

afterAll(async () => {
  for (const key of created) await storage.delete(key).catch(() => undefined);
});

describe(`S3 storage contract (${env.S3_ENDPOINT ?? "AWS S3"}, bucket ${env.S3_BUCKET})`, () => {
  const source = `${prefix}source.pdf`;
  const promoted = `${prefix}promoted.pdf`;

  it("presigned PUT stores an object with the signed content type", async () => {
    created.push(source);
    const url = await storage.presignPut(source, "application/pdf", 60);
    const res = await fetch(url, { method: "PUT", headers: { "content-type": "application/pdf" }, body });
    expect(res.status).toBe(200);
  });

  it("presigned PUT rejects a different content type than the one signed", async () => {
    const key = `${prefix}wrong-type.pdf`;
    created.push(key);
    const url = await storage.presignPut(key, "application/pdf", 60);
    const res = await fetch(url, { method: "PUT", headers: { "content-type": "text/html" }, body });
    expect(res.ok).toBe(false);
    expect(await storage.size(key)).toBeNull();
  });

  it("HEAD reports the size, and null for a missing key", async () => {
    expect(await storage.size(source)).toBe(body.length);
    expect(await storage.size(`${prefix}missing`)).toBeNull();
  });

  it("ranged GET returns only the requested head bytes", async () => {
    const head = await storage.readHead(source, 8);
    expect(Buffer.from(head).toString()).toBe(body.subarray(0, 8).toString());
  });

  it("streamed GET returns the whole object", async () => {
    const chunks: Buffer[] = [];
    for await (const c of await storage.readStream(source)) chunks.push(Buffer.from(c as Uint8Array));
    expect(Buffer.concat(chunks).equals(body)).toBe(true);
  });

  it("promote copies server-side then removes the source", async () => {
    created.push(promoted);
    await storage.promote(source, promoted);
    expect(await storage.size(promoted)).toBe(body.length);
    expect(await storage.size(source)).toBeNull();
  });

  it("presigned GET forces a download with a neutral content type", async () => {
    const res = await fetch(await storage.presignGet(promoted, 'my "CV".pdf', 60));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="my__CV_.pdf"/);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(Buffer.from(await res.arrayBuffer()).equals(body)).toBe(true);
  });

  it("an unsigned request is denied (bucket is private)", async () => {
    const url = new URL(await storage.presignGet(promoted, "x.pdf", 60));
    url.search = "";
    expect((await fetch(url)).ok).toBe(false);
  });

  it("delete removes the object", async () => {
    await storage.delete(promoted);
    expect(await storage.size(promoted)).toBeNull();
  });
});
