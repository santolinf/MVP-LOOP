import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { FoundingStatusSchema } from "@loop/contracts";
import { CurrentContractor } from "../me/current-contractor.js";
import { FoundingService } from "./founding.service.js";

class FoundingStatusDto extends createZodDto(FoundingStatusSchema) {}

@ApiTags("founding")
@Controller("founding")
export class FoundingController {
  constructor(@Inject(FoundingService) private readonly founding: FoundingService) {}

  @Get("status")
  @ApiOperation({ operationId: "getFoundingStatus" })
  @ApiOkResponse({ type: FoundingStatusDto })
  status(@CurrentContractor() id: string): Promise<FoundingStatusDto> {
    return this.founding.status(id);
  }
}
