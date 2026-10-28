import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { hasPermission, isIpAllowed } from "@loop/domain";
import { readCookie } from "../../common/cookies.js";
import { loadEnv } from "../../config/index.js";
import { STAFF_ACCESS, STAFF_REALM, type StaffAccess, type StaffRequest } from "./staff-access.js";
import { STAFF_SESSION_COOKIE, StaffSessionService } from "./staff-session.service.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const header = (req: StaffRequest, name: string): string | undefined => {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
};

/**
 * Guards the staff realm (controllers built with @StaffController). Deny by default: a handler with no declared access
 * is refused, a session needs the second factor, writes need the CSRF token, and each handler's permission is
 * checked against the caller's role on every request. Controllers outside the realm are not touched.
 */
@Injectable()
export class StaffGuard implements CanActivate {
  private readonly allowList: readonly string[];

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(StaffSessionService) private readonly sessions: StaffSessionService,
  ) {
    this.allowList = loadEnv().ADMIN_IP_ALLOWLIST;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;
    if (!this.reflector.get<boolean | undefined>(STAFF_REALM, context.getClass())) return true;
    const req = context.switchToHttp().getRequest<StaffRequest>();

    if (!isIpAllowed(req.ip, this.allowList)) throw new ForbiddenException("Not available from this network");

    const access = this.reflector.get<StaffAccess | undefined>(STAFF_ACCESS, context.getHandler());
    if (!access) throw new ForbiddenException("Route has no declared permission");
    if (access.kind === "public") return true;

    const cookie = readCookie(header(req, "cookie"), STAFF_SESSION_COOKIE);
    const sessionId = cookie ? this.sessions.sessionIdFromCookie(cookie) : null;
    const session = sessionId ? await this.sessions.resolve(sessionId) : null;
    if (!session) throw new UnauthorizedException("Sign in required");

    if (!SAFE_METHODS.has(req.method.toUpperCase()) && !this.sessions.verifyCsrf(session.sessionId, header(req, "x-csrf-token"))) {
      throw new ForbiddenException("Missing or invalid CSRF token");
    }

    if (access.kind === "pending") {
      if (session.mfaVerified) throw new ForbiddenException("Second factor already completed");
      req.staffPendingId = session.staff.id;
      req.staffSessionId = session.sessionId;
      return true;
    }
    if (!session.mfaVerified) throw new UnauthorizedException("Second factor required");
    if (access.kind === "permission" && !hasPermission(session.staff.role, access.permission)) {
      throw new ForbiddenException("Your role does not allow this");
    }
    req.staff = { ...session.staff, sessionId: session.sessionId };
    return true;
  }
}
