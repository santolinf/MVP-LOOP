import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { ApiBody, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { AssignmentInputSchema, AssignmentListSchema, AssignmentSchema } from "@loop/contracts";
import { CurrentContractor } from "../me/current-contractor.js";
import { AssignmentsService } from "./assignments.service.js";

class AssignmentInputDto extends createZodDto(AssignmentInputSchema) {}
class AssignmentDto extends createZodDto(AssignmentSchema) {}
class AssignmentListDto extends createZodDto(AssignmentListSchema) {}

@ApiTags("me")
@Controller("me/assignments")
export class AssignmentsController {
  constructor(@Inject(AssignmentsService) private readonly assignments: AssignmentsService) {}

  @Get()
  @ApiOperation({ operationId: "listAssignments" })
  @ApiOkResponse({ type: AssignmentListDto })
  list(@CurrentContractor() id: string): Promise<AssignmentListDto> {
    return this.assignments.list(id);
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ operationId: "createAssignment" })
  @ApiBody({ type: AssignmentInputDto })
  @ApiOkResponse({ type: AssignmentDto })
  create(@CurrentContractor() id: string, @Body() body: AssignmentInputDto): Promise<AssignmentDto> {
    return this.assignments.create(id, body);
  }

  @Put(":assignmentId")
  @ApiParam({ name: "assignmentId", type: String })
  @ApiOperation({ operationId: "updateAssignment" })
  @ApiBody({ type: AssignmentInputDto })
  @ApiOkResponse({ type: AssignmentDto })
  update(
    @CurrentContractor() id: string,
    @Param("assignmentId", new ParseUUIDPipe()) assignmentId: string,
    @Body() body: AssignmentInputDto,
  ): Promise<AssignmentDto> {
    return this.assignments.update(id, assignmentId, body);
  }

  @Delete(":assignmentId")
  @HttpCode(204)
  @ApiParam({ name: "assignmentId", type: String })
  @ApiOperation({ operationId: "deleteAssignment" })
  @ApiNoContentResponse()
  remove(@CurrentContractor() id: string, @Param("assignmentId", new ParseUUIDPipe()) assignmentId: string): Promise<void> {
    return this.assignments.remove(id, assignmentId);
  }
}
