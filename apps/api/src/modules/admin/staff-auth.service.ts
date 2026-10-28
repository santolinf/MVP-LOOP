import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { ConflictException, HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { prisma } from "@loop/db";
import { checkOtpUsable, decideOtpSend, generateOtpCode, normaliseEmail, permissionsFor, type StaffRole } from "@loop/domain";
import type { AdminMe } from "@loop/contracts";
import { AuditService } from "../../common/audit.service.js";
import { loadOtpConfig } from "../../common/auth-config.js";
import { logger } from "../../common/logger.js";
import { RateLimitedException, RateLimitStore } from "../../common/rate-limit.js";
import { EMAIL_SENDER, type EmailSender } from "../auth/email-sender.js";
import type { RenderedEmail } from "../auth/email-templates.js";
import { AUTH_SETTINGS, type AuthSettings } from "../auth/session.service.js";
import { StaffSessionService } from "./staff-session.service.js";
import { decryptSecret, encryptSecret, generateTotpSecret, otpauthUrl, verifyTotp } from "./totp.js";

const HOUR_MS = 3_600_000;
const GENERIC_FAILURE = "Invalid or expired code";
/** Wrong second-factor codes allowed per staff member per minute (on top of the 10-minute pending session). */
export const TOTP_ATTEMPTS_PER_MINUTE = 5;

export class OtpRateLimited extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super("Too many code requests. Try again later.", HttpStatus.TOO_MANY_REQUESTS);
  }
}

const safeEqual = (a: string, b: string): boolean => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function renderStaffOtpEmail(code: string, ttlMinutes: number): RenderedEmail {
  const outro = `The code expires in ${ttlMinutes} minutes and can be used once. You will also need your authenticator app. If you did not ask for it, tell your administrator.`;
  return {
    subject: `Your LOOP Admin sign-in code: ${code}`,
    text: `Use this code to sign in to LOOP Admin:\n\n${code}\n\n${outro}\n`,
    html: `<p>Use this code to sign in to LOOP Admin:</p><p style="font-size:24px;letter-spacing:4px"><strong>${code}</strong></p><p>${outro}</p>`,
  };
}

export type StaffStage = "MFA_ENROL" | "MFA_REQUIRED" | "AUTHENTICATED";

@Injectable()
export class StaffAuthService {
  constructor(
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
    @Inject(EMAIL_SENDER) private readonly sender: EmailSender,
    @Inject(StaffSessionService) private readonly sessions: StaffSessionService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(RateLimitStore) private readonly limiter: RateLimitStore,
  ) {}

  private hmac(data: string): string {
    return createHmac("sha256", this.settings.sessionSecret).update(`staff-otp:${data}`).digest("hex");
  }
  private emailHash(email: string): string {
    return this.hmac(`email:${email}`);
  }
  private codeHash(emailHash: string, code: string): string {
    return this.hmac(`code:${emailHash}:${code}`);
  }

  /** Always answers accepted; whether an email goes out is invisible to the caller. */
  async requestOtp(emailInput: string, ip: string | undefined, now = new Date()): Promise<{ accepted: true; resendAfterSeconds: number }> {
    const cfg = await loadOtpConfig();
    const email = normaliseEmail(emailInput);
    const emailHash = this.emailHash(email);
    const since = new Date(now.getTime() - HOUR_MS);
    const [last, sentForEmail, sentForIp] = await Promise.all([
      prisma.staffOtp.findFirst({ where: { emailHash }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      prisma.staffOtp.count({ where: { emailHash, createdAt: { gte: since } } }),
      ip ? prisma.staffOtp.count({ where: { requestIp: ip, createdAt: { gte: since } } }) : Promise.resolve(0),
    ]);
    const decision = decideOtpSend(
      { now, lastSentAt: last?.createdAt ?? null, sentLastHourForEmail: sentForEmail, sentLastHourForIp: sentForIp },
      cfg,
    );
    if (!decision.allowed) throw new OtpRateLimited(decision.retryAfterSeconds);

    const code = generateOtpCode((max) => randomInt(max), cfg.codeLength);
    await prisma.staffOtp.create({
      data: {
        emailHash,
        codeHash: this.codeHash(emailHash, code),
        expiresAt: new Date(now.getTime() + cfg.ttlMinutes * 60_000),
        requestIp: ip,
      },
    });
    const staff = await prisma.staffUser.findUnique({ where: { email }, select: { active: true } });
    if (staff?.active) {
      try {
        await this.sender.send(email, renderStaffOtpEmail(code, cfg.ttlMinutes));
      } catch (e) {
        logger.error({ errorName: e instanceof Error ? e.name : "unknown" }, "Staff OTP email delivery failed");
      }
    }
    return { accepted: true, resendAfterSeconds: cfg.resendCooldownSeconds };
  }

  /** Email code verified: returns a pending session id (second factor outstanding) and the next stage. */
  async verifyOtp(emailInput: string, code: string, now = new Date()): Promise<{ sessionId: string; stage: StaffStage }> {
    const cfg = await loadOtpConfig();
    const email = normaliseEmail(emailInput);
    const emailHash = this.emailHash(email);
    const fail = (): UnauthorizedException => new UnauthorizedException(GENERIC_FAILURE);

    const row = await prisma.staffOtp.findFirst({ where: { emailHash }, orderBy: { createdAt: "desc" } });
    if (!row || checkOtpUsable(row, now, cfg) !== "USABLE") throw fail();
    const counted = await prisma.staffOtp.update({ where: { id: row.id }, data: { attempts: { increment: 1 } }, select: { attempts: true } });
    if (counted.attempts > cfg.maxAttempts) throw fail();
    if (!safeEqual(this.codeHash(emailHash, code), row.codeHash)) throw fail();
    const consumed = await prisma.staffOtp.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: now } });
    if (consumed.count !== 1) throw fail();

