import { Module } from "@nestjs/common";
import { AuditService } from "../../common/audit.service.js";
import { FoundingController } from "./founding.controller.js";
import { FoundingService } from "./founding.service.js";

@Module({ controllers: [FoundingController], providers: [FoundingService, AuditService], exports: [FoundingService] })
export class FoundingModule {}
