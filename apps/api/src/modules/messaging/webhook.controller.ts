import { createHash, timingSafeEqual } from "node:crypto";
import { BadRequestException, Body, Controller, Headers, HttpCode, Inject, Post, UnauthorizedException } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { loadEnv } from "../../config/index.js";
import { PostmarkEventSchema, WebhookService } from "./webhook.service.js";

const digest = (v: string) => createHash("sha256").update(v).digest();

/** True when the HTTP Basic password equals the shared secret. Both sides are hashed so lengths never leak. */
export function basicPasswordMatches(authorization: string | undefined, secret: string | undefined): boolean {
  if (!secret || !authorization?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
  const password = decoded.slice(decoded.indexOf(":") + 1);
  return timingSafeEqual(digest(password), digest(secret));
}

/**
 * Provider callbacks. Postmark signs nothing, so the endpoint is protected the way Postmark supports: a secret in the
 * webhook URL's Basic-auth credentials, compared in constant time. No secret configured means every call is refused.
 */
@ApiExcludeController()
@Controller("webhooks")
export class WebhookController {
  // Explicit @Inject: the dev runner (tsx/esbuild) does not emit design:paramtypes metadata.
  constructor(@Inject(WebhookService) private readonly webhooks: WebhookService) {}

  @Post("postmark")
  @HttpCode(200)
  async postmark(@Headers("authorization") authorization: string | undefined, @Body() body: unknown): Promise<{ status: string }> {
    if (!basicPasswordMatches(authorization, loadEnv().POSTMARK_WEBHOOK_SECRET)) throw new UnauthorizedException("Invalid webhook credentials");
    const parsed = PostmarkEventSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Unrecognised webhook payload");
    return { status: await this.webhooks.handlePostmark(parsed.data) };
  }
}
