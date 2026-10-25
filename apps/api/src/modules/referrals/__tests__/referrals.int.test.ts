import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "@loop/db";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

// B5: the referral record is a real, constrained database row. Needs Docker: `pnpm --filter @loop/api test:integration`.
type Prisma = typeof prismaClient;
const dbDir = fileURLToPath(new URL("../../../../../../packages/db", import.meta.url));

let container: StartedPostgreSqlContainer;
let prisma: Prisma;
let seq = 0;

const contractor = () => prisma.contractor.create({ data: { phone: `+4477006${String(++seq).padStart(5, "0")}` } });

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17").start();
  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;
  execSync("pnpm exec prisma migrate deploy", { cwd: dbDir, env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  prisma = (await import("@loop/db")).prisma;
});

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

beforeEach(async () => {
  await prisma.$executeRaw`TRUNCATE "Referral", "ReferralFlag", "Contractor" CASCADE`;
});

describe("Referral integrity against Postgres (B5)", () => {
  it("stores the introducer, introduced contractor, code used and hashed evidence", async () => {
    const [a, b] = [await contractor(), await contractor()];
    const row = await prisma.referral.create({
      data: { referrerId: a.id, refereeId: b.id, source: "LINK", codeUsed: "ABCD2345", ipHash: "h1", userAgentHash: "h2" },
    });
    expect(row).toMatchObject({ referrerId: a.id, refereeId: b.id, codeUsed: "ABCD2345", ipHash: "h1", userAgentHash: "h2" });
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it("allows unlimited direct introductions from one contractor", async () => {
    const a = await contractor();
    const others = await Promise.all(Array.from({ length: 7 }, contractor));
    await prisma.referral.createMany({ data: others.map((o) => ({ referrerId: a.id, refereeId: o.id })) });
    expect(await prisma.referral.count({ where: { referrerId: a.id } })).toBe(7);
  });

  it("rejects a self-referral at the database", async () => {
    const a = await contractor();
    await expect(prisma.referral.create({ data: { referrerId: a.id, refereeId: a.id } })).rejects.toThrow();
  });

  it("rejects a second introducer for the same contractor", async () => {
    const [a, b, c] = [await contractor(), await contractor(), await contractor()];
    await prisma.referral.create({ data: { referrerId: a.id, refereeId: c.id } });
    await expect(prisma.referral.create({ data: { referrerId: b.id, refereeId: c.id } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("rejects a referral that points at a contractor that does not exist", async () => {
    const a = await contractor();
    await expect(prisma.referral.create({ data: { referrerId: a.id, refereeId: "missing" } })).rejects.toThrow();
    await expect(prisma.referral.create({ data: { referrerId: "missing", refereeId: a.id } })).rejects.toThrow();
  });

  it("refuses to delete a contractor who is part of a referral", async () => {
    const [a, b] = [await contractor(), await contractor()];
    await prisma.referral.create({ data: { referrerId: a.id, refereeId: b.id } });
    await expect(prisma.contractor.delete({ where: { id: a.id } })).rejects.toThrow();
  });
});
