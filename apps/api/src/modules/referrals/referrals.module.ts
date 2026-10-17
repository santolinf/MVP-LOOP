import { Module } from "@nestjs/common";
import { AuditService } from "../../common/audit.service.js";
import { FoundingModule } from "../founding/founding.module.js";
import { ReferralsController } from "./referrals.controller.js";
import { ReferralsService } from "./referrals.service.js";

@Module({ imports: [FoundingModule], controllers: [ReferralsController], providers: [ReferralsService, AuditService] })
export class ReferralsModule {}
