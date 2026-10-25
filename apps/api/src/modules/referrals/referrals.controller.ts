import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Put, Req } from "@nestjs/common";
import { ApiBody, ApiHeader, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  AttributeReferralRequestSchema,
  AttributeReferralResultSchema,
  ReferralCodeCheckSchema,
  IntroducerLookupRequestSchema,
  IntroducerLookupResultSchema,
  IntroducerSchema,
  ReferralLinkSchema,
  ReferralListSchema,
  SetIntroducerRequestSchema,
} from "@loop/contracts";
import { CurrentContractor } from "../me/current-contractor.js";
import { ReferralsService } from "./referrals.service.js";

class ReferralLinkDto extends createZodDto(ReferralLinkSchema) {}
class ReferralListDto extends createZodDto(ReferralListSchema) {}
class ReferralCodeCheckDto extends createZodDto(ReferralCodeCheckSchema) {}
class AttributeReferralRequestDto extends createZodDto(AttributeReferralRequestSchema) {}
class AttributeReferralResultDto extends createZodDto(AttributeReferralResultSchema) {}
class IntroducerDto extends createZodDto(IntroducerSchema) {}
class IntroducerLookupRequestDto extends createZodDto(IntroducerLookupRequestSchema) {}
class IntroducerLookupResultDto extends createZodDto(IntroducerLookupResultSchema) {}
class SetIntroducerRequestDto extends createZodDto(SetIntroducerRequestSchema) {}

const deviceOf = (v: string | string[] | undefined) => (typeof v === "string" && v.length <= 128 ? v : undefined);
const evidenceCtx = (req: { ip?: string; headers: Record<string, string | string[] | undefined> }) => ({
  deviceId: deviceOf(req.headers["x-device-id"]),
  ip: req.ip,
  userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"].slice(0, 512) : undefined,
});
interface HttpReq {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

@ApiTags("referrals")
@Controller("referrals")
export class ReferralsController {
  constructor(@Inject(ReferralsService) private readonly referrals: ReferralsService) {}

  @Get("link")
  @ApiOperation({ operationId: "getReferralLink" })
  @ApiOkResponse({ type: ReferralLinkDto })
  link(@CurrentContractor() id: string): Promise<ReferralLinkDto> {
    return this.referrals.link(id);
  }

  @Get()
  @ApiOperation({ operationId: "listReferrals" })
  @ApiOkResponse({ type: ReferralListDto })
  list(@CurrentContractor() id: string): Promise<ReferralListDto> {
    return this.referrals.list(id);
  }

  @Get("code/:code")
  @ApiOperation({ operationId: "checkReferralCode" })
  @ApiOkResponse({ type: ReferralCodeCheckDto })
  @ApiParam({ name: "code", type: String })
  check(@Param("code") code: string): Promise<ReferralCodeCheckDto> {
    return this.referrals.checkCode(code);
  }

  @Post("attribute")
  @HttpCode(200)
  @ApiOperation({ operationId: "attributeReferral" })
  @ApiBody({ type: AttributeReferralRequestDto })
  @ApiOkResponse({ type: AttributeReferralResultDto })
  @ApiHeader({ name: "Idempotency-Key", required: true })
  // TODO(spec): IdempotencyInterceptor is still a pass-through; attribution is idempotent by refereeId meanwhile.
  attribute(
    @CurrentContractor() id: string,
    @Body() body: AttributeReferralRequestDto,
    @Req() req: HttpReq,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- documented header, enforced by the interceptor
    @Headers("idempotency-key") _key: string,
  ): Promise<AttributeReferralResultDto> {
    return this.referrals.attribute(id, body.code, { source: "LINK", ...evidenceCtx(req) });
  }

  @Get("introducer")
  @ApiOperation({ operationId: "getIntroducer" })
  @ApiOkResponse({ type: IntroducerDto })
  introducer(@CurrentContractor() id: string): Promise<IntroducerDto> {
    return this.referrals.introducer(id);
  }

  @Post("introducer/lookup")
  @HttpCode(200)
  @ApiOperation({ operationId: "lookupIntroducer" })
  @ApiBody({ type: IntroducerLookupRequestDto })
  @ApiOkResponse({ type: IntroducerLookupResultDto })
  lookup(
    @CurrentContractor() id: string,
    @Body() body: IntroducerLookupRequestDto,
    @Req() req: HttpReq,
  ): Promise<IntroducerLookupResultDto> {
    return this.referrals.lookupMember(id, body.email, req.ip);
  }

  @Put("introducer")
  @ApiOperation({ operationId: "setIntroducer" })
  @ApiBody({ type: SetIntroducerRequestDto })
  @ApiOkResponse({ type: AttributeReferralResultDto })
  setIntroducer(
    @CurrentContractor() id: string,
    @Body() body: SetIntroducerRequestDto,
    @Req() req: HttpReq,
  ): Promise<AttributeReferralResultDto> {
    return this.referrals.setIntroducer(id, body.code, { source: body.source, ...evidenceCtx(req) });
  }
}
