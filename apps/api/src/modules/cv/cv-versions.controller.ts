import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { CvChangeListSchema, CvVersionListSchema, PrivacyResultSchema, ResolveCvChangeRequestSchema } from "@loop/contracts";
import { CurrentContractor } from "../me/current-contractor.js";
import { CvVersionsService } from "./cv-versions.service.js";

class CvVersionListDto extends createZodDto(CvVersionListSchema) {}
class CvChangeListDto extends createZodDto(CvChangeListSchema) {}
class ResolveCvChangeDto extends createZodDto(ResolveCvChangeRequestSchema) {}
class PrivacyResultDto extends createZodDto(PrivacyResultSchema) {}

/** Replacing a CV uses the normal upload endpoints; the new file becomes the next version automatically. */
@ApiTags("me")
@Controller("me/cv")
export class CvVersionsController {
  constructor(@Inject(CvVersionsService) private readonly versions: CvVersionsService) {}

  @Get("versions")
  @ApiOperation({ operationId: "listCvVersions" })
  @ApiOkResponse({ type: CvVersionListDto })
  list(@CurrentContractor() id: string): Promise<CvVersionListDto> {
    return this.versions.versions(id);
  }

  @Get("changes")
  @ApiOperation({ operationId: "listCvChanges", summary: "Differences between a newer CV and your confirmed profile, awaiting your review" })
  @ApiOkResponse({ type: CvChangeListDto })
  changes(@CurrentContractor() id: string): Promise<CvChangeListDto> {
    return this.versions.pendingChanges(id);
  }

  @Post("changes/:changeId/resolve")
  @HttpCode(200)
  @ApiParam({ name: "changeId", type: String })
  @ApiBody({ type: ResolveCvChangeDto })
  @ApiOperation({ operationId: "resolveCvChange", summary: "Accept or reject one change; nothing applies until accepted" })
  @ApiOkResponse({ type: CvChangeListDto })
  resolve(
    @CurrentContractor() id: string,
    @Param("changeId", new ParseUUIDPipe()) changeId: string,
    @Body() body: ResolveCvChangeDto,
  ): Promise<CvChangeListDto> {
    return this.versions.resolve(id, changeId, body);
  }

  @Delete()
  @ApiOperation({ operationId: "deleteMyCv", summary: "Delete every CV file, version and suggestion" })
  @ApiOkResponse({ type: PrivacyResultDto })
  async remove(@CurrentContractor() id: string): Promise<PrivacyResultDto> {
    await this.versions.deleteAll(id);
    return { status: "CV_DELETED" };
  }
}
