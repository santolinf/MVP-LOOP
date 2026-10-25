import { Module } from "@nestjs/common";
import { AuditService } from "../../common/audit.service.js";
import { ConsentModule } from "../consent/consent.module.js";
import { ReferralsModule } from "../referrals/referrals.module.js";
import { MessagingModule } from "../messaging/messaging.module.js";
import { ConfirmLinkController } from "./confirm-link.controller.js";
import { DetailsService } from "./details.service.js";
import { GoLiveService } from "./go-live.service.js";
import { ProfileService } from "./profile.service.js";
import { MeController } from "./me.controller.js";
import { MeService } from "./me.service.js";
import { PreferencesService } from "./preferences.service.js";

@Module({
  imports: [ConsentModule, MessagingModule, ReferralsModule],
  controllers: [MeController, ConfirmLinkController],
  providers: [MeService, PreferencesService, GoLiveService, ProfileService, DetailsService, AuditService],
  exports: [MeService],
})
export class MeModule {}
