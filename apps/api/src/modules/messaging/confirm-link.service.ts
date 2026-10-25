import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { prisma } from "@loop/db";
import { checkConfirmLink, factsFingerprint, type LinkCheck, type LinkFacts } from "@loop/domain";
import { hashKey } from "../../common/rate-limit.js";

export const MESSAGING_SETTINGS = Symbol("MESSAGING_SETTINGS");

export interface MessagingSettings {
  /** Public site origin used for links in emails. */
  baseUrl: string;
  confirmLinkTtlHours: number;
}

export const CONFIRM_ACTION = "AVAILABILITY_STILL_SAME";

export type ClaimResult =
  | { ok: true; contractorId: string }
  | { ok: false; reason: "INVALID" | Exclude<LinkCheck, "OK"> };

export function factsOf(c: { employmentSituation: string | null; availableFrom: Date | null; contractEndDate: Date | null }): LinkFacts | null {
  return c.employmentSituation ? { employment: c.employmentSituation, availableFrom: c.availableFrom, contractEndDate: c.contractEndDate } : null;
}

/**
 * One-touch "still the same" links (Phase 8). Each link is single-purpose, bound to one contractor and to the exact
 * facts they were asked to confirm, expires, and is stored only as a SHA-256 hash. Redeeming it can confirm and nothing
 * else: it reveals no data and changes nothing but the confirmation.
 */
@Injectable()
export class ConfirmLinkService {
  // Explicit @Inject: the dev runner (tsx/esbuild) does not emit design:paramtypes metadata.
  constructor(@Inject(MESSAGING_SETTINGS) private readonly settings: MessagingSettings) {}

  /** Returns the URL to put in the email. The raw token exists only here and in that email. */
  async issue(contractorId: string, reminderId: string | null, facts: LinkFacts, now: Date): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    await prisma.confirmLink.create({
      data: {
        contractorId,
        reminderId,
        action: CONFIRM_ACTION,
        tokenHash: hashKey(token),
        fingerprint: factsFingerprint(facts),
        expiresAt: new Date(now.getTime() + this.settings.confirmLinkTtlHours * 3_600_000),
      },
    });
    return `${this.settings.baseUrl.replace(/\/$/, "")}/confirm?t=${token}`;
  }

  /**
   * Validates the token against the contractor's current facts and, only if everything holds, marks it used. The
   * single conditional update means two clicks (or a mail scanner racing the person) cannot both succeed.
   */
  async claim(token: string, now = new Date()): Promise<ClaimResult> {
    const link = await prisma.confirmLink.findUnique({ where: { tokenHash: hashKey(token) } });
    if (!link || link.action !== CONFIRM_ACTION) return { ok: false, reason: "INVALID" };
    const contractor = await prisma.contractor.findUnique({ where: { id: link.contractorId } });
    const facts = contractor && !contractor.erasedAt ? factsOf(contractor) : null;
    if (!contractor || !facts) return { ok: false, reason: "INVALID" };

    const check = checkConfirmLink(link, facts, now);
    if (check !== "OK") return { ok: false, reason: check };

    const claimed = await prisma.confirmLink.updateMany({ where: { id: link.id, usedAt: null }, data: { usedAt: now } });
    if (claimed.count !== 1) return { ok: false, reason: "USED" };
    return { ok: true, contractorId: contractor.id };
  }

  /** Puts a claimed link back when the confirmation that followed it failed, so the person can try again. */
  async release(token: string): Promise<void> {
    await prisma.confirmLink.updateMany({ where: { tokenHash: hashKey(token) }, data: { usedAt: null } });
  }
}
