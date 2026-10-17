import { Module } from "@nestjs/common";
import { AuditService } from "../../common/audit.service.js";
import { MeController } from "./me.controller.js";
import { MeService } from "./me.service.js";

@Module({ controllers: [MeController], providers: [MeService, AuditService] })
export class MeModule {}
