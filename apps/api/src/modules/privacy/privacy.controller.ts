import { Body, Controller, Get, HttpCode, Inject, Post, Req } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { DataExportSchema, DeleteAccountRequestSchema, PrivacyResultSchema } from "@loop/contracts";
import { CurrentContractor } from "../me/current-contractor.js";
import { PrivacyService } from "./privacy.service.js";

class PrivacyResultDto extends createZodDto(PrivacyResultSchema) {}
class DataExportDto extends createZodDto(DataExportSchema) {}
class DeleteAccountDto extends createZodDto(DeleteAccountRequestSchema) {}

/** State-setting actions, so repeating a request is harmless and no Idempotency-Key is required. */
@ApiTags("me")
@Controller("me")
export class PrivacyController {
  constructor(@Inject(PrivacyService) private readonly privacy: PrivacyService) {}

  @Post("pause")
  @HttpCode(200)
  @ApiOperation({ operationId: "pauseProfile", summary: "Hide your profile from search without leaving LIVE" })
  @ApiOkResponse({ type: PrivacyResultDto })
  pause(@CurrentContractor() id: string): Promise<PrivacyResultDto> {
    return this.privacy.setPaused(id, true);
  }

  @Post("unpause")
  @HttpCode(200)
  @ApiOperation({ operationId: "unpauseProfile" })
  @ApiOkResponse({ type: PrivacyResultDto })
  unpause(@CurrentContractor() id: string): Promise<PrivacyResultDto> {
    return this.privacy.setPaused(id, false);
  }

  @Post("withdraw")
  @HttpCode(200)
  @ApiOperation({ operationId: "withdrawProfile", summary: "Take your profile off LIVE and withdraw visibility consent; your data is kept" })
  @ApiOkResponse({ type: PrivacyResultDto })
  withdraw(@CurrentContractor() id: string, @Req() req: { ip?: string }): Promise<PrivacyResultDto> {
    return this.privacy.withdraw(id, req.ip);
  }

  @Get("export")
  @ApiOperation({ operationId: "exportMyData" })
  @ApiOkResponse({ type: DataExportDto })
  export(@CurrentContractor() id: string): Promise<DataExportDto> {
    return this.privacy.export(id);
  }

  @Post("delete-account")
  @HttpCode(202)
  @ApiOperation({ operationId: "deleteMyAccount", summary: "Sign out everywhere and queue permanent erasure of your account" })
  @ApiBody({ type: DeleteAccountDto })
  @ApiOkResponse({ type: PrivacyResultDto })
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the body only forces an explicit confirm:true
  deleteAccount(@CurrentContractor() id: string, @Body() _body: DeleteAccountDto): Promise<PrivacyResultDto> {
    return this.privacy.requestErasure(id);
  }
}
