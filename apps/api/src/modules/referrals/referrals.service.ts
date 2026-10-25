import { createHash, randomInt } from "node:crypto";
import { ConflictException, Inject, Injectable } from "@nestjs/common";
import { prisma } from "@loop/db";
import {
  generateReferralCode,
  introductionCounts,
  isReferralValid,
  maskName,
  normaliseEmailIdentity,
  normaliseReferralCode,
  sameDeviceClusters,
  type ReferralFlagStatus,
} from "@loop/domain";
import type {
  AttributeReferralResult,
  Introducer,
  IntroducerLookupResult,
  IntroducerSource,
  ReferralCodeCheck,
  ReferralLink,
  ReferralList,
} from "@loop/contracts";
import { AuditService } from "../../common/audit.service.js";
import { hashKey, RateLimitedException, RateLimitStore, WINDOW_SECONDS } from "../../common/rate-limit.js";
import { FoundingService } from "../founding/founding.service.js";

const isUniqueViolation = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
const hashDevice = (deviceId: string) => createHash("sha256").update(deviceId).digest("hex");

/** Verbal lookups are the only path that resolves an email to a member, so they are tightly limited. */
export const LOOKUP_LIMIT_PER_ACCOUNT = 5;
export const LOOKUP_LIMIT_PER_IP = 20;

export interface AttributionContext {
  source: IntroducerSource;
  deviceId?: string;
  /** Raw request evidence; only hashes are stored (B5 dispute evidence). */
  ip?: string;
  userAgent?: string;
}

/** Evidence stored with every attribution: the code used plus hashed device, IP and user agent. */
const evidenceOf = (code: string, ctx: AttributionContext) => ({
  codeUsed: code,
  deviceHash: ctx.deviceId ? hashDevice(ctx.deviceId) : null,
  ipHash: ctx.ip ? hashKey(ctx.ip) : null,
  userAgentHash: ctx.userAgent ? hashKey(ctx.userAgent) : null,
});

