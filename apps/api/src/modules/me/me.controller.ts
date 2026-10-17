import { Body, Controller, Get, Headers, HttpCode, Inject, Post } from "@nestjs/common";
import { ApiBody, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { ConfirmAvailabilityRequestSchema, MeSchema } from "@loop/contracts";
import { CurrentContractor } from "./current-contractor.js";
import { MeService } from "./me.service.js";

class ConfirmAvailabilityDto extends createZodDto(ConfirmAvailabilityRequestSchema) {}
class MeDto extends createZodDto(MeSchema) {}

@ApiTags("me")
@Controller("me")
export class MeController {
  // Explicit @Inject: the dev runner (tsx/esbuild) does not emit design:paramtypes metadata.
  constructor(@Inject(MeService) private readonly me: MeService) {}

  @Get()
  @ApiOperation({ operationId: "getMe" })
  @ApiOkResponse({ type: MeDto })
  get(@CurrentContractor() id: string): Promise<MeDto> {
    return this.me.get(id);
  }

  @Post("availability/confirm")
  @HttpCode(200)
  @ApiOperation({ operationId: "confirmAvailability" })
  @ApiBody({ type: ConfirmAvailabilityDto })
  @ApiOkResponse({ type: MeDto })
  @ApiHeader({ name: "Idempotency-Key", required: true })
  // TODO(spec): IdempotencyInterceptor is still a pass-through; replay protection lands with it.
  confirm(
    @CurrentContractor() id: string,
    @Body() body: ConfirmAvailabilityDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- documented header, enforced by the interceptor
    @Headers("idempotency-key") _key: string,
  ): Promise<MeDto> {
    return this.me.confirmAvailability(id, body);
  }
}
