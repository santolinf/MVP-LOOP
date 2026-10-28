import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  AuthResultSchema,
  LogoutAllResultSchema,
  LogoutResultSchema,
  OtpRequestResultSchema,
  OtpRequestSchema,
  OtpVerifySchema,
  RefreshRequestSchema,
  ReturnTargetRequestSchema,
  ReturnTargetResultSchema,
  SessionListSchema,
} from "@loop/contracts";
import { AuditService } from "../../common/audit.service.js";
import { WEB_SESSION_DAYS, AUTH_SETTINGS, SESSION_COOKIE, SessionService, type AuthSettings } from "./session.service.js";
import { OtpRateLimitedException, OtpService } from "./otp.service.js";

/** Readable (non-httpOnly) double-submit CSRF cookie; name must match packages/api-client/src/fetcher.ts. */
const CSRF_COOKIE = "csrf";

class OtpRequestDto extends createZodDto(OtpRequestSchema) {}
class OtpRequestResultDto extends createZodDto(OtpRequestResultSchema) {}
class OtpVerifyDto extends createZodDto(OtpVerifySchema) {}
class AuthResultDto extends createZodDto(AuthResultSchema) {}
class RefreshRequestDto extends createZodDto(RefreshRequestSchema) {}
class SessionListDto extends createZodDto(SessionListSchema) {}
class LogoutResultDto extends createZodDto(LogoutResultSchema) {}
class LogoutAllResultDto extends createZodDto(LogoutAllResultSchema) {}
class ReturnTargetRequestDto extends createZodDto(ReturnTargetRequestSchema) {}
class ReturnTargetResultDto extends createZodDto(ReturnTargetResultSchema) {}

interface HttpReq {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  contractorId?: string;
  sessionId?: string;
}

interface HttpRes {
  setHeader(name: string, value: string | number): void;
  cookie(name: string, value: string, options: Record<string, unknown>): void;
  clearCookie(name: string, options: Record<string, unknown>): void;
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  // Explicit @Inject: the dev runner (tsx/esbuild) does not emit design:paramtypes metadata.
  constructor(
    @Inject(OtpService) private readonly otp: OtpService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private cookieOptions(): Record<string, unknown> {
    return { httpOnly: true, sameSite: "lax", secure: this.settings.production, path: "/" };
  }

  @Post("otp/request")
  @HttpCode(200)
  @ApiOperation({ operationId: "requestOtp" })
  @ApiBody({ type: OtpRequestDto })
  @ApiOkResponse({ type: OtpRequestResultDto })
  async request(
    @Body() body: OtpRequestDto,
    @Req() req: HttpReq,
    @Res({ passthrough: true }) res: HttpRes,
  ): Promise<OtpRequestResultDto> {
    try {
      return await this.otp.request(body, req.ip);
    } catch (e) {
      if (e instanceof OtpRateLimitedException) res.setHeader("Retry-After", e.retryAfterSeconds);
      throw e;
    }
  }

  @Post("otp/verify")
  @HttpCode(200)
  @ApiOperation({ operationId: "verifyOtp" })
  @ApiBody({ type: OtpVerifyDto })
  @ApiOkResponse({ type: AuthResultDto })
  async verify(
    @Body() body: OtpVerifyDto,
    @Res({ passthrough: true }) res: HttpRes,
    @Req() req: HttpReq = {},
  ): Promise<AuthResultDto> {
    const ua = req.headers?.["user-agent"];
    const device = req.headers?.["x-device-id"];
    const result = await this.otp.verify(body, new Date(), {
      ip: req.ip,
      userAgent: typeof ua === "string" ? ua.slice(0, 512) : undefined,
      deviceId: typeof device === "string" && device.length <= 128 ? device : undefined,
    });
    if (body.clientType === "WEB") {
      res.cookie(SESSION_COOKIE, this.sessions.cookieValue(result.sessionId), {
        ...this.cookieOptions(),
        maxAge: WEB_SESSION_DAYS * 86_400_000,
      });
      // Double-submit CSRF: the web client (customFetch) reads this cookie and echoes it in x-csrf-token.
      // Deliberately not httpOnly; it is derived from the session and useless without the session cookie.
      if (result.csrfToken) {
        res.cookie(CSRF_COOKIE, result.csrfToken, {
          ...this.cookieOptions(),
          httpOnly: false,
          maxAge: WEB_SESSION_DAYS * 86_400_000,
        });
      }
    }
    return result;
  }

  @Post("token/refresh")
  @HttpCode(200)
  @ApiOperation({ operationId: "refreshToken" })
  @ApiBody({ type: RefreshRequestDto })
  @ApiOkResponse({ type: AuthResultDto })
  refresh(@Body() body: RefreshRequestDto): Promise<AuthResultDto> {
    return this.sessions.refresh(body.refreshToken);
  }

  @Post("logout")
  @HttpCode(200)
  @ApiOperation({ operationId: "logout" })
  @ApiOkResponse({ type: LogoutResultDto })
  async logout(@Req() req: HttpReq, @Res({ passthrough: true }) res: HttpRes): Promise<LogoutResultDto> {
    if (!req.contractorId || !req.sessionId) throw new UnauthorizedException("Not signed in");
    await this.sessions.revoke(req.sessionId, req.contractorId);
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
    res.clearCookie(CSRF_COOKIE, { ...this.cookieOptions(), httpOnly: false });
    await this.audit.record({
      actorId: req.contractorId,
      entityType: "Contractor",
      entityId: req.contractorId,
      action: "SIGNED_OUT",
      after: { sessionId: req.sessionId },
    });
    return { ok: true };
  }

  @Post("logout-all")
  @HttpCode(200)
  @ApiOperation({ operationId: "logoutAll" })
  @ApiOkResponse({ type: LogoutAllResultDto })
  async logoutAll(@Req() req: HttpReq, @Res({ passthrough: true }) res: HttpRes): Promise<LogoutAllResultDto> {
    if (!req.contractorId) throw new UnauthorizedException("Not signed in");
    const revoked = await this.sessions.revokeAll(req.contractorId);
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
    res.clearCookie(CSRF_COOKIE, { ...this.cookieOptions(), httpOnly: false });
    await this.audit.record({
      actorId: req.contractorId,
      entityType: "Contractor",
      entityId: req.contractorId,
      action: "SIGNED_OUT_ALL",
      after: { revoked },
    });
    return { ok: true, revoked };
  }

  /** Signs an allow-listed target id so a sign-in can resume at a fixed in-site route. Grants nothing. */
  @Post("return-target")
  @HttpCode(200)
  @ApiOperation({ operationId: "createReturnTarget" })
  @ApiBody({ type: ReturnTargetRequestDto })
  @ApiOkResponse({ type: ReturnTargetResultDto })
  returnTarget(@Body() body: ReturnTargetRequestDto): ReturnTargetResultDto {
    return { token: this.sessions.signReturnToken(body.target) };
  }

  @Get("sessions")
  @ApiOperation({ operationId: "listSessions" })
  @ApiOkResponse({ type: SessionListDto })
  async list(@Req() req: HttpReq): Promise<SessionListDto> {
    if (!req.contractorId) throw new UnauthorizedException("Not signed in");
    return { items: await this.sessions.list(req.contractorId, req.sessionId) };
  }
}