    const staff = await prisma.staffUser.findUnique({ where: { email } });
    if (!staff || !staff.active) throw fail();

    const sessionId = await this.sessions.createPending(staff.id, now);
    await this.audit.record({ actorId: staff.id, actorType: "STAFF", entityType: "StaffUser", entityId: staff.id, action: "admin.otp_verified" });
    return { sessionId, stage: staff.totpEnrolledAt ? "MFA_REQUIRED" : "MFA_ENROL" };
  }

  /** Starts (or restarts) enrolment. Refused once enrolled: an admin must reset the second factor first. */
  async totpSetup(staffId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const staff = await prisma.staffUser.findUnique({ where: { id: staffId } });
    if (!staff) throw new UnauthorizedException("Sign in required");
    if (staff.totpEnrolledAt) throw new ConflictException("Authenticator already set up");
    const secret = generateTotpSecret();
    await prisma.staffUser.update({ where: { id: staffId }, data: { totpSecretEnc: encryptSecret(secret, this.settings.sessionSecret) } });
    return { secret, otpauthUrl: otpauthUrl(staff.email, secret) };
  }

  /** Verifies the authenticator code (first success also completes enrolment) and swaps in a full session. */
  async totpVerify(staffId: string, pendingSessionId: string, code: string, now = new Date()): Promise<{ sessionId: string }> {
    if ((await this.limiter.hit("staff-totp", staffId, now)) > TOTP_ATTEMPTS_PER_MINUTE) throw new RateLimitedException(60);
    const staff = await prisma.staffUser.findUnique({ where: { id: staffId } });
    if (!staff || !staff.active || !staff.totpSecretEnc) throw new UnauthorizedException("Invalid code");
    const step = verifyTotp(decryptSecret(staff.totpSecretEnc, this.settings.sessionSecret), code, now, staff.lastTotpStep);
    if (step === null) {
      await this.audit.record({ actorId: staffId, actorType: "STAFF", entityType: "StaffUser", entityId: staffId, action: "admin.totp_failed" });
      throw new UnauthorizedException("Invalid code");
    }
    // The step guard doubles as the replay check under concurrency: only one request can advance lastTotpStep.
    const advanced = await prisma.staffUser.updateMany({
      where: { id: staffId, OR: [{ lastTotpStep: null }, { lastTotpStep: { lt: step } }] },
      data: { lastTotpStep: step, totpEnrolledAt: staff.totpEnrolledAt ?? now, lastSignInAt: now },
    });
    if (advanced.count !== 1) throw new UnauthorizedException("Invalid code");
    const sessionId = await this.sessions.upgrade(pendingSessionId, staffId, now);
    await this.audit.record({
      actorId: staffId,
      actorType: "STAFF",
      entityType: "StaffUser",
      entityId: staffId,
      action: staff.totpEnrolledAt ? "admin.signed_in" : "admin.totp_enrolled",
    });
    return { sessionId };
  }

  async logout(staff: { id: string; sessionId: string }): Promise<void> {
    await this.sessions.revoke(staff.sessionId);
    await this.audit.record({ actorId: staff.id, actorType: "STAFF", entityType: "StaffUser", entityId: staff.id, action: "admin.signed_out" });
  }

  me(staff: { id: string; email: string; name: string | null; role: StaffRole }): AdminMe {
    return { id: staff.id, email: staff.email, name: staff.name, role: staff.role, permissions: permissionsFor(staff.role) };
  }
}
