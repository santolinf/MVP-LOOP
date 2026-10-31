import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnv } from "../../../config/index.js";
import { ClamavService } from "../clamav.service.js";

const TOKEN = "t".repeat(40);
let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

async function scanner(handler: (req: IncomingMessage, body: Buffer) => { status: number; json?: unknown }): Promise<{ url: string; seen: { auth?: string; body?: Buffer } }> {
  const seen: { auth?: string; body?: Buffer } = {};
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      seen.auth = req.headers.authorization;
      seen.body = Buffer.concat(chunks);
      const out = handler(req, seen.body);
      res.writeHead(out.status, { "content-type": "application/json" });
      res.end(JSON.stringify(out.json ?? {}));
    });
  });
  await new Promise<void>((r) => server?.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
}

function service(url: string): ClamavService {
  return new ClamavService(loadEnv({ DATABASE_URL: "postgresql://x", CLAMAV_URL: url, CLAMAV_AUTH_TOKEN: TOKEN }));
}

describe("ClamavService over HTTP (Cloud Run scanner)", () => {
  it.each(["CLEAN", "INFECTED"] as const)("returns %s and sends the file with the bearer token", async (verdict) => {
    const { url, seen } = await scanner(() => ({ status: 200, json: { verdict } }));
    await expect(service(url).scan(Readable.from([Buffer.from("cv-bytes")]))).resolves.toBe(verdict);
    expect(seen.auth).toBe(`Bearer ${TOKEN}`);
    expect(seen.body?.toString()).toBe("cv-bytes");
  });

  it.each([
    ["scanner error status", { status: 503 }],
    ["unauthorised", { status: 401 }],
    ["unknown verdict", { status: 200, json: { verdict: "MAYBE" } }],
    ["no verdict", { status: 200, json: {} }],
  ])("fails closed on %s", async (_name, reply) => {
    const { url } = await scanner(() => reply);
    await expect(service(url).scan(Readable.from([Buffer.from("x")]))).rejects.toThrow();
  });

  it("fails closed when the scanner is unreachable", async () => {
    await expect(service("http://127.0.0.1:1").scan(Readable.from([Buffer.from("x")]), 2000)).rejects.toThrow();
  });
});
