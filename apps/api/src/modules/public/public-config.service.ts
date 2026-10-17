import { Injectable } from "@nestjs/common";
import { prisma } from "@loop/db";
import { FOUNDING_CAP } from "@loop/domain";
import type { PublicConfig } from "@loop/contracts";

@Injectable()
export class PublicConfigService {
  async get(): Promise<PublicConfig> {
    const [flags, counter] = await Promise.all([
      prisma.featureFlag.findMany(),
      prisma.foundingCounter.findUnique({ where: { id: 1 } }),
    ]);
    const on = (key: string) => flags.find((f) => f.key === key)?.enabled ?? false;
    return {
      flags: { payoutsLive: on("payouts.live"), agencyAccess: on("agency.access"), profitShare: on("profit_sharing.live") },
      founding: { cap: counter?.cap ?? FOUNDING_CAP, claimed: counter?.allocated ?? 0 },
    };
  }
}
