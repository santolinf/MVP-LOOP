import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { ApiBody, ApiHeader, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  AttributeReferralRequestSchema,
  AttributeReferralResultSchema,
  ReferralCodeCheckSchema,
  ReferralLinkSchema,
  ReferralListSchema,
} from "@loop/contracts";
import { CurrentContractor } from "../me/current-contractor.js";
import { ReferralsService } from "./referrals.service.js";

class ReferralLinkDto extends createZodDto(ReferralLinkSchema) {}
class ReferralListDto extends createZodDto(ReferralListSchema) {}
class ReferralCodeCheckDto extends createZodDto(ReferralCodeCheckSchema) {}
class AttributeReferralRequestDto extends createZodDto(AttributeReferralRequestSchema) {}
class AttributeReferralResultDto extends createZodDto(AttributeReferralResultSchema) {}

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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- documented header, enforced by the interceptor
    @Headers("idempotency-key") _key: string,
  ): Promise<AttributeReferralResultDto> {
    return this.referrals.attribute(id, body.code);
  }
}
