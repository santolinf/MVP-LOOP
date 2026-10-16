import type { ArgumentsHost, ExceptionFilter} from "@nestjs/common";
import { Catch, HttpException } from "@nestjs/common";
import type { Response } from "express";

/** Maps errors to RFC 9457 problem responses. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(err: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status = err instanceof HttpException ? err.getStatus() : 500;
    const title = err instanceof HttpException ? err.message : "Internal Server Error";
    res.status(status).type("application/problem+json").json({ type: "about:blank", title, status });
  }
}
