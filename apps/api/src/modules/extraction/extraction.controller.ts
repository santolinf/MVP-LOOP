import { Body, Controller, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { ConfirmExtractedFieldRequestSchema, ExtractedFieldSchema, ExtractionReviewSchema } from "@loop/contracts";
import { DraftService } from "../cv/draft.service.js";
import type { CvOwner } from "../cv/eligibility.service.js";
import { ExtractionService } from "./extraction.service.js";

class ExtractionReviewDto extends createZodDto(ExtractionReviewSchema) {}
class ExtractedFieldDto extends createZodDto(ExtractedFieldSchema) {}
class ConfirmExtractedFieldRequestDto extends createZodDto(ConfirmExtractedFieldRequestSchema) {}

interface HttpReq {
  ip?: string;
  contractorId?: string;
}

/** A4/A5: AI suggestions are reviewed per field; nothing becomes profile data until the contractor confirms it. */
@ApiTags("cv")
@Controller()
export class ExtractionController {
  constructor(
    @Inject(ExtractionService) private readonly extraction: ExtractionService,
    @Inject(DraftService) private readonly drafts: DraftService,
  ) {}

  private async owner(req: HttpReq, draftToken?: string): Promise<CvOwner> {
    if (req.contractorId) return { contractorId: req.contractorId };
    return { draftId: (await this.drafts.resolve(draftToken)).id };
  }

  @Get("cv/uploads/:id/extraction")
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ operationId: "getExtractionReview", summary: "AI profile suggestions for an uploaded CV" })
  @ApiOkResponse({ type: ExtractionReviewDto })
  async review(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: HttpReq,
    @Headers("x-draft-token") draftToken?: string,
  ) {
    return this.extraction.getReview(await this.owner(req, draftToken), id);
  }

  @Post("cv/uploads/:id/extraction/fields/:fieldId/confirm")
  @HttpCode(200)
  @ApiParam({ name: "id", type: String })
  @ApiParam({ name: "fieldId", type: String })
  @ApiBody({ type: ConfirmExtractedFieldRequestDto })
  @ApiOperation({ operationId: "confirmExtractedField", summary: "Confirm or edit one suggested profile field" })
  @ApiOkResponse({ type: ExtractedFieldDto })
  async confirm(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("fieldId") fieldId: string,
    @Body() body: ConfirmExtractedFieldRequestDto,
    @Req() req: HttpReq,
    @Headers("x-draft-token") draftToken?: string,
  ) {
    return this.extraction.confirmField(await this.owner(req, draftToken), id, fieldId, body.value);
  }
}
