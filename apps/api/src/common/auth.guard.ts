import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { SESSION_COOKIE, SessionService } from "../modules/auth/session.service.js";

interface AuthRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  contractorId?: string;
  sessionId?: string;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
/** Sign-in endpoints take no session, so a stale cookie must not trip the CSRF check. */
const CSRF_EXEMPT = /\/auth\/(otp\/(request|verify)|token\/refresh)(\?|$)/;

function header(req: AuthRequest, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

function readCookie(raw: string | undefined, name: string): string | undefined {
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

/**
 * Resolves the caller from a bearer JWT (mobile) or the session cookie plus CSRF token (web).
 * Requests with no credentials pass through unauthenticated: `resolveContractorId` decides whether the
 * route needs a contractor (and keeps the non-production dev fallback). Bad credentials are a 401.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(SessionService) private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;
    const req = context.switchToHttp().getRequest<AuthRequest>();

    const authz = header(req, "authorization");
    if (authz?.startsWith("Bearer ")) {
      const claims = this.sessions.verifyAccessToken(authz.slice(7).trim());
      if (!claims) throw new UnauthorizedException("Invalid or expired token");
      const session = await this.sessions.resolve(claims.sid);
      if (!session || session.contractorId !== claims.sub) throw new UnauthorizedException("Invalid or expired token");
      req.contractorId = session.contractorId;
      req.sessionId = session.sessionId;
      return true;
    }

    const cookie = readCookie(header(req, "cookie"), SESSION_COOKIE);
    if (!cookie) return true;
    const sessionId = this.sessions.sessionIdFromCookie(cookie);
    const session = sessionId ? await this.sessions.resolve(sessionId) : null;
    if (!session) return true; // stale cookie behaves like no cookie; sign-in can replace it
    if (!SAFE_METHODS.has(req.method.toUpperCase()) && !CSRF_EXEMPT.test(req.url)) {
      if (!this.sessions.verifyCsrf(session.sessionId, header(req, "x-csrf-token"))) {
        throw new ForbiddenException("Missing or invalid CSRF token");
      }
    }
    req.contractorId = session.contractorId;
    req.sessionId = session.sessionId;
    return true;
  }
}
