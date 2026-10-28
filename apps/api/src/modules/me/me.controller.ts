import { Body, Controller, Get, Headers, HttpCode, Inject, Post, Put, Req } from "@nestjs/common";
import { ApiBody, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  ConfirmAvailabilityRequestSchema,
  ConsentListSchema,
  GoLiveResultSchema,
  ManualProfileSchema,
  MeSchema,
  NameSchema,
  PreferencesSchema,
  ProfileDetailsSchema,
  ReviewSchema,
  UpdateNameRequestSchema,
  UpdateConsentsRequestSchema,
  UpdatePreferencesRequestSchema,
} from "@loop/contracts";
import { ConsentService } from "../consent/consent.service.js";
import { CurrentContractor } from "./current-contractor.js";
import { DetailsService } from "./details.service.js";
import { GoLiveService } from "./go-live.service.js";
import { ProfileService } from "./profile.service.js";
import { MeService } from "./me.service.js";
import { PreferencesService } from "./preferences.service.js";

class ConfirmAvailabilityDto extends createZodDto(ConfirmAvailabilityRequestSchema) {}
class MeDto extends createZodDto(MeSchema) {}
class PreferencesDto extends createZodDto(PreferencesSchema) {}
class UpdatePreferencesDto extends createZodDto(UpdatePreferencesRequestSchema) {}
class ConsentListDto extends createZodDto(ConsentListSchema) {}
class UpdateConsentsDto extends createZodDto(UpdateConsentsRequestSchema) {}
class ManualProfileDto extends createZodDto(ManualProfileSchema) {}
class ReviewDto extends createZodDto(ReviewSchema) {}
class ProfileDetailsDto extends createZodDto(ProfileDetailsSchema) {}
class UpdateNameDto extends createZodDto(UpdateNameRequestSchema) {}
class NameDto extends createZodDto(NameSchema) {}
class GoLiveResultDto extends createZodDto(GoLiveResultSchema) {}

@ApiTags("me")
@Controller("me")
export class MeController {
  // Explicit @Inject: the dev runner (tsx/esbuild) does not emit design:paramtypes metadata.
  constructor(
    @Inject(MeService) private readonly me: MeService,
    @Inject(PreferencesService) private readonly preferences: PreferencesService,
    @Inject(ConsentService) private readonly consents: ConsentService,
    @Inject(GoLiveService) private readonly goLive: GoLiveService,
    @Inject(ProfileService) private readonly profile: ProfileService,
    @Inject(DetailsService) private readonly details: DetailsService,
  ) {}

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

  @Get("preferences")
  @ApiOperation({ operationId: "getPreferences" })
  @ApiOkResponse({ type: PreferencesDto })
  getPreferences(@CurrentContractor() id: string): Promise<PreferencesDto> {
    return this.preferences.get(id);
  }

  /** Replaces the whole preference set; naturally idempotent, so no Idempotency-Key is required. */
  @Put("preferences")
  @ApiOperation({ operationId: "updatePreferences" })
  @ApiBody({ type: UpdatePreferencesDto })
  @ApiOkResponse({ type: PreferencesDto })
  updatePreferences(@CurrentContractor() id: string, @Body() body: UpdatePreferencesDto): Promise<PreferencesDto> {
    return this.preferences.replace(id, body);
  }

  @Get("consents")
  @ApiOperation({ operationId: "getConsents", summary: "Current consent choices with the wording to show" })
  @ApiOkResponse({ type: ConsentListDto })
  getConsents(@CurrentContractor() id: string): Promise<ConsentListDto> {
    return this.consents.list(id);
  }

  /** Grants and withdrawals are state-setting, so repeating a request is harmless and no Idempotency-Key is required. */
  @Put("consents")
  @ApiOperation({ operationId: "updateConsents", summary: "Grant or withdraw consents (nothing is ever granted by default)" })
  @ApiBody({ type: UpdateConsentsDto })
  @ApiOkResponse({ type: ConsentListDto })
  updateConsents(
    @CurrentContractor() id: string,
    @Body() body: UpdateConsentsDto,
    @Req() req: { ip?: string },
  ): Promise<ConsentListDto> {
    return this.consents.update(id, body, req.ip);
  }

  @Get("profile/manual")
  @ApiOperation({ operationId: "getManualProfile", summary: "Headline and skills the contractor typed themselves" })
  @ApiOkResponse({ type: ManualProfileDto })
  getManualProfile(@CurrentContractor() id: string): Promise<ManualProfileDto> {
    return this.profile.get(id);
  }

  /** Replaces the whole typed set; naturally idempotent, so no Idempotency-Key is required. */
  @Put("profile/manual")
  @ApiOperation({ operationId: "updateManualProfile" })
  @ApiBody({ type: ManualProfileDto })
  @ApiOkResponse({ type: ManualProfileDto })
  updateManualProfile(@CurrentContractor() id: string, @Body() body: ManualProfileDto): Promise<ManualProfileDto> {
    return this.profile.replace(id, body);
  }

  @Get("profile/details")
  @ApiOperation({ operationId: "getProfileDetails", summary: "Security clearance, IR35 status and work pattern" })
  @ApiOkResponse({ type: ProfileDetailsDto })
  getProfileDetails(@CurrentContractor() id: string): Promise<ProfileDetailsDto> {
    return this.details.get(id);
  }

  /** Replaces the whole set; naturally idempotent, so no Idempotency-Key is required. */
  @Put("profile/details")
  @ApiOperation({ operationId: "updateProfileDetails" })
  @ApiBody({ type: ProfileDetailsDto })
  @ApiOkResponse({ type: ProfileDetailsDto })
  updateProfileDetails(@CurrentContractor() id: string, @Body() body: ProfileDetailsDto): Promise<ProfileDetailsDto> {
    return this.details.replace(id, body);
  }

  @Put("name")
  @ApiOperation({ operationId: "updateName" })
  @ApiBody({ type: UpdateNameDto })
  @ApiOkResponse({ type: NameDto })
  updateName(@CurrentContractor() id: string, @Body() body: UpdateNameDto): Promise<NameDto> {
    return this.details.updateName(id, body);
  }

  @Get("review")
  @ApiOperation({ operationId: "getReview", summary: "Exactly what will be visible once LIVE, plus go-live readiness" })
  @ApiOkResponse({ type: ReviewDto })
  getReview(@CurrentContractor() id: string): Promise<ReviewDto> {
    return this.goLive.review(id);
  }

  /** Sets live only when the domain's go-live rule passes; repeating it once LIVE is a no-op. */
  @Post("go-live")
  @HttpCode(200)
  @ApiOperation({ operationId: "goLive", summary: "Go LIVE (422 with the blockers if requirements are not met)" })
  @ApiOkResponse({ type: GoLiveResultDto })
  postGoLive(@CurrentContractor() id: string): Promise<GoLiveResultDto> {
    return this.goLive.goLive(id);
  }
}
