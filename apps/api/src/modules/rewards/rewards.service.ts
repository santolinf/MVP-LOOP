import { Injectable } from "@nestjs/common";
import { prisma } from "@loop/db";
import type { RewardList } from "@loop/contracts";

/** Read-only ledger. Creation and approval stay behind payouts.live / agency verification (B7). */
@Injectable()
export class RewardsService {
  async list(beneficiaryId: string): Promise<RewardList> {
    const rows = await prisma.reward.findMany({ where: { beneficiaryId }, orderBy: { createdAt: "desc" } });
    return {
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        status: r.status,
        amountPence: r.amountPence,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}
