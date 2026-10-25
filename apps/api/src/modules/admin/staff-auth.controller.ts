import { Body, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  AdminAuthResultSchema,
  AdminMeSchema,
  AdminOkSchema,
  AdminOtpRequestResultSchema,
  AdminOtpRequestSchema,
  AdminOtpVerifySchema,
  AdminTotpCodeSchema,
  AdminTotpSetupSchema,
} from "@loop/contracts";
import { AUTH_SETTINGS, type AuthSettings } from "../auth/session.service.js";
import { CurrentStaff, StaffAuthenticated, StaffController, StaffPendingMfa, StaffPublic, type StaffPrincipal, type StaffRequest } from "./staff-access.js";
import { OtpRateLimited, StaffAuthService } from "./staff-auth.service.js";
import {
  STAFF_CSRF_COOKIE,
  STAFF_SESSION_COOKIE,
  STAFF_SESSION_HOURS,
  STAFF_PENDING_MINUTES,
  StaffSessionService,
} from "./staff-session.service.js";

class AdminOtpRequestDto extends createZodDto(AdminOtpRequestSchema) {}
class AdminOtpRequestResultDto extends createZodDto(AdminOtpRequestResultSchema) {}
class AdminOtpVerifyDto extends createZodDto(AdminOtpVerifySchema) {}
class AdminTotpCodeDto extends createZodDto(AdminTotpCodeSchema) {}
class AdminTotpSetupDto extends createZodDto(AdminTotpSetupSchema) {}
class AdminAuthResultDto extends createZodDto(AdminAuthResultSchema) {}
class AdminMeDto extends createZodDto(AdminMeSchema) {}
class AdminOkDto extends createZodDto(AdminOkSchema) {}

interface HttpRes {
  setHeader(name: string, value: string | number): void;
  cookie(name: string, value: string, options: Record<string, unknown>): void;
  clearCookie(name: string, options: Record<string, unknown>): void;
}

const MINUTE_MS = 60_000;

@ApiTags("admin-auth")
@StaffController("auth")
export class StaffAuthController {
  constructor(
    @Inject(StaffAuthService) private readonly auth: StaffAuthService,
    @Inject(StaffSessionService) private readonly sessions: StaffSessionService,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
  ) {}

  /** The session cookie only travels to the admin API; the readable CSRF cookie only to the admin pages. */
  private sessionCookie(res: HttpRes, sessionId: string, maxAgeMs: number): void {
    const base = { sameSite: "strict", secure: this.settings.production, maxAge: maxAgeMs };
    res.cookie(STAFF_SESSION_COOKIE, this.sessions.cookieValue(sessionId), { ...base, httpOnly: true, path: "/api/v1/admin" });
    res.cookie(STAFF_CSRF_COOKIE, this.sessions.csrfToken(sessionId), { ...base, httpOnly: false, path: "/admin" });
  }

  private clearCookies(res: HttpRes): void {
    res.clearCookie(STAFF_SESSION_COOKIE, { path: "/api/v1/admin" });
    res.clearCookie(STAFF_CSRF_COOKIE, { path: "/admin" });
  }

  @Post("otp/request")
  @HttpCode(200)
  @StaffPublic()
  @ApiOperation({ operationId: "adminRequestOtp" })
  @ApiBody({ type: AdminOtpRequestDto })
  @ApiOkResponse({ type: AdminOtpRequestResultDto })
  async request(@Body() body: AdminOtpRequestDto, @Req() req: StaffRequest, @Res({ passthrough: true }) res: HttpRes): Promise<AdminOtpRequestResultDto> {
    try {
      return await this.auth.requestOtp(body.email, req.ip);
    } catch (e) {
      if (e instanceof OtpRateLimited) res.setHeader("Retry-After", e.retryAfterSeconds);
      throw e;
    }
  }

  @Post("otp/verify")
  @HttpCode(200)
  @StaffPublic()
  @ApiOperation({ operationId: "adminVerifyOtp" })
  @ApiBody({ type: AdminOtpVerifyDto })
  @ApiOkResponse({ type: AdminAuthResultDto })
  async verify(@Body() body: AdminOtpVerifyDto, @Res({ passthrough: true }) res: HttpRes): Promise<AdminAuthResultDto> {
    const { sessionId, stage } = await this.auth.verifyOtp(body.email, body.code);
    this.sessionCookie(res, sessionId, STAFF_PENDING_MINUTES * MINUTE_MS);
    return { stage };
  }

  /** Starts authenticator enrolment for a first sign-in. Not available once enrolled. */
  @Post("totp/setup")
  @HttpCode(200)
  @StaffPendingMfa()
  @ApiOperation({ operationId: "adminTotpSetup" })
  @ApiOkResponse({ type: AdminTotpSetupDto })
  setup(@Req() req: StaffRequest): Promise<AdminTotpSetupDto> {
    return this.auth.totpSetup(req.staffPendingId ?? "");
  }

  @Post("totp/verify")
  @HttpCode(200)
  @StaffPendingMfa()
  @ApiOperation({ operationId: "adminTotpVerify" })
  @ApiBody({ type: AdminTotpCodeDto })
  @ApiOkResponse({ type: AdminAuthResultDto })
  async totp(@Body() body: AdminTotpCodeDto, @Req() req: StaffRequest, @Res({ passthrough: true }) res: HttpRes): Promise<AdminAuthResultDto> {
    const { sessionId } = await this.auth.totpVerify(req.staffPendingId ?? "", req.staffSessionId ?? "", body.code);
    this.sessionCookie(res, sessionId, STAFF_SESSION_HOURS * 60 * MINUTE_MS);
    return { stage: "AUTHENTICATED" };
  }

  @Get("me")
  @StaffAuthenticated()
  @ApiOperation({ operationId: "adminMe" })
  @ApiOkResponse({ type: AdminMeDto })
  me(@CurrentStaff() staff: StaffPrincipal): AdminMeDto {
    return this.auth.me(staff);
  }

  @Post("logout")
  @HttpCode(200)
  @StaffAuthenticated()
  @ApiOperation({ operationId: "adminLogout" })
  @ApiOkResponse({ type: AdminOkDto })
  async logout(@CurrentStaff() staff: StaffPrincipal, @Res({ passthrough: true }) res: HttpRes): Promise<AdminOkDto> {
    await this.auth.logout(staff);
    this.clearCookies(res);
    return { ok: true };
  }
}