@Injectable()
export class ReferralsService {
  // Explicit @Inject: the dev runner (tsx/esbuild) does not emit design:paramtypes metadata.
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(FoundingService) private readonly founding: FoundingService,
    @Inject(RateLimitStore) private readonly limiter: RateLimitStore,
  ) {}

  /** The code is created lazily on first request; collisions retry against the unique index. */
  async link(id: string): Promise<ReferralLink> {
    const c = await prisma.contractor.findUnique({ where: { id }, select: { referralCode: true } });
    let code = c?.referralCode ?? null;
    for (let attempt = 0; !code && attempt < 5; attempt++) {
      const candidate = generateReferralCode((max) => randomInt(max));
      try {
        await prisma.contractor.update({ where: { id }, data: { referralCode: candidate } });
        code = candidate;
        await this.audit.record({
          actorId: id,
          entityType: "Contractor",
          entityId: id,
          action: "referral.code_created",
          before: { referralCode: null },
          after: { referralCode: candidate },
        });
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
    }
    if (!code) throw new Error("Could not allocate a referral code");
    // Links and QR codes always go to V33 web registration, never to an app.
    const base = process.env.PUBLIC_BASE_URL ?? "http://localhost:5173";
    return { code, url: `${base}/join?ref=${code}` };
  }

  async list(id: string): Promise<ReferralList> {
    const refs = await prisma.referral.findMany({ where: { referrerId: id }, orderBy: { createdAt: "desc" } });
    const [people, flags] = refs.length
      ? await Promise.all([
          prisma.contractor.findMany({
            where: { id: { in: refs.map((r) => r.refereeId) } },
            select: { id: true, firstName: true },
          }),
          prisma.referralFlag.findMany({ where: { referralId: { in: refs.map((r) => r.id) } } }),
        ])
      : [[], []];
    const byId = new Map(people.map((p) => [p.id, p]));
    const items = refs.map((r) => {
      const statuses = flags.filter((f) => f.referralId === r.id).map((f) => f.status as ReferralFlagStatus);
      return {
        id: r.id,
        refereeFirstName: byId.get(r.refereeId)?.firstName ?? null,
        registeredAt: r.createdAt.toISOString(),
        counted: introductionCounts({ locked: r.lockedAt !== null, flagStatuses: statuses }),
        underReview: statuses.includes("OPEN"),
      };
    });
    const lifetimeCount = items.filter((i) => i.counted).length;
    return { items, lifetimeCount, milestoneReached: lifetimeCount >= 5 };
  }

  async checkCode(raw: string): Promise<ReferralCodeCheck> {
    const code = normaliseReferralCode(raw);
    const referrer = code
      ? await prisma.contractor.findUnique({ where: { referralCode: code }, select: { firstName: true } })
      : null;
    return { valid: referrer !== null, referrerFirstName: referrer?.firstName ?? null };
  }

  /** The registrant's own introducer, masked, for the "who introduced you?" step. */
  async introducer(refereeId: string): Promise<Introducer> {
    const ref = await prisma.referral.findUnique({ where: { refereeId } });
    if (!ref) return { maskedName: null, locked: false };
    const referrer = await prisma.contractor.findUnique({
      where: { id: ref.referrerId },
      select: { firstName: true, lastName: true },
    });
    return { maskedName: maskName(referrer?.firstName ?? null, referrer?.lastName ?? null), locked: ref.lockedAt !== null };
  }

  /**
   * Verbal introductions: exact email of an existing member, answered with a masked confirmation. This is not a
   * searchable directory: no partial matching, per-account and per-IP limits, and the member's own email is never
   * matched. Only the code needed to attribute is returned, and only on a match.
   */
  async lookupMember(requesterId: string, email: string, ip?: string, now = new Date()): Promise<IntroducerLookupResult> {
    await this.enforceLookupLimits(requesterId, ip, now);
    const member = await prisma.contractor.findFirst({
      where: { email: { equals: email.trim(), mode: "insensitive" }, erasedAt: null, id: { not: requesterId } },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!member) return { found: false, maskedName: null, code: null };
    const { code } = await this.link(member.id);
    return { found: true, maskedName: maskName(member.firstName, member.lastName), code };
  }

  private async enforceLookupLimits(requesterId: string, ip: string | undefined, now: Date) {
    const checks: Array<[string, string | undefined, number]> = [
      ["introducer-lookup:account", requesterId, LOOKUP_LIMIT_PER_ACCOUNT],
      ["introducer-lookup:ip", ip, LOOKUP_LIMIT_PER_IP],
    ];
    for (const [scope, key, limit] of checks) {
      if (key && (await this.limiter.hit(scope, key, now)) > limit) throw new RateLimitedException(WINDOW_SECONDS);
    }
  }

  /**
   * Link/QR preselection: first valid introducer wins and is never overwritten here. Invalid, self or repeat
   * attributions are ignored. The registrant can still correct it with setIntroducer until it is locked.
   */
  async attribute(refereeId: string, raw: string, ctx: AttributionContext = { source: "LINK" }): Promise<AttributeReferralResult> {
    const code = normaliseReferralCode(raw);
    if (!code) return { attributed: false };
    const referrer = await prisma.contractor.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (!referrer) return { attributed: false };
    const existing = await prisma.referral.findUnique({ where: { refereeId } });
    if (!isReferralValid({ referrerId: referrer.id, refereeId, refereeAlreadyAttributed: existing !== null })) {
      return { attributed: false };
    }
    let created;
    try {
      created = await prisma.referral.create({
        data: {
          referrerId: referrer.id,
          refereeId,
          source: ctx.source,
          ...evidenceOf(code, ctx),
        },
      });
    } catch (e) {
      if (isUniqueViolation(e)) return { attributed: false }; // concurrent attribution won
      throw e;
    }
    await this.audit.record({
      actorId: refereeId,
      entityType: "Referral",
      entityId: created.id,
      action: "referral.attributed",
      after: { referrerId: referrer.id, refereeId, source: ctx.source, codeUsed: code },
    });
    return { attributed: true };
  }

  /**
   * "Who introduced you?": the registrant confirms or corrects the introducer. One direct introducer only;
   * once locked at GO LIVE, only an audited Admin override (Phase 10) may change it.
   */
  async setIntroducer(refereeId: string, raw: string, ctx: AttributionContext): Promise<AttributeReferralResult> {
    const code = normaliseReferralCode(raw);
    if (!code) return { attributed: false };
    const referrer = await prisma.contractor.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (!referrer) return { attributed: false };
    const existing = await prisma.referral.findUnique({ where: { refereeId } });
    if (existing?.lockedAt) throw new ConflictException("Your introducer is locked; contact LOOP support to change it.");
    if (!isReferralValid({ referrerId: referrer.id, refereeId, refereeAlreadyAttributed: false })) return { attributed: false };
    if (existing?.referrerId === referrer.id) return { attributed: true };
    const data = { referrerId: referrer.id, source: ctx.source, ...evidenceOf(code, ctx) };
    let row;
    try {
      row = existing
        ? await prisma.referral.update({ where: { id: existing.id }, data })
        : await prisma.referral.create({ data: { ...data, refereeId } });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException("Introducer already recorded");
      throw e;
    }
    await this.audit.record({
      actorId: refereeId,
      entityType: "Referral",
      entityId: row.id,
      action: existing ? "referral.introducer_changed" : "referral.attributed",
      before: existing ? { referrerId: existing.referrerId } : undefined,
      after: { referrerId: referrer.id, source: ctx.source, codeUsed: code },
    });
    return { attributed: true };
  }

  /**
   * Called when the referee completes registration (GO LIVE). Locks attribution, raises review flags for
   * same-device and self-identity clusters, then lets Founding re-check the introducer. Safe to repeat.
   */
  async lockOnRegistration(refereeId: string, now = new Date()): Promise<void> {
    const ref = await prisma.referral.findUnique({ where: { refereeId } });
    if (!ref) return;
    if (!ref.lockedAt) {
      const res = await prisma.referral.updateMany({ where: { id: ref.id, lockedAt: null }, data: { lockedAt: now } });
      if (res.count === 1) {
        await this.audit.record({
          actorId: refereeId,
          entityType: "Referral",
          entityId: ref.id,
          action: "referral.locked",
          before: { lockedAt: null },
          after: { lockedAt: now.toISOString(), referrerId: ref.referrerId },
        });
      }
    }
    await this.flagSuspicious(ref.referrerId, refereeId, ref.id);
    await this.founding.allocateIfEligible(ref.referrerId, now);
  }

  /** Flags go to review; nothing is silently counted or silently dropped. */
  private async flagSuspicious(referrerId: string, refereeId: string, referralId: string) {
    const [siblings, pair] = await Promise.all([
      prisma.referral.findMany({ where: { referrerId }, select: { id: true, deviceHash: true } }),
      prisma.contractor.findMany({ where: { id: { in: [referrerId, refereeId] } }, select: { id: true, email: true } }),
    ]);
    const toFlag: Array<{ referralId: string; reason: "SAME_DEVICE" | "SELF_IDENTITY" }> = [];
    for (const ids of sameDeviceClusters(siblings.map((s) => ({ referralId: s.id, deviceHash: s.deviceHash })))) {
      for (const referralId of ids) toFlag.push({ referralId, reason: "SAME_DEVICE" });
    }
    const referrerEmail = pair.find((p) => p.id === referrerId)?.email;
    const refereeEmail = pair.find((p) => p.id === refereeId)?.email;
    if (referrerEmail && refereeEmail && normaliseEmailIdentity(referrerEmail) === normaliseEmailIdentity(refereeEmail)) {
      toFlag.push({ referralId, reason: "SELF_IDENTITY" });
    }
    if (toFlag.length === 0) return;
    const created = await prisma.referralFlag.createMany({ data: toFlag, skipDuplicates: true });
    if (created.count > 0) {
      await this.audit.record({
        actorId: refereeId,
        entityType: "Referral",
        entityId: referrerId,
        action: "referral.flagged",
        after: { flags: toFlag },
      });
    }
  }
}
