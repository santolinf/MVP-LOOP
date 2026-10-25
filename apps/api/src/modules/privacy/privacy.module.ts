import { Module } from "@nestjs/common";
import { AuditService } from "../../common/audit.service.js";
import { ConsentModule } from "../consent/consent.module.js";
import { PrivacyController } from "./privacy.controller.js";
import { PrivacyService } from "./privacy.service.js";

@Module({
  imports: [ConsentModule],
  controllers: [PrivacyController],
  providers: [PrivacyService, AuditService],
})
export class PrivacyModule {}
