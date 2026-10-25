import { Body, Controller, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  CvDownloadSchema,
  CvDraftSchema,
  CvPresignRequestSchema,
  CvPresignResponseSchema,
  CvUploadStatusSchema,
  EligibilityDeclarationRequestSchema,
  EligibilityDeclarationResultSchema,
} from "@loop/contracts";
import { CvService } from "./cv.service.js";
import { DraftService } from "./draft.service.js";
import { EligibilityService, type CvOwner } from "./eligibility.service.js";

class CvDraftDto extends createZodDto(CvDraftSchema) {}
class CvPresignRequestDto extends createZodDto(CvPresignRequestSchema) {}
class CvPresignResponseDto extends createZodDto(CvPresignResponseSchema) {}
class CvUploadStatusDto extends createZodDto(CvUploadStatusSchema) {}
class CvDownloadDto extends createZodDto(CvDownloadSchema) {}
class EligibilityRequestDto extends createZodDto(EligibilityDeclarationRequestSchema) {}
class EligibilityResultDto extends createZodDto(EligibilityDeclarationResultSchema) {}

interface HttpReq {
  ip?: string;
  contractorId?: string;
}

/**
 * Eligibility declaration and CV intake. Callers are either signed in (contractorId set by AuthGuard)
 * or hold an anonymous draft token sent in `x-draft-token`.
 */
@ApiTags("cv")
@Controller()
export class CvController {
  constructor(
    @Inject(CvService) private readonly cv: CvService,
    @Inject(DraftService) private readonly drafts: DraftService,
    @Inject(EligibilityService) private readonly eligibility: EligibilityService,
  ) {}

  @Post("cv/drafts")
  @HttpCode(200)
  @ApiOperation({ operationId: "createCvDraft", summary: "Start an anonymous upload draft" })
  @ApiOkResponse({ type: CvDraftDto })
  createDraft(@Req() req: HttpReq): Promise<CvDraftDto> {
    return this.drafts.create(req.ip);
  }

  @Post("eligibility")
  @HttpCode(200)
  @ApiOperation({ operationId: "recordEligibility", summary: "Record an immutable eligibility declaration" })
  @ApiBody({ type: EligibilityRequestDto })
  @ApiOkResponse({ type: EligibilityResultDto })
  async recordEligibility(
    @Body() body: EligibilityRequestDto,
    @Req() req: HttpReq,
    @Headers("x-draft-token") draftToken?: string,
  ): Promise<EligibilityResultDto> {
    return this.eligibility.record(await this.owner(req, draftToken), body, req.ip);
  }

  @Post("cv/uploads")
  @HttpCode(200)
  @ApiOperation({ operationId: "presignCvUpload", summary: "Get a presigned PUT URL into the quarantine area" })
  @ApiBody({ type: CvPresignRequestDto })
  @ApiOkResponse({ type: CvPresignResponseDto })
  async presign(
    @Body() body: CvPresignRequestDto,
    @Req() req: HttpReq,
    @Headers("x-draft-token") draftToken?: string,
  ): Promise<CvPresignResponseDto> {
    return this.cv.presign(await this.owner(req, draftToken), body, req.ip);
  }

  @Post("cv/uploads/:id/complete")
  @HttpCode(200)
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ operationId: "completeCvUpload", summary: "Verify, scan and promote an uploaded CV" })
  @ApiOkResponse({ type: CvUploadStatusDto })
  async complete(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: HttpReq,
    @Headers("x-draft-token") draftToken?: string,
  ): Promise<CvUploadStatusDto> {
    return this.cv.complete(await this.owner(req, draftToken), id);
  }

  @Get("cv/uploads/:id")
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ operationId: "getCvUpload", summary: "Upload processing status" })
  @ApiOkResponse({ type: CvUploadStatusDto })
  async status(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: HttpReq,
    @Headers("x-draft-token") draftToken?: string,
  ): Promise<CvUploadStatusDto> {
    return this.cv.status(await this.owner(req, draftToken), id);
  }

  @Get("cv/uploads/:id/download")
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ operationId: "downloadCvUpload", summary: "Short-lived presigned download URL" })
  @ApiOkResponse({ type: CvDownloadDto })
  async download(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: HttpReq,
    @Headers("x-draft-token") draftToken?: string,
  ): Promise<CvDownloadDto> {
    return this.cv.download(await this.owner(req, draftToken), id);
  }

  private async owner(req: HttpReq, draftToken: string | undefined): Promise<CvOwner> {
    if (req.contractorId) return { contractorId: req.contractorId };
    return { draftId: (await this.drafts.resolve(draftToken)).id };
  }
}
