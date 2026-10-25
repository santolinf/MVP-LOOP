import { Module } from "@nestjs/common";
import { AuditService } from "../../common/audit.service.js";
import { ConsentService } from "./consent.service.js";

@Module({ providers: [ConsentService, AuditService], exports: [ConsentService] })
export class ConsentModule {}
