import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { prisma as prismaClient } from "@loop/db";
import type { FoundingService } from "../founding.service.js";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

// B6: parallel completions must never exceed the cap. Runs the real conditional UPDATE against Postgres.
// Needs Docker (DOCKER_HOST honoured): `pnpm --filter @loop/api test:integration`.
type Prisma = typeof prismaClient;
type Service = FoundingService;

const CAP = 3;
const dbDir = fileURLToPath(new URL("../../../../../../packages/db", import.meta.url));

let container: StartedPostgreSqlContainer;
let prisma: Prisma;
let founding: Service;
let seq = 0;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17").start();
  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;
  execSync("pnpm exec prisma migrate deploy", { cwd: dbDir, env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  // Imported after DATABASE_URL is set: the Prisma client reads it at module load.
  prisma = (await import("@loop/db")).prisma;
  const { FoundingService } = await import("../founding.service.js");
  const { AuditService } = await import("../../../common/audit.service.js");
  founding = new FoundingService(new AuditService());
});

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

beforeEach(async () => {
  await prisma.$executeRaw`TRUNCATE "Referral", "ReferralFlag", "Contractor", "AuditEvent" CASCADE`;
  await prisma.foundingCounter.upsert({ where: { id: 1 }, create: { id: 1, allocated: 0, cap: CAP }, update: { allocated: 0, cap: CAP } });
});

/** A contractor with current availability and five locked, unflagged introductions. */
async function eligibleContractor(): Promise<string> {
  const n = ++seq;
  const c = await prisma.contractor.create({
    data: {
      phone: `+4477009${String(n).padStart(5, "0")}`,
      employmentSituation: "BETWEEN_CONTRACTS",
      availableFrom: new Date("2020-01-01T00:00:00Z"),
      lastConfirmedAt: new Date(),
    },
  });
  await prisma.referral.createMany({
    data: Array.from({ length: 5 }, (_, i) => ({ referrerId: c.id, refereeId: `ref-${n}-${i}`, lockedAt: new Date() })),
  });
  return c.id;
}

describe("Founding allocation against Postgres (B6)", () => {
  it("never allocates more places than the cap under parallel completions", async () => {
    const ids = await Promise.all(Array.from({ length: 20 }, () => eligibleContractor()));
    const results = await Promise.all(ids.map((id) => founding.allocateIfEligible(id)));

    const places = results.filter((p): p is number => p !== null);
    expect(places).toHaveLength(CAP);
    expect(new Set(places).size).toBe(CAP);
    expect([...places].sort()).toEqual([1, 2, 3]);
    expect((await prisma.foundingCounter.findUniqueOrThrow({ where: { id: 1 } })).allocated).toBe(CAP);
    expect(await prisma.contractor.count({ where: { foundingPlace: { not: null } } })).toBe(CAP);
    expect(await prisma.auditEvent.count({ where: { action: "founding.allocated" } })).toBe(CAP);
  });

  it("gives one contractor exactly one place when completions race for the same person", async () => {
    const id = await eligibleContractor();
    const results = await Promise.all(Array.from({ length: 10 }, () => founding.allocateIfEligible(id)));

    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe(1);
    // Losing racers roll back their counter increment, so only one place is consumed.
    expect((await prisma.foundingCounter.findUniqueOrThrow({ where: { id: 1 } })).allocated).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "founding.allocated" } })).toBe(1);
  });

  it("allocates nothing to contractors held by an open review flag", async () => {
    const id = await eligibleContractor();
    const first = await prisma.referral.findFirstOrThrow({ where: { referrerId: id } });
    await prisma.referralFlag.create({ data: { referralId: first.id, reason: "SAME_DEVICE" } });

    expect(await founding.allocateIfEligible(id)).toBeNull();
    expect((await prisma.foundingCounter.findUniqueOrThrow({ where: { id: 1 } })).allocated).toBe(0);
  });
});
