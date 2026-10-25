import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { ConflictException, BadRequestException, HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Prisma, prisma } from "@loop/db";
import { CONSENT_WORDING, checkOtpUsable, decideOtpSend, generateOtpCode, normaliseEmail, normaliseUkMobile, routeForReturnTarget } from "@loop/domain";
import type { AuthResult, OtpRequest, OtpRequestResult, OtpVerify } from "@loop/contracts";
import { AuditService } from "../../common/audit.service.js";
import { loadOtpConfig } from "../../common/auth-config.js";
import { logger } from "../../common/logger.js";
import { DraftService } from "../cv/draft.service.js";
import { EMAIL_SENDER, type EmailSender } from "./email-sender.js";
import { renderOtpEmail } from "./email-templates.js";
import { AUTH_SETTINGS, SessionService, type AuthSettings } from "./session.service.js";

const HOUR_MS = 3_600_000;
const GENERIC_FAILURE = "Invalid or expired code";

/** 429 carrying the delay for the Retry-After header. Depends only on email/IP volume, never on whether an account exists. */
export class OtpRateLimitedException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super("Too many code requests. Try again later.", HttpStatus.TOO_MANY_REQUESTS);
  }
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

@Injectable()
export class OtpService {
  constructor(
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
    @Inject(EMAIL_SENDER) private readonly sender: EmailSender,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DraftService) private readonly drafts: DraftService,
  ) {}

  private hmac(data: string): string {
    return createHmac("sha256", this.settings.sessionSecret).update(data).digest("hex");
  }

  private emailHash(email: string): string {
    return this.hmac(`email:${email}`);
  }

  private codeHash(emailHash: string, code: string): string {
    return this.hmac(`code:${emailHash}:${code}`);
  }

  /** Always answers `accepted`; whether an email goes out is invisible to the caller. */
  async request(input: OtpRequest, ip: string | undefined, now = new Date()): Promise<OtpRequestResult> {
    const cfg = await loadOtpConfig();
    const email = normaliseEmail(input.email);
    const emailHash = this.emailHash(email);
    const since = new Date(now.getTime() - HOUR_MS);

    const [last, sentForEmail, sentForIp] = await Promise.all([
      prisma.emailOtp.findFirst({ where: { emailHash }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      prisma.emailOtp.count({ where: { emailHash, createdAt: { gte: since } } }),
      ip ? prisma.emailOtp.count({ where: { requestIp: ip, createdAt: { gte: since } } }) : Promise.resolve(0),
    ]);

    const decision = decideOtpSend(
      { now, lastSentAt: last?.createdAt ?? null, sentLastHourForEmail: sentForEmail, sentLastHourForIp: sentForIp },
      cfg,
    );
    if (!decision.allowed) throw new OtpRateLimitedException(decision.retryAfterSeconds);

    // A row is written for every accepted request, so limits behave the same for unknown emails.
    const code = generateOtpCode((max) => randomInt(max), cfg.codeLength);
    await prisma.emailOtp.create({
      data: {
        emailHash,
        purpose: input.purpose,
        codeHash: this.codeHash(emailHash, code),
        expiresAt: new Date(now.getTime() + cfg.ttlMinutes * 60_000),
        clientType: input.clientType,
        requestIp: ip,
      },
    });

    const existing = await prisma.contractor.findUnique({ where: { email }, select: { id: true } });
    // Registering with an existing email sends a sign-in code; signing in with an unknown email sends nothing.
    if (existing) {
      await this.deliver(email, renderOtpEmail({ kind: "SIGN_IN", code, ttlMinutes: cfg.ttlMinutes }));
    } else if (input.purpose === "REGISTER") {
      await this.deliver(email, renderOtpEmail({ kind: "REGISTER", code, ttlMinutes: cfg.ttlMinutes }));
    }

    return { accepted: true, resendAfterSeconds: cfg.resendCooldownSeconds };
  }

  private async deliver(to: string, message: ReturnType<typeof renderOtpEmail>): Promise<void> {
    try {
      await this.sender.send(to, message);
    } catch (e) {
      // Never log the address or code; a delivery failure must not change the response either.
      logger.error({ errorName: e instanceof Error ? e.name : "unknown" }, "OTP email delivery failed");
    }
  }

  async verify(input: OtpVerify, now = new Date()): Promise<AuthResult> {
    const cfg = await loadOtpConfig();
    const email = normaliseEmail(input.email);
    const emailHash = this.emailHash(email);
    const fail = (): UnauthorizedException => new UnauthorizedException(GENERIC_FAILURE);

    let mobile: string | null = null;
    if (input.purpose === "REGISTER") {
      if (!input.registration) throw new BadRequestException("Registration details are required");
      mobile = normaliseUkMobile(input.registration.mobile);
      if (!mobile) throw new BadRequestException("A UK mobile number is required");
    }

    const row = await prisma.emailOtp.findFirst({ where: { emailHash, purpose: input.purpose }, orderBy: { createdAt: "desc" } });
    if (!row) throw fail();
    if (checkOtpUsable(row, now, cfg) !== "USABLE") throw fail();

    // Count the attempt before comparing so parallel guesses cannot exceed the limit.
    const counted = await prisma.emailOtp.update({ where: { id: row.id }, data: { attempts: { increment: 1 } }, select: { attempts: true } });
    if (counted.attempts > cfg.maxAttempts) throw fail();
    if (!safeEqual(this.codeHash(emailHash, input.code), row.codeHash)) throw fail();

    const consumed = await prisma.emailOtp.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: now } });
    if (consumed.count !== 1) throw fail();

    let contractor = await prisma.contractor.findUnique({ where: { email }, select: { id: true, firstAppSignInAt: true } });
    if (!contractor) {
      if (input.purpose !== "REGISTER" || !input.registration || !mobile) throw fail();
      contractor = await this.createContractor(email, mobile, input.registration);
    }

    // TODO(spec): Q8 attestation is accepted but not verified; the `auth.attestation` flag stays off until the provider is chosen.
    const result = await this.sessions.create({
      contractorId: contractor.id,
      clientType: input.clientType,
      appPlatform: input.clientType === "MOBILE_APP" ? input.attestation?.platform : undefined,
      attestationVerified: false,
      now,
    });

    if (input.clientType === "MOBILE_APP" && !contractor.firstAppSignInAt) {
      // TODO(spec): CH-06 first-app-sign-in behaviour lands in a later phase; only the columns are recorded now.
      await prisma.contractor.updateMany({
        where: { id: contractor.id, firstAppSignInAt: null },
        data: { firstAppSignInAt: now, firstAppSignInSessionId: result.sessionId },
      });
    }
    await this.audit.record({
      actorId: contractor.id,
      entityType: "Contractor",
      entityId: contractor.id,
      action: "SIGNED_IN",
      after: { clientType: input.clientType, purpose: input.purpose, sessionId: result.sessionId },
    });

    if (input.draftToken) {
      // Best-effort: a stale or foreign draft token must never block sign-in.
      try {
        const adopted = await this.drafts.adopt(input.draftToken, contractor.id, now);
        if (adopted) {
          await this.audit.record({
            actorId: contractor.id,
            entityType: "Contractor",
            entityId: contractor.id,
            action: "UPLOAD_DRAFT_ADOPTED",
          });
        }
      } catch (e) {
        logger.error({ errorName: e instanceof Error ? e.name : "unknown" }, "Upload draft adoption failed");
      }
    }

    const target = input.returnToken ? this.sessions.verifyReturnToken(input.returnToken, now) : null;
    return target ? { ...result, returnTo: routeForReturnTarget(target) } : result;
  }

  private async createContractor(
    email: string,
    phone: string,
    reg: NonNullable<OtpVerify["registration"]>,
  ): Promise<{ id: string; firstAppSignInAt: Date | null }> {
    try {
      const created = await prisma.contractor.create({
        data: {
          email,
          phone,
          firstName: reg.firstName,
          lastName: reg.lastName,
          marketingConsent: reg.marketingOptIn === true,
        },
        select: { id: true, firstAppSignInAt: true },
      });
      if (reg.marketingOptIn === true) {
        // Deprecated field: only an explicit true from an older client is honoured, as a versioned grant.
        await prisma.consentRecord.create({
          data: {
            contractorId: created.id,
            purpose: "LOOP_MARKETING",
            wordingVersion: CONSENT_WORDING.LOOP_MARKETING.version,
            source: "WEB",
            grantedAt: new Date(),
          },
        });
      }
      await this.audit.record({
        actorId: created.id,
        entityType: "Contractor",
        entityId: created.id,
        action: "REGISTERED",
        after: { marketingConsent: reg.marketingOptIn === true, termsAccepted: true },
      });
      return created;
    } catch (e) {
      // TODO(spec): Q1 mobile ownership is not verified; a clashing number is refused without naming the owner.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException("Could not complete registration with those details");
      }
      throw e;
    }
  }
}
