import { Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { londonDate } from "@loop/domain";
import { prisma } from "@loop/db";
import { RedeemConfirmLinkRequestSchema, RedeemConfirmLinkResultSchema, type RedeemConfirmLinkResult } from "@loop/contracts";
import { ConfirmLinkService } from "../messaging/confirm-link.service.js";
import { InboxService } from "../messaging/inbox.service.js";
import { MeService } from "./me.service.js";

class RedeemConfirmLinkDto extends createZodDto(RedeemConfirmLinkRequestSchema) {}
class RedeemConfirmLinkResultDto extends createZodDto(RedeemConfirmLinkResultSchema) {}

const SIGN_IN: Omit<RedeemConfirmLinkResult, "reason"> = { outcome: "SIGN_IN_REQUIRED", returnTarget: "AVAILABILITY" };

/**
 * Redeems a one-touch "still the same" email link. The token is the only credential, so this is public (and exempt from
 * the CSRF check). It can confirm the facts the contractor already has on file and nothing else; every other outcome
 * sends them through sign-in to the availability page.
 */
@ApiTags("confirm-links")
@Controller("confirm-links")
export class ConfirmLinkController {
  // Explicit @Inject: the dev runner (tsx/esbuild) does not emit design:paramtypes metadata.
  constructor(
    @Inject(ConfirmLinkService) private readonly links: ConfirmLinkService,
    @Inject(MeService) private readonly me: MeService,
    @Inject(InboxService) private readonly inbox: InboxService,
  ) {}

  @Post("redeem")
  @HttpCode(200)
  @ApiOperation({ operationId: "redeemConfirmLink", summary: "Confirm availability is unchanged from an emailed link" })
  @ApiOkResponse({ type: RedeemConfirmLinkResultDto })
  async redeem(@Body() body: RedeemConfirmLinkDto, now = new Date()): Promise<RedeemConfirmLinkResultDto> {
    const claim = await this.links.claim(body.token, now);
    if (!claim.ok) return { ...SIGN_IN, reason: claim.reason };

    try {
      const c = await prisma.contractor.findUnique({ where: { id: claim.contractorId } });
      if (!c?.employmentSituation) throw new Error("contractor no longer confirmable");
      // A start date that has already passed means "available now" and cannot be re-submitted as a past date.
      const from = c.availableFrom && londonDate(c.availableFrom) >= londonDate(now) ? londonDate(c.availableFrom) : null;
      await this.me.confirmAvailability(
        c.id,
        { employment: c.employmentSituation, availableFrom: from, contractEndDate: c.contractEndDate ? londonDate(c.contractEndDate) : null },
        now,
        "EMAIL_LINK",
      );
    } catch {
      await this.links.release(body.token);
      return { ...SIGN_IN, reason: "FACTS_CHANGED" };
    }
    await this.inbox.notify(claim.contractorId, "CONFIRMATION", "Availability confirmed", "You confirmed your availability from an email link.", "MY_LOOP");
    return { outcome: "CONFIRMED", reason: null, returnTarget: null };
  }
}
