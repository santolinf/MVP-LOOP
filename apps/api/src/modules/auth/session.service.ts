import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { prisma } from "@loop/db";
import type { AuthResult, ClientTypeValue, SessionItem } from "@loop/contracts";
import { isReturnTargetId, type ReturnTargetId } from "@loop/domain";

export const AUTH_SETTINGS = Symbol("AUTH_SETTINGS");

export interface AuthSettings {
  sessionSecret: string;
  jwtSecret: string;
  production: boolean;
}

export const ACCESS_TOKEN_SECONDS = 15 * 60;
export const WEB_SESSION_DAYS = 30;
export const APP_SESSION_DAYS = 90;
export const WEB_IDLE_HOURS = 8;
export const RETURN_TOKEN_SECONDS = 30 * 60;
export const SESSION_COOKIE = "loop_session";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const TOUCH_INTERVAL_MS = 5 * 60_000;

const b64url = (b: Buffer | string): string => Buffer.from(b).toString("base64url");
const sha256 = (v: string): string => createHash("sha256").update(v).digest("hex");

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface Authenticated {
  contractorId: string;
  sessionId: string;
}

@Injectable()
export class SessionService {
  constructor(@Inject(AUTH_SETTINGS) private readonly settings: AuthSettings) {}

  private mac(secret: string, data: string): string {
    return createHmac("sha256", secret).update(data).digest("base64url");
  }

  /** Web cookie value: `<sessionId>.<hmac>`. */
  cookieValue(sessionId: string): string {
    return `${sessionId}.${this.mac(this.settings.sessionSecret, sessionId)}`;
  }

  /** Double-submit CSRF token, derived from the session so nothing extra is stored. */
  csrfToken(sessionId: string): string {
    return this.mac(this.settings.sessionSecret, `csrf:${sessionId}`);
  }

  verifyCsrf(sessionId: string, token: string | undefined): boolean {
    return !!token && safeEqual(token, this.csrfToken(sessionId));
  }

  sessionIdFromCookie(value: string): string | null {
    const dot = value.lastIndexOf(".");
    if (dot <= 0) return null;
    const id = value.slice(0, dot);
    return safeEqual(value.slice(dot + 1), this.mac(this.settings.sessionSecret, id)) ? id : null;
  }

  signAccessToken(contractorId: string, sessionId: string, now = new Date()): string {
    const iat = Math.floor(now.getTime() / 1000);
    const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const body = b64url(JSON.stringify({ sub: contractorId, sid: sessionId, iat, exp: iat + ACCESS_TOKEN_SECONDS }));
    return `${head}.${body}.${this.mac(this.settings.jwtSecret, `${head}.${body}`)}`;
  }

  verifyAccessToken(token: string, now = new Date()): { sub: string; sid: string } | null {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [head, body, sig] = parts as [string, string, string];
    if (!safeEqual(sig, this.mac(this.settings.jwtSecret, `${head}.${body}`))) return null;
    try {
      const header = JSON.parse(Buffer.from(head, "base64url").toString("utf8")) as { alg?: string };
      if (header.alg !== "HS256") return null;
      const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { sub?: unknown; sid?: unknown; exp?: unknown };
      if (typeof claims.sub !== "string" || typeof claims.sid !== "string" || typeof claims.exp !== "number") return null;
      if (claims.exp * 1000 <= now.getTime()) return null;
      return { sub: claims.sub, sid: claims.sid };
    } catch {
      return null;
    }
  }

  /** Creates a session and the credentials for its client type. */
  async create(input: {
    contractorId: string;
    clientType: ClientTypeValue;
    appPlatform?: "IOS" | "ANDROID";
    attestationVerified?: boolean;
    now?: Date;
  }): Promise<AuthResult> {
    const now = input.now ?? new Date();
    const web = input.clientType === "WEB";
    const refreshToken = web ? undefined : randomBytes(32).toString("base64url");
    const session = await prisma.session.create({
      data: {
        contractorId: input.contractorId,
        clientType: input.clientType,
        appPlatform: input.appPlatform,
        attestationVerified: input.attestationVerified ?? false,
        refreshTokenHash: refreshToken ? sha256(refreshToken) : null,
        expiresAt: new Date(now.getTime() + (web ? WEB_SESSION_DAYS : APP_SESSION_DAYS) * DAY_MS),
        lastUsedAt: now,
      },
    });
    return this.result(input.contractorId, session.id, web, refreshToken, now);
  }

