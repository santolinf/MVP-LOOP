import { describe, expect, it } from "vitest";
import { loadEnv } from "../../../config/index.js";
import { StorageService } from "../storage.service.js";

const creds = { DATABASE_URL: "postgresql://x", S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s", S3_FORCE_PATH_STYLE: "true" };

describe("StorageService presigned URLs", () => {
  it("point at S3_PUBLIC_ENDPOINT when set, so browsers need not resolve the API's internal host", async () => {
    const storage = new StorageService(loadEnv({ ...creds, S3_ENDPOINT: "http://minio:9000", S3_PUBLIC_ENDPOINT: "http://localhost:9000" }));
    expect(await storage.presignPut("quarantine/a", "application/pdf", 60)).toMatch(/^http:\/\/localhost:9000\/loop-cv\/quarantine\/a\?/);
    expect(await storage.presignGet("cv/a", "cv.pdf", 60)).toMatch(/^http:\/\/localhost:9000\/loop-cv\/cv\/a\?/);
  });

  it("falls back to S3_ENDPOINT", async () => {
    const storage = new StorageService(loadEnv({ ...creds, S3_ENDPOINT: "http://minio:9000" }));
    expect(await storage.presignPut("quarantine/a", "application/pdf", 60)).toMatch(/^http:\/\/minio:9000\//);
  });

  it("signs the content type into the upload URL", async () => {
    const storage = new StorageService(loadEnv({ ...creds, S3_ENDPOINT: "http://minio:9000" }));
    expect(new URL(await storage.presignPut("quarantine/a", "application/pdf", 60)).searchParams.get("X-Amz-SignedHeaders")).toContain("content-type");
  });
});
