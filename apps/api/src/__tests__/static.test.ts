import "reflect-metadata";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serveStatic } from "../static.js";

@Controller("health")
class StubHealth {
  @Get()
  get() {
    return { status: "ok" };
  }
}

@Module({ controllers: [StubHealth] })
class StubModule {}

describe("serveStatic", () => {
  let app: NestExpressApplication;
  let base: string;

  beforeAll(async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-static-"));
    mkdirSync(join(root, "web"));
    mkdirSync(join(root, "admin"));
    writeFileSync(join(root, "web", "index.html"), "WEB-INDEX");
    writeFileSync(join(root, "web", "__spa-fallback.html"), "WEB-FALLBACK");
    writeFileSync(join(root, "admin", "index.html"), "ADMIN-INDEX");
    app = await NestFactory.create<NestExpressApplication>(StubModule, { logger: false });
    app.setGlobalPrefix("api/v1");
    serveStatic(app, root);
    await app.listen(0);
    base = await app.getUrl();
  });

  afterAll(() => app.close());

  const get = async (path: string) => {
    const res = await fetch(base + path);
    return { status: res.status, body: await res.text() };
  };

  it("serves the prerendered web index at /", async () => {
    expect(await get("/")).toEqual({ status: 200, body: "WEB-INDEX" });
  });

  it("falls back to the SPA shell for unknown web routes", async () => {
    expect(await get("/register/step-2")).toEqual({ status: 200, body: "WEB-FALLBACK" });
  });

  it("serves the admin shell for /admin and nested routes", async () => {
    expect((await get("/admin")).body).toBe("ADMIN-INDEX");
    expect((await get("/admin/contractors/42")).body).toBe("ADMIN-INDEX");
  });

  it("leaves /api/v1 to the API, including unknown API paths", async () => {
    expect(JSON.parse((await get("/api/v1/health")).body)).toEqual({ status: "ok" });
    expect((await get("/api/v1/nope")).status).toBe(404);
  });
});
