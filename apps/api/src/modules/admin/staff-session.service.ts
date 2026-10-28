import { createHmac, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { prisma } from "@loop/db";
import { isStaffRole, type StaffRole } from "@loop/domain";
import { AUTH_SETTINGS, type AuthSettings } from "../auth/session.service.js";

export const STAFF_SESSION_COOKIE = "loop_staff";
export const STAFF_CSRF_COOKIE = "staff_csrf";
/** Short sessions: an absolute cap, an idle cap, and a brief window to finish the second factor. */
export const STAFF_SESSION_HOURS = 8;
export const STAFF_IDLE_MINUTES = 30;
export const STAFF_PENDING_MINUTES = 10;

const MINUTE_MS = 60_000;
const TOUCH_INTERVAL_MS = MINUTE_MS;

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface ResolvedStaffSession {
  sessionId: string;
  mfaVerified: boolean;
  staff: { id: string; email: string; name: string | null; role: StaffRole };
}

/** Separate realm: own cookie, own MAC domain, own table. A contractor session can never satisfy a staff check. */
@Injectable()
export class StaffSessionService {
  constructor(@Inject(AUTH_SETTINGS) private readonly settings: AuthSettings) {}

  private mac(data: string): string {
    return createHmac("sha256", this.settings.sessionSecret).update(`staff:${data}`).digest("base64url");
  }

  cookieValue(sessionId: string): string {
    return `${sessionId}.${this.mac(sessionId)}`;
  }

  csrfToken(sessionId: string): string {
    return this.mac(`csrf:${sessionId}`);
  }

  verifyCsrf(sessionId: string, token: string | undefined): boolean {
    return !!token && safeEqual(token, this.csrfToken(sessionId));
  }

  sessionIdFromCookie(value: string): string | null {
    const dot = value.lastIndexOf(".");
    if (dot <= 0) return null;
    const id = value.slice(0, dot);
    return safeEqual(value.slice(dot + 1), this.mac(id)) ? id : null;
  }

  /** New session after the email code: only the second factor can be completed with it. */
  async createPending(staffId: string, now = new Date()): Promise<string> {
    const s = await prisma.staffSession.create({
      data: { staffId, expiresAt: new Date(now.getTime() + STAFF_PENDING_MINUTES * MINUTE_MS), lastUsedAt: now },
    });
    return s.id;
  }

  /** Completes the second factor. Issues a fresh session id and revokes the pending one (no session fixation). */
  async upgrade(pendingSessionId: string, staffId: string, now = new Date()): Promise<string> {
    const [, full] = await prisma.$transaction([
      prisma.staffSession.updateMany({ where: { id: pendingSessionId, staffId, revokedAt: null }, data: { revokedAt: now } }),
      prisma.staffSession.create({
        data: { staffId, mfaVerifiedAt: now, expiresAt: new Date(now.getTime() + STAFF_SESSION_HOURS * 3_600_000), lastUsedAt: now },
      }),
    ]);
    return full.id;
  }

  async resolve(sessionId: string, now = new Date()): Promise<ResolvedStaffSession | null> {
    const s = await prisma.staffSession.findUnique({ where: { id: sessionId } });
    if (!s || s.revokedAt || s.expiresAt <= now) return null;
    const last = s.lastUsedAt ?? s.createdAt;
    if (s.mfaVerifiedAt && now.getTime() - last.getTime() >= STAFF_IDLE_MINUTES * MINUTE_MS) return null;
    const staff = await prisma.staffUser.findUnique({ where: { id: s.staffId } });
    if (!staff || !staff.active || !isStaffRole(staff.role)) return null;
    if (now.getTime() - last.getTime() >= TOUCH_INTERVAL_MS) {
      await prisma.staffSession.updateMany({ where: { id: s.id, revokedAt: null }, data: { lastUsedAt: now } });
    }
    return {
      sessionId: s.id,
      mfaVerified: s.mfaVerifiedAt !== null,
      staff: { id: staff.id, email: staff.email, name: staff.name, role: staff.role },
    };
  }

  async revoke(sessionId: string, now = new Date()): Promise<void> {
    await prisma.staffSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: now } });
  }

  async revokeAllFor(staffId: string, now = new Date()): Promise<number> {
    const r = await prisma.staffSession.updateMany({ where: { staffId, revokedAt: null }, data: { revokedAt: now } });
    return r.count;
  }
}
