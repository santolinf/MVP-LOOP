import { Module } from "@nestjs/common";
import { AuditService } from "../../common/audit.service.js";
import { REMINDER_REFRESH } from "../../common/reminder-refresh.js";
import { loadEnv } from "../../config/index.js";
import { EMAIL_SENDER, type EmailSender } from "../auth/email-sender.js";
import { ConsentModule } from "../consent/consent.module.js";
import { EmailChannelAdapter, MESSAGE_CHANNELS } from "./channel.js";
import { CampaignSendService } from "./campaign-send.service.js";
import { ConfirmLinkService, MESSAGING_SETTINGS, type MessagingSettings } from "./confirm-link.service.js";
import { DeliveryService } from "./delivery.service.js";
import { InboxController } from "./inbox.controller.js";
import { InboxService } from "./inbox.service.js";
import { RemindersService } from "./reminders.service.js";
import { WebhookController } from "./webhook.controller.js";
import { WebhookService } from "./webhook.service.js";

@Module({
  imports: [ConsentModule],
  controllers: [InboxController, WebhookController],
  providers: [
    {
      provide: MESSAGING_SETTINGS,
      useFactory: (): MessagingSettings => {
        const env = loadEnv();
        return { baseUrl: env.APP_BASE_URL, confirmLinkTtlHours: env.CONFIRM_LINK_TTL_HOURS };
      },
    },
    // EMAIL_SENDER comes from the global AuthModule. A push adapter is added to this list with the app.
    { provide: MESSAGE_CHANNELS, inject: [EMAIL_SENDER], useFactory: (sender: EmailSender) => [new EmailChannelAdapter(sender)] },
    { provide: REMINDER_REFRESH, useExisting: RemindersService },
    AuditService,
    CampaignSendService,
    ConfirmLinkService,
    DeliveryService,
    InboxService,
    RemindersService,
    WebhookService,
  ],
  exports: [CampaignSendService, ConfirmLinkService, InboxService, RemindersService, REMINDER_REFRESH],
})
export class MessagingModule {}
