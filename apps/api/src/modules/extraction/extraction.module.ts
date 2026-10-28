import { Module } from "@nestjs/common";
import { AuditService } from "../../common/audit.service.js";
import { ExtractionController } from "./extraction.controller.js";
import { ExtractionService } from "./extraction.service.js";

@Module({
  controllers: [ExtractionController],
  providers: [ExtractionService, AuditService],
})
export class ExtractionModule {}
