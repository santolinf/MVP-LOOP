import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import { Catch, HttpException } from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodValidationException } from "nestjs-zod";

const TITLES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  409: "Conflict",
  413: "Payload Too Large",
  415: "Unsupported Media Type",
  422: "Unprocessable Content",
  429: "Too Many Requests",
};

type Issue = { path: (string | number)[]; message: string; code?: string };

function zodIssues(err: ZodValidationException): { path: string; message: string }[] {
  const zodError = err.getZodError() as { issues?: Issue[] } | undefined;
  return (zodError?.issues ?? []).map((i) => ({
    path: i.path.join("."),
    // Unrecognised-key messages echo caller-supplied key names; keep the output fixed.
    message: i.code === "unrecognized_keys" ? "Unknown field" : i.message,
  }));
}

/**
 * Maps errors to RFC 9457 problem responses. Never includes stack traces, internal messages, input
 * values or query strings; non-HTTP errors become a generic 500. Service code is responsible for
 * throwing account-agnostic exceptions (see OtpService), the filter additionally refuses to echo
 * their free-text detail beyond the exception's own safe message.
 */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(err: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    const status = err instanceof HttpException ? err.getStatus() : 500;
    const title = TITLES[status] ?? (status >= 500 ? "Internal Server Error" : "Error");

    const body: Record<string, unknown> = {
      type: "about:blank",
      title,
      status,
      instance: (req.originalUrl ?? req.url ?? "").split("?")[0],
    };

    if (err instanceof ZodValidationException) {
      body.detail = "The request did not pass validation.";
      body.errors = zodIssues(err);
    } else if (err instanceof HttpException && status < 500) {
      body.detail = err.message;
    }

    const retryAfter = (err as { retryAfterSeconds?: unknown }).retryAfterSeconds;
    if (status === 429 && typeof retryAfter === "number") res.setHeader("Retry-After", String(retryAfter));

    res.status(status).type("application/problem+json").json(body);
  }
}
