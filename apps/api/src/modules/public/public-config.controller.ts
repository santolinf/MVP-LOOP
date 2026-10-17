import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { PublicConfigSchema } from "@loop/contracts";
import { PublicConfigService } from "./public-config.service.js";

class PublicConfigDto extends createZodDto(PublicConfigSchema) {}

@ApiTags("public")
@Controller("public")
export class PublicConfigController {
  constructor(@Inject(PublicConfigService) private readonly config: PublicConfigService) {}

  @Get("config")
  @ApiOperation({ operationId: "getPublicConfig" })
  @ApiOkResponse({ type: PublicConfigDto })
  get(): Promise<PublicConfigDto> {
    return this.config.get();
  }
}