  private result(contractorId: string, sessionId: string, web: boolean, refreshToken: string | undefined, now: Date): AuthResult {
    return web
      ? { contractorId, sessionId, csrfToken: this.csrfToken(sessionId) }
      : {
          contractorId,
          sessionId,
          accessToken: this.signAccessToken(contractorId, sessionId, now),
          refreshToken,
          expiresInSeconds: ACCESS_TOKEN_SECONDS,
        };
  }

  /**
   * Confirms the session exists and is not revoked, past its absolute expiry, or (WEB only) idle too long.
   * Touches lastUsedAt at most once per TOUCH_INTERVAL_MS so the idle window slides without a write per request.
   */
  async resolve(sessionId: string, now = new Date()): Promise<Authenticated | null> {
    const s = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!s || s.revokedAt || s.expiresAt <= now) return null;
    const last = s.lastUsedAt ?? s.createdAt;
    if (s.clientType === "WEB" && now.getTime() - last.getTime() >= WEB_IDLE_HOURS * HOUR_MS) return null;
    if (now.getTime() - last.getTime() >= TOUCH_INTERVAL_MS) {
      await prisma.session.updateMany({ where: { id: s.id, revokedAt: null }, data: { lastUsedAt: now } });
    }
    return { contractorId: s.contractorId, sessionId: s.id };
  }

  /** Signs a short-lived, single-purpose token naming an allow-listed return target. It never authenticates. */
  signReturnToken(target: ReturnTargetId, now = new Date()): string {
    const body = b64url(JSON.stringify({ t: target, exp: Math.floor(now.getTime() / 1000) + RETURN_TOKEN_SECONDS }));
    return `${body}.${this.mac(this.settings.sessionSecret, `return:${body}`)}`;
  }

  /** Returns the target id, or null if the token is malformed, tampered, expired or names an unknown target. */
  verifyReturnToken(token: string, now = new Date()): ReturnTargetId | null {
    const dot = token.lastIndexOf(".");
    if (dot <= 0) return null;
    const body = token.slice(0, dot);
    if (!safeEqual(token.slice(dot + 1), this.mac(this.settings.sessionSecret, `return:${body}`))) return null;
    try {
      const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { t?: unknown; exp?: unknown };
      if (typeof claims.exp !== "number" || claims.exp * 1000 <= now.getTime()) return null;
      return isReturnTargetId(claims.t) ? claims.t : null;
    } catch {
      return null;
    }
  }

  /** Rotates the refresh token: the presented token is single use; a stale one fails with 401. */
  async refresh(refreshToken: string, now = new Date()): Promise<AuthResult> {
    const hash = sha256(refreshToken);
    const s = await prisma.session.findUnique({ where: { refreshTokenHash: hash } });
    if (!s || s.revokedAt || s.expiresAt <= now) throw new UnauthorizedException("Invalid refresh token");
    const next = randomBytes(32).toString("base64url");
    const swapped = await prisma.session.updateMany({
      where: { id: s.id, refreshTokenHash: hash, revokedAt: null },
      data: { refreshTokenHash: sha256(next), lastUsedAt: now },
    });
    if (swapped.count !== 1) throw new UnauthorizedException("Invalid refresh token");
    return this.result(s.contractorId, s.id, false, next, now);
  }

  async revoke(sessionId: string, contractorId: string, now = new Date()): Promise<void> {
    await prisma.session.updateMany({
      where: { id: sessionId, contractorId, revokedAt: null },
      data: { revokedAt: now, refreshTokenHash: null },
    });
  }

  /** Signs the contractor out of every device; returns how many sessions were revoked. */
  async revokeAll(contractorId: string, now = new Date()): Promise<number> {
    const r = await prisma.session.updateMany({
      where: { contractorId, revokedAt: null },
      data: { revokedAt: now, refreshTokenHash: null },
    });
    return r.count;
  }

  async list(contractorId: string, currentSessionId: string | undefined, now = new Date()): Promise<SessionItem[]> {
    const rows = await prisma.session.findMany({
      where: { contractorId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      clientType: r.clientType,
      createdAt: r.createdAt.toISOString(),
      lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
      current: r.id === currentSessionId,
    }));
  }
}
