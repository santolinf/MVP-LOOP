import type { Readable } from "node:stream";
import { Inject, Injectable } from "@nestjs/common";
import type { Env } from "../../config/index.js";
import { CV_ENV } from "./storage.service.js";

export type ScanVerdict = "CLEAN" | "INFECTED";

/**
 * Client for the malware scanner contract (ADR 0012): POST {CLAMAV_URL}/scan with the file bytes and a bearer token,
 * answered by {"verdict":"CLEAN"|"INFECTED"}. Any failure to obtain a clean verdict throws, so a file is never
 * promoted unscanned.
 */
@Injectable()
export class ClamavService {
  private readonly url: string;
  private readonly token: string;

  constructor(@Inject(CV_ENV) env: Env) {
    this.url = env.CLAMAV_URL.replace(/\/+$/, "");
    this.token = env.CLAMAV_AUTH_TOKEN;
  }

  /** CVs are capped at CV_MAX_BYTES_AUTH, so buffering is bounded and gives the request a Content-Length. */
  async scan(stream: Readable, timeoutMs = 60_000): Promise<ScanVerdict> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
    const res = await fetch(`${this.url}/scan`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", authorization: `Bearer ${this.token}` },
      body: Buffer.concat(chunks),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`clamav scanner responded ${res.status}`);
    const body = (await res.json()) as { verdict?: string };
    if (body.verdict === "CLEAN" || body.verdict === "INFECTED") return body.verdict;
    throw new Error("clamav gave no verdict");
  }
}
