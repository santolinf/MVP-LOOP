import { Body, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
// Explicit pipes: the dev runner (tsx/esbuild) emits no param types, so the global pipe cannot coerce query strings.
import { createZodDto, ZodValidationPipe } from "nestjs-zod";
import {
  AdminConfirmOnBehalfSchema,
  AdminCvLinkSchema,
  AdminPhotoLinkSchema,
  AdminContractorDetailSchema,
  AdminContractorListSchema,
  AdminContractorQuerySchema,
  AdminOkSchema,
  AdminQueueQuerySchema,
  AdminQueueSchema,
  AdminResolveCallTaskSchema,
  AdminSendMessageResultSchema,
  AdminSendMessageSchema,
  MeSchema,
} from "@loop/contracts";
import { AdminContractorsService } from "./admin-contractors.service.js";
import { ApiQueries, AuditAccess, CurrentStaff, PAGE_QUERY, RequirePermission, StaffController, type StaffPrincipal } from "./staff-access.js";

class AdminContractorQueryDto extends createZodDto(AdminContractorQuerySchema) {}
class AdminContractorListDto extends createZodDto(AdminContractorListSchema) {}
class AdminContractorDetailDto extends createZodDto(AdminContractorDetailSchema) {}
class AdminConfirmOnBehalfDto extends createZodDto(AdminConfirmOnBehalfSchema) {}
class AdminConfirmedMeDto extends createZodDto(MeSchema) {}
class AdminCvLinkDto extends createZodDto(AdminCvLinkSchema) {}
class AdminPhotoLinkDto extends createZodDto(AdminPhotoLinkSchema) {}
class AdminSendMessageDto extends createZodDto(AdminSendMessageSchema) {}
class AdminSendMessageResultDto extends createZodDto(AdminSendMessageResultSchema) {}
class AdminQueueQueryDto extends createZodDto(AdminQueueQuerySchema) {}
class AdminQueueDto extends createZodDto(AdminQueueSchema) {}
class AdminResolveCallTaskDto extends createZodDto(AdminResolveCallTaskSchema) {}
class AdminOkDto extends createZodDto(AdminOkSchema) {}

@ApiTags("admin-contractors")
@StaffController("contractors")
export class AdminContractorsController {
  constructor(@Inject(AdminContractorsService) private readonly svc: AdminContractorsService) {}

  @Get()
  @RequirePermission("contractors.read")
  @AuditAccess({ entityType: "Contractor", action: "contractors.listed" })
  @ApiOperation({ operationId: "adminListContractors" })
  @ApiQueries(
    { name: "q" },
    { name: "live", enum: ["true", "false"] },
    { name: "colour", enum: ["LIME", "ORANGE", "RED", "BLUE", "GREY"] },
    { name: "role" },
    { name: "skill" },
    { name: "location" },
    { name: "ir35", enum: ["INSIDE", "OUTSIDE", "EITHER", "UNSURE"] },
    ...PAGE_QUERY,
  )
  @ApiOkResponse({ type: AdminContractorListDto })
  list(@Query(new ZodValidationPipe(AdminContractorQuerySchema)) q: AdminContractorQueryDto): Promise<AdminContractorListDto> {
    return this.svc.list(q);
  }

  @Get(":id")
  @RequirePermission("contractors.read")
  @AuditAccess({ entityType: "Contractor", idParam: "id", action: "contractor.viewed" })
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ operationId: "adminGetContractor" })
  @ApiOkResponse({ type: AdminContractorDetailDto })
  detail(@Param("id", ParseUUIDPipe) id: string): Promise<AdminContractorDetailDto> {
    return this.svc.detail(id);
  }

  @Get(":id/cv")
  @RequirePermission("contractors.read")
  @AuditAccess({ entityType: "Contractor", idParam: "id", action: "contractor.cv_link_requested" })
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ operationId: "adminGetContractorCv", summary: "Short-lived link to the contractor's current CV" })
  @ApiOkResponse({ type: AdminCvLinkDto })
  cv(@Param("id", ParseUUIDPipe) id: string, @CurrentStaff() staff: StaffPrincipal): Promise<AdminCvLinkDto> {
    return this.svc.cvLink(id, staff);
  }

  @Get(":id/photo")
  @RequirePermission("contractors.read")
  @AuditAccess({ entityType: "Contractor", idParam: "id", action: "contractor.photo_viewed" })
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ operationId: "adminGetContractorPhoto" })
  @ApiOkResponse({ type: AdminPhotoLinkDto })
  photo(@Param("id", ParseUUIDPipe) id: string): Promise<AdminPhotoLinkDto> {
    return this.svc.photoLink(id);
  }

  @Post(":id/confirm")
  @HttpCode(200)
  @RequirePermission("availability.confirm")
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ operationId: "adminConfirmOnBehalf" })
  @ApiBody({ type: AdminConfirmOnBehalfDto })
  @ApiOkResponse({ type: AdminConfirmedMeDto })
  confirm(@Param("id", ParseUUIDPipe) id: string, @Body() body: AdminConfirmOnBehalfDto, @CurrentStaff() staff: StaffPrincipal): Promise<AdminConfirmedMeDto> {
    return this.svc.confirmOnBehalf(id, body, staff);
  }

  @Post(":id/messages")
  @HttpCode(200)
  @RequirePermission("comms.send_message")
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ operationId: "adminSendLoopMessage" })
  @ApiBody({ type: AdminSendMessageDto })
  @ApiOkResponse({ type: AdminSendMessageResultDto })
  send(@Param("id", ParseUUIDPipe) id: string, @Body() body: AdminSendMessageDto, @CurrentStaff() staff: StaffPrincipal): Promise<AdminSendMessageResultDto> {
    return this.svc.sendMessage(id, body, staff);
  }
}

@ApiTags("admin-availability")
@StaffController("availability")
export class AdminAvailabilityController {
  constructor(@Inject(AdminContractorsService) private readonly svc: AdminContractorsService) {}

  @Get("queue")
  @RequirePermission("availability.read")
  @AuditAccess({ entityType: "Contractor", action: "availability_queue.viewed" })
  @ApiOperation({ operationId: "adminAvailabilityQueue" })
  @ApiQueries({ name: "stage", enum: ["ALL", "UNCONFIRMED", "CALL_TASK", "SUPPRESSED"] }, ...PAGE_QUERY)
  @ApiOkResponse({ type: AdminQueueDto })
  queue(@Query(new ZodValidationPipe(AdminQueueQuerySchema)) q: AdminQueueQueryDto): Promise<AdminQueueDto> {
    return this.svc.queue(q);
  }

  @Post("call-tasks/:id/resolve")
  @HttpCode(200)
  @RequirePermission("availability.manage_tasks")
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ operationId: "adminResolveCallTask" })
  @ApiBody({ type: AdminResolveCallTaskDto })
  @ApiOkResponse({ type: AdminOkDto })
  resolve(@Param("id", ParseUUIDPipe) id: string, @Body() body: AdminResolveCallTaskDto, @CurrentStaff() staff: StaffPrincipal): Promise<AdminOkDto> {
    return this.svc.resolveCallTask(id, body, staff);
  }
}
