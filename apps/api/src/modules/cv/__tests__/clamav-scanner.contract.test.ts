import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:net";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../../../config/index.js";
import { ClamavService } from "../clamav.service.js";

// ADR 0012 scanner contract, checked against the real HTTP front (infra/clamav-scanner/server.mjs) with a fake
// clamd behind it. To check a deployed scanner (any cloud, with real ClamAV) as well, set CLAMAV_CONTRACT_URL and
// CLAMAV_CONTRACT_TOKEN before running.
const SERVER = fileURLToPath(new URL("../../../../../../infra/clamav-scanner/server.mjs", import.meta.url));
const TOKEN = "k".repeat(40);
const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
const MAX_BYTES = 1024;

/** Speaks just enough clamd: zPING and zINSTREAM, flagging payloads that contain the EICAR test string. */
function fakeClamd(): Server {
  return createServer((sock) => {
    let buf = Buffer.alloc(0);
    sock.on("error", () => undefined);
    sock.on("data", (d: Buffer) => {
      buf = Buffer.concat([buf, d]);
      if (buf.subarray(0, 6).toString() === "zPING\0") return void sock.end("PONG\0");
      if (buf.subarray(0, 10).toString() !== "zINSTREAM\0") return;
      let at = 10;
      const parts: Buffer[] = [];
      for (;;) {
        if (buf.length < at + 4) return;
        const len = buf.readUInt32BE(at);
        if (len === 0) break;
        if (buf.length < at + 4 + len) return;
        parts.push(buf.subarray(at + 4, at + 4 + len));
        at += 4 + len;
      }
      sock.end(Buffer.concat(parts).includes(EICAR) ? "stream: Eicar-Signature FOUND\0" : "stream: OK\0");
    });
  });
}

async function freePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const { port } = s.address() as { port: number };
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

let clamd: Server;
let front: ChildProcess;
let baseUrl: string;

beforeAll(async () => {
  clamd = fakeClamd();
  await new Promise<void>((r) => clamd.listen(0, "127.0.0.1", r));
  const clamdPort = (clamd.address() as { port: number }).port;
  const port = await freePort();
  front = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(port), AUTH_TOKEN: TOKEN, MAX_BYTES: String(MAX_BYTES), CLAMD_PORT: String(clamdPort) },
    stdio: "ignore",
  });
  baseUrl = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    const up = await fetch(`${baseUrl}/healthz`).then((r) => r.ok, () => false);
    if (up) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("scanner front did not become healthy");
});

afterAll(() => {
  front?.kill();
  clamd?.close();
});

const auth = { authorization: `Bearer ${TOKEN}` };

describe("scanner HTTP contract", () => {
  it("GET /healthz is 200 once clamd answers", async () => {
    expect((await fetch(`${baseUrl}/healthz`)).status).toBe(200);
  });

  it("POST /scan returns CLEAN for a clean file", async () => {
    const res = await fetch(`${baseUrl}/scan`, { method: "POST", headers: auth, body: "an ordinary CV" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ verdict: "CLEAN" });
  });

  it("POST /scan returns INFECTED for the EICAR test file", async () => {
    const res = await fetch(`${baseUrl}/scan`, { method: "POST", headers: auth, body: EICAR });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ verdict: "INFECTED" });
  });

  it.each([
    ["no token", {}],
    ["a wrong token", { authorization: `Bearer ${"x".repeat(40)}` }],
  ])("rejects %s with 401 and never scans", async (_n, headers) => {
    const res = await fetch(`${baseUrl}/scan`, { method: "POST", headers, body: "x" });
    expect(res.status).toBe(401);
  });

  it("rejects files over the size cap with 413", async () => {
    const res = await fetch(`${baseUrl}/scan`, { method: "POST", headers: auth, body: Buffer.alloc(MAX_BYTES + 1) });
    expect(res.status).toBe(413);
  });

  it("is 404 for anything else", async () => {
    expect((await fetch(`${baseUrl}/nope`, { headers: auth })).status).toBe(404);
  });

  it("is a 5xx, not a verdict, when clamd is unreachable", async () => {
    const port = await freePort();
    const dead = spawn(process.execPath, [SERVER], {
      env: { ...process.env, PORT: String(port), AUTH_TOKEN: TOKEN, CLAMD_PORT: "1" },
      stdio: "ignore",
    });
    try {
      let status = 0;
      for (let i = 0; i < 50 && !status; i++) {
        status = await fetch(`http://127.0.0.1:${port}/scan`, { method: "POST", headers: auth, body: "x" }).then((r) => r.status, () => 0);
        if (!status) await new Promise((r) => setTimeout(r, 100));
      }
      expect(status).toBeGreaterThanOrEqual(500);
    } finally {
      dead.kill();
    }
  });
});

describe("ClamavService against the scanner", () => {
  const client = (): ClamavService => new ClamavService(loadEnv({ DATABASE_URL: "postgresql://x", CLAMAV_URL: baseUrl, CLAMAV_AUTH_TOKEN: TOKEN }));

  it("maps both verdicts", async () => {
    await expect(client().scan(Readable.from([Buffer.from("fine")]))).resolves.toBe("CLEAN");
    await expect(client().scan(Readable.from([Buffer.from(EICAR)]))).resolves.toBe("INFECTED");
  });

  it("throws (fails closed) on a wrong token", async () => {
    const bad = new ClamavService(loadEnv({ DATABASE_URL: "postgresql://x", CLAMAV_URL: baseUrl, CLAMAV_AUTH_TOKEN: "w".repeat(40) }));
    await expect(bad.scan(Readable.from([Buffer.from("x")]))).rejects.toThrow(/401/);
  });
});

const realUrl = process.env.CLAMAV_CONTRACT_URL;
describe.skipIf(!realUrl)("deployed scanner (real ClamAV)", () => {
  it("clean file is CLEAN and EICAR is INFECTED", async () => {
    const svc = new ClamavService(
      loadEnv({ DATABASE_URL: "postgresql://x", CLAMAV_URL: realUrl, CLAMAV_AUTH_TOKEN: process.env.CLAMAV_CONTRACT_TOKEN }),
    );
    await expect(svc.scan(Readable.from([Buffer.from("an ordinary CV")]))).resolves.toBe("CLEAN");
    await expect(svc.scan(Readable.from([Buffer.from(EICAR)]))).resolves.toBe("INFECTED");
  });
});
