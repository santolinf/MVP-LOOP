import { Injectable } from "@nestjs/common";
import { prisma } from "@loop/db";
import { FOUNDING_CAP, foundingPlacesLeft } from "@loop/domain";
import type { PublicConfig } from "@loop/contracts";

/** The counter is a cached aggregate: counts only, never names, and it must not hit the database per visitor. */
const CACHE_TTL_MS = 60_000;

@Injectable()
export class PublicConfigService {
  private cache: { at: number; value: PublicConfig } | null = null;

  async get(now = Date.now()): Promise<PublicConfig> {
    if (this.cache && now - this.cache.at < CACHE_TTL_MS) return this.cache.value;
    const value = await this.load();
    this.cache = { at: now, value };
    return value;
  }

  private async load(): Promise<PublicConfig> {
    const [flags, counter] = await Promise.all([
      prisma.featureFlag.findMany(),
      prisma.foundingCounter.findUnique({ where: { id: 1 } }),
    ]);
    const on = (key: string) => flags.find((f) => f.key === key)?.enabled ?? false;
    return {
      flags: { payoutsLive: on("payouts.live"), agencyAccess: on("agency.access"), profitShare: on("profit_sharing.live") },
      founding: {
        cap: counter?.cap ?? FOUNDING_CAP,
        claimed: counter?.allocated ?? 0,
        placesLeft: foundingPlacesLeft(counter?.allocated ?? 0, counter?.cap ?? FOUNDING_CAP),
      },
    };
  }
}
