import { Socket } from "node:net";
import type { Readable } from "node:stream";
import { Inject, Injectable } from "@nestjs/common";
import type { Env } from "../../config/index.js";
import { CV_ENV } from "./storage.service.js";

export type ScanVerdict = "CLEAN" | "INFECTED";

/** ClamAV clamd INSTREAM client. Any failure to obtain a clean verdict throws, so a file is never promoted unscanned. */
@Injectable()
export class ClamavService {
  private readonly host: string;
  private readonly port: number;

  constructor(@Inject(CV_ENV) env: Env) {
    this.host = env.CLAMAV_HOST;
    this.port = env.CLAMAV_PORT;
  }

  scan(stream: Readable, timeoutMs = 60_000): Promise<ScanVerdict> {
    return new Promise((resolve, reject) => {
      const sock = new Socket();
      let reply = "";
      const fail = (e: Error): void => {
        sock.destroy();
        reject(e);
      };
      sock.setTimeout(timeoutMs, () => fail(new Error("clamav timeout")));
      sock.on("error", fail);
      sock.on("data", (d: Buffer) => {
        reply += d.toString("utf8");
      });
      sock.on("close", () => {
        if (/FOUND/.test(reply)) resolve("INFECTED");
        else if (/\bOK\b/.test(reply)) resolve("CLEAN");
        else reject(new Error("clamav gave no verdict"));
      });
      sock.connect(this.port, this.host, () => {
        sock.write("zINSTREAM\0");
        stream.on("data", (chunk: Buffer) => {
          const len = Buffer.alloc(4);
          len.writeUInt32BE(chunk.length);
          sock.write(len);
          sock.write(chunk);
        });
        stream.on("end", () => sock.write(Buffer.alloc(4)));
        stream.on("error", fail);
      });
    });
  }
}
