import { Global, Module } from "@nestjs/common";
import { ReferralsModule } from "../referrals/referrals.module.js";
import { AuditService } from "../../common/audit.service.js";
import { loadEnv } from "../../config/index.js";
import { AuthController } from "./auth.controller.js";
import { EMAIL_SENDER, createEmailSender } from "./email-sender.js";
import { OtpService } from "./otp.service.js";
import { AUTH_SETTINGS, SessionService, type AuthSettings } from "./session.service.js";

/** Global so the app-wide AuthGuard can resolve SessionService. */
@Global()
@Module({
  imports: [ReferralsModule],
  controllers: [AuthController],
  providers: [
    {
      provide: AUTH_SETTINGS,
      useFactory: (): AuthSettings => {
        const env = loadEnv();
        return { sessionSecret: env.SESSION_SECRET, jwtSecret: env.JWT_SECRET, production: env.NODE_ENV === "production" };
      },
    },
    {
      provide: EMAIL_SENDER,
      useFactory: () => {
        const env = loadEnv();
        return createEmailSender({
          from: env.EMAIL_FROM,
          smtpHost: env.SMTP_HOST,
          smtpPort: env.SMTP_PORT,
          postmarkToken: env.POSTMARK_SERVER_TOKEN,
          production: env.NODE_ENV === "production",
        });
      },
    },
    SessionService,
    OtpService,
    AuditService,
  ],
  exports: [SessionService, AUTH_SETTINGS, EMAIL_SENDER],
})
export class AuthModule {}
