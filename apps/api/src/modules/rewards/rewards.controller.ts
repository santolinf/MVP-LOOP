import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { RewardListSchema } from "@loop/contracts";
import { CurrentContractor } from "../me/current-contractor.js";
import { RewardsService } from "./rewards.service.js";

class RewardListDto extends createZodDto(RewardListSchema) {}

@ApiTags("rewards")
@Controller("rewards")
export class RewardsController {
  constructor(@Inject(RewardsService) private readonly rewards: RewardsService) {}

  @Get()
  @ApiOperation({ operationId: "listRewards" })
  @ApiOkResponse({ type: RewardListDto })
  list(@CurrentContractor() id: string): Promise<RewardListDto> {
    return this.rewards.list(id);
  }
}
