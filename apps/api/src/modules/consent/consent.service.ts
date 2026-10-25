import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, prisma } from "@loop/db";
import {
  activeConsents,
  CONSENT_PURPOSES,
  CONSENT_WORDING,
  isConsentPurpose,
  mustLeaveLive,
  type ConsentGrant,
  type ConsentPurpose,
} from "@loop/domain";
import type { ConsentList, UpdateConsentsRequest } from "@loop/contracts";
import { AuditService } from "../../common/audit.service.js";
import { hashKey } from "../../common/rate-limit.js";

type Source = "WEB" | "APP" | "ADMIN";

type Row = { purpose: string; wordingVersion: string; grantedAt: Date; withdrawnAt: Date | null };

function toGrants(rows: readonly Row[]): ConsentGrant[] {
  return rows.flatMap((r) =>
    isConsentPurpose(r.purpose)
      ? [{ purpose: r.purpose, wordingVersion: r.wordingVersion, grantedAt: r.grantedAt, withdrawnAt: r.withdrawnAt }]
      : [],
  );
}

/**
 * Phase 6 consent records (ADR 0006). Each grant stores purpose, wording version, time and source; withdrawal
 * stamps the row. Nothing is ever granted by default. Withdrawing a consent that LIVE depends on takes the
 * profile off LIVE in the same transaction.
 */
@Injectable()
export class ConsentService {
  // Explicit @Inject: the dev runner (tsx/esbuild) does not emit design:paramtypes metadata.
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  async active(contractorId: string): Promise<Set<ConsentPurpose>> {
    return activeConsents(toGrants(await prisma.consentRecord.findMany({ where: { contractorId } })));
  }

  /** Active consents for many contractors in one query (Phase 12 audience building). Absent ids have none. */
  async activeForMany(contractorIds: readonly string[]): Promise<Map<string, Set<ConsentPurpose>>> {
    const rows = await prisma.consentRecord.findMany({ where: { contractorId: { in: [...contractorIds] } } });
    const byContractor = new Map<string, Row[]>();
    for (const r of rows) byContractor.set(r.contractorId, [...(byContractor.get(r.contractorId) ?? []), r]);
    return new Map([...byContractor].map(([id, rs]) => [id, activeConsents(toGrants(rs))]));
  }

  async list(contractorId: string): Promise<ConsentList> {
    const rows = await prisma.consentRecord.findMany({ where: { contractorId }, orderBy: { grantedAt: "asc" } });
    const grants = toGrants(rows);
    const active = activeConsents(grants);
    return {
      items: CONSENT_PURPOSES.map((purpose) => {
        const w = CONSENT_WORDING[purpose];
        const current = active.has(purpose)
          ? grants.filter((g) => g.purpose === purpose && g.withdrawnAt === null).sort((a, b) => b.grantedAt.getTime() - a.grantedAt.getTime())[0]
          : undefined;
        return {
          purpose,
          granted: active.has(purpose),
          required: w.required,
          wordingVersion: w.version,
          wording: w.text,
          grantedAt: current?.grantedAt.toISOString() ?? null,
        };
      }),
    };
  }

  async update(
    contractorId: string,
    req: UpdateConsentsRequest,
    ip: string | undefined,
    now = new Date(),
    source: Source = "WEB",
  ): Promise<ConsentList> {
    const exists = await prisma.contractor.findUnique({ where: { id: contractorId }, select: { id: true } });
    if (!exists) throw new NotFoundException("Contractor not found");
    for (const c of req.changes) {
      if (c.granted && c.wordingVersion !== CONSENT_WORDING[c.purpose].version) {
        throw new ConflictException("The consent wording has changed. Please review it and try again.");
      }
    }

    let tookOffLive = false;
    try {
      await prisma.$transaction(async (tx) => {
        const before = await tx.consentRecord.findMany({ where: { contractorId } });
        const beforeActive = activeConsents(toGrants(before));
        for (const c of req.changes) {
          const current = before.find((r) => r.purpose === c.purpose && r.withdrawnAt === null);
          if (c.granted) {
            if (current?.wordingVersion === CONSENT_WORDING[c.purpose].version) continue;
            if (current) await tx.consentRecord.update({ where: { id: current.id }, data: { withdrawnAt: now } });
            await tx.consentRecord.create({
              data: {
                contractorId,
                purpose: c.purpose,
                wordingVersion: CONSENT_WORDING[c.purpose].version,
                source,
                ipHash: ip ? hashKey(ip) : null,
                grantedAt: now,
              },
            });
          } else if (current) {
            await tx.consentRecord.update({ where: { id: current.id }, data: { withdrawnAt: now } });
          }
        }
        const after = activeConsents(toGrants(await tx.consentRecord.findMany({ where: { contractorId } })));
        const live = await tx.contractor.findUnique({ where: { id: contractorId }, select: { live: true } });
        tookOffLive = !!live?.live && mustLeaveLive(after);
        // Keep the legacy flag in step until nothing reads it.
        await tx.contractor.update({
          where: { id: contractorId },
          data: { marketingConsent: after.has("LOOP_MARKETING"), ...(tookOffLive ? { live: false } : {}) },
        });
        const changed = CONSENT_PURPOSES.filter((p) => beforeActive.has(p) !== after.has(p));
        for (const purpose of changed) {
          await tx.auditEvent.create({
            data: {
              actorId: contractorId,
              entityType: "Contractor",
              entityId: contractorId,
              action: after.has(purpose) ? "consent.granted" : "consent.withdrawn",
              before: { purpose, granted: beforeActive.has(purpose) },
              after: { purpose, granted: after.has(purpose), wordingVersion: CONSENT_WORDING[purpose].version, source },
            },
          });
        }
      });
    } catch (e) {
      // Two parallel grants for one purpose collide on the partial unique index; the loser retries.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException("Your consent choices changed at the same time. Please try again.");
      }
      throw e;
    }
    if (tookOffLive) {
      await this.audit.record({
        actorId: contractorId,
        entityType: "Contractor",
        entityId: contractorId,
        action: "golive.revoked",
        before: { live: true },
        after: { live: false, reason: "required consent withdrawn" },
      });
    }
    return this.list(contractorId);
  }
}
