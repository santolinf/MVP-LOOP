import { Module } from "@nestjs/common";
import { AuditService } from "../../common/audit.service.js";
import { AssignmentsController } from "./assignments.controller.js";
import { AssignmentsService } from "./assignments.service.js";

@Module({
  controllers: [AssignmentsController],
  providers: [AssignmentsService, AuditService],
})
export class AssignmentsModule {}
