import { BadRequestException, NotFoundException } from "@nestjs/common";
import { createZodDto, ZodValidationException } from "nestjs-zod";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ProblemFilter } from "../common/problem.filter.js";
import { OtpRateLimitedException } from "../modules/auth/otp.service.js";

function run(err: unknown) {
  const headers: Record<string, string> = {};
  let status = 0;
  let body: Record<string, unknown> = {};
  const res = {
    setHeader: (k: string, v: string) => void (headers[k] = v),
    status(c: number) {
      status = c;
      return res;
    },
    type: () => res,
    json(b: Record<string, unknown>) {
      body = b;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ originalUrl: "/api/v1/x?email=a@b.co" }) }) };
  new ProblemFilter().catch(err, host as never);
  return { status, body, headers };
}

describe("ProblemFilter", () => {
  it("returns a generic 500 without stack or message for unexpected errors", () => {
    const { status, body } = run(new Error("db password=hunter2 at /srv/app.js:10"));
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toMatch(/hunter2|app\.js|stack/);
    expect(body.detail).toBeUndefined();
  });

  it("strips the query string from instance", () => {
    expect(run(new NotFoundException("x")).body.instance).toBe("/api/v1/x");
  });

  it("reports validation errors by path without echoing input", () => {
    const Dto = createZodDto(z.object({ a: z.string() }).strict());
    void Dto;
    const parsed = z.object({ a: z.string() }).strict().safeParse({ a: 1, secret_key: "v" });
    if (parsed.success) throw new Error("expected failure");
    const { status, body } = run(new ZodValidationException(parsed.error));
    expect(status).toBe(400);
    expect(Array.isArray(body.errors)).toBe(true);
    expect(JSON.stringify(body)).not.toContain("secret_key");
  });

  it("sets Retry-After for rate limited exceptions", () => {
    const { status, headers } = run(new OtpRateLimitedException(42));
    expect(status).toBe(429);
    expect(headers["Retry-After"]).toBe("42");
  });

  it("keeps 4xx detail from HttpException", () => {
    expect(run(new BadRequestException("A UK mobile number is required")).body.detail).toBe("A UK mobile number is required");
  });
});
