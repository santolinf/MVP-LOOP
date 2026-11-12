import { describe, expect, it } from "vitest";
import { PHOTO_MAX_BYTES, checkPhotoDeclaration, detectPhotoType, detectedPhotoMatchesDeclared, isPhotoKeyOwnedBy } from "./index.js";

const bytes = (...b: number[]) => Uint8Array.from(b);
const webp = bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50);

describe("detectPhotoType", () => {
  it.each([
    ["JPEG", bytes(0xff, 0xd8, 0xff, 0xe0), "JPEG"],
    ["PNG", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0), "PNG"],
    ["WebP", webp, "WEBP"],
    ["RIFF that is not WebP (e.g. WAV)", bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45), null],
    ["GIF", bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61), null],
    ["SVG text", Uint8Array.from(Buffer.from("<svg xmlns=")), null],
    ["PDF", Uint8Array.from(Buffer.from("%PDF-1.4")), null],
    ["too short", bytes(0xff, 0xd8), null],
    ["empty", bytes(), null],
  ])("%s", (_name, head, expected) => {
    expect(detectPhotoType(head)).toBe(expected);
  });
});

describe("checkPhotoDeclaration", () => {
  it.each([
    ["image/jpeg", 1000, { ok: true }],
    ["image/png", PHOTO_MAX_BYTES, { ok: true }],
    ["image/webp", 1, { ok: true }],
    ["image/png", PHOTO_MAX_BYTES + 1, { ok: false, reason: "TOO_LARGE" }],
    ["image/png", 0, { ok: false, reason: "EMPTY" }],
    ["image/svg+xml", 1000, { ok: false, reason: "UNSUPPORTED_TYPE" }],
    ["image/gif", 1000, { ok: false, reason: "UNSUPPORTED_TYPE" }],
    ["application/pdf", 1000, { ok: false, reason: "UNSUPPORTED_TYPE" }],
  ])("%s %i bytes", (mime, size, expected) => {
    expect(checkPhotoDeclaration(mime, size)).toEqual(expected);
  });
});

describe("detectedPhotoMatchesDeclared", () => {
  it("requires content and declaration to agree", () => {
    expect(detectedPhotoMatchesDeclared("PNG", "image/png")).toBe(true);
    expect(detectedPhotoMatchesDeclared("PNG", "image/jpeg")).toBe(false);
  });
});

describe("isPhotoKeyOwnedBy", () => {
  it.each([
    ["photos/c1/abc", "c1", true],
    ["photos/c2/abc", "c1", false],
    ["photos/c1/", "c1", false],
    ["photos/c1/a/b", "c1", false],
    ["photos/c10/abc", "c1", false],
    ["ready/abc", "c1", false],
  ])("%s for %s", (key, id, expected) => {
    expect(isPhotoKeyOwnedBy(key, id)).toBe(expected);
  });
});
