/* global Buffer, console, process */
// HTTP front for the clamd running in the same container. Cloud Run only speaks HTTP, while clamd speaks a raw
// TCP protocol (INSTREAM), so this translates:  POST /scan (file bytes)  ->  {"verdict":"CLEAN"|"INFECTED"}.
// Anything that is not a clear verdict is a 5xx, so the caller fails closed and never promotes an unscanned CV.
import { createServer } from "node:http";
import { Socket } from "node:net";
import { timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT ?? 8080);
const TOKEN = process.env.AUTH_TOKEN ?? "";
const MAX_BYTES = Number(process.env.MAX_BYTES ?? 25 * 1024 * 1024);
// clamd runs in this container; overridable so the contract test can point at a fake.
const CLAMD_HOST = process.env.CLAMD_HOST ?? "127.0.0.1";
const CLAMD_PORT = Number(process.env.CLAMD_PORT ?? 3310);

if (TOKEN.length < 32) {
  console.error("AUTH_TOKEN (>= 32 chars) is required");
  process.exit(1);
}

function authorised(header) {
  const given = Buffer.from(header ?? "");
  const want = Buffer.from(`Bearer ${TOKEN}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

function clamd(command, payload, timeoutMs = 50_000) {
  return new Promise((resolve, reject) => {
    const sock = new Socket();
    let reply = "";
    sock.setTimeout(timeoutMs, () => sock.destroy(new Error("clamd timeout")));
    sock.on("error", reject);
    sock.on("data", (d) => (reply += d.toString("utf8")));
    sock.on("close", () => resolve(reply));
    sock.connect(CLAMD_PORT, CLAMD_HOST, () => {
      sock.write(command);
      if (payload) {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(payload.length);
        sock.write(len);
        sock.write(payload);
        sock.write(Buffer.alloc(4));
      }
    });
  });
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/healthz") {
      // Ready only once clamd has loaded its signatures and answers.
      const pong = await clamd("zPING\0", null, 3000);
      return send(res, /PONG/.test(pong) ? 200 : 503, { status: /PONG/.test(pong) ? "ok" : "starting" });
    }
    if (req.method !== "POST" || req.url !== "/scan") return send(res, 404, { error: "not found" });
    if (!authorised(req.headers.authorization)) return send(res, 401, { error: "unauthorised" });

    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BYTES) return send(res, 413, { error: "too large" });
      chunks.push(chunk);
    }
    const reply = await clamd("zINSTREAM\0", Buffer.concat(chunks));
    if (/FOUND/.test(reply)) return send(res, 200, { verdict: "INFECTED" });
    if (/\bOK\b/.test(reply)) return send(res, 200, { verdict: "CLEAN" });
    return send(res, 502, { error: "no verdict" });
  } catch {
    // Never echo file content or clamd output.
    return send(res, 502, { error: "scan failed" });
  }
}).listen(PORT, () => console.log(`scanner listening on ${PORT}`));
