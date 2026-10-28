import { describe, expect, it } from "vitest";
import {
  CV_MIME_TYPES,
  checkCvDeclaration,
  decideAnonymousUpload,
  detectCvType,
  detectedMatchesDeclared,
} from "./index.js";

const bytes = (...n: number[]) => Uint8Array.from(n);
const ascii = (s: string) => Uint8Array.from(Buffer.from(s, "latin1"));

describe("detectCvType", () => {
  it.each([
    ["pdf", ascii("%PDF-1.7\n"), "PDF"],
    ["doc", bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0), "DOC"],
    ["docx", ascii("PK\x03\x04\x14\x00\x06\x00[Content_Types].xml"), "DOCX"],
    ["plain zip", ascii("PK\x03\x04\x14\x00\x00\x00file.txt"), null],
    ["exe", ascii("MZ\x90\x00"), null],
    ["html", ascii("<html>"), null],
    ["empty", bytes(), null],
    ["truncated pdf", ascii("%PD"), null],
  ])("%s", (_n, head, expected) => {
    expect(detectCvType(head)).toBe(expected);
  });
});

describe("checkCvDeclaration", () => {
  const max = 1000;
  it.each([
    [CV_MIME_TYPES.PDF, 500, { ok: true }],
    [CV_MIME_TYPES.PDF, 1000, { ok: true }],
    [CV_MIME_TYPES.PDF, 1001, { ok: false, reason: "TOO_LARGE" }],
    [CV_MIME_TYPES.DOCX, 0, { ok: false, reason: "EMPTY" }],
    ["image/png", 10, { ok: false, reason: "UNSUPPORTED_TYPE" }],
  ])("%s %i", (mime, size, expected) => {
    expect(checkCvDeclaration(mime, size, max)).toEqual(expected);
  });
});

describe("detectedMatchesDeclared", () => {
  it("accepts matching and rejects mismatching", () => {
    expect(detectedMatchesDeclared("PDF", CV_MIME_TYPES.PDF)).toBe(true);
    expect(detectedMatchesDeclared("PDF", CV_MIME_TYPES.DOC)).toBe(false);
  });
});

describe("decideAnonymousUpload", () => {
  const limits = { perIpPerHour: 5, globalPerHour: 100 };
  it.each([
    [{ authenticated: true, uploadsLastHourForIp: 99, anonUploadsLastHourGlobal: 999 }, { allowed: true }],
    [{ authenticated: false, uploadsLastHourForIp: 4, anonUploadsLastHourGlobal: 99 }, { allowed: true }],
    [{ authenticated: false, uploadsLastHourForIp: 5, anonUploadsLastHourGlobal: 0 }, { allowed: false, reason: "IP_QUOTA" }],
    [{ authenticated: false, uploadsLastHourForIp: 0, anonUploadsLastHourGlobal: 100 }, { allowed: false, reason: "GLOBAL_QUOTA" }],
  ])("%j", (ctx, expected) => {
    expect(decideAnonymousUpload(ctx, limits)).toEqual(expected);
  });
});
