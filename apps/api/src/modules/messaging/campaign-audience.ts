import { prisma, type Prisma } from "@loop/db";
import { skipReason, type CampaignKind, type ConsentPurpose, type SkipReason } from "@loop/domain";
import type { z } from "zod";
import type { AdminAudienceSchema } from "@loop/contracts";
import { hashKey } from "../../common/rate-limit.js";
import type { ConsentService } from "../consent/consent.service.js";

export type Audience = z.infer<typeof AdminAudienceSchema>;

export interface Evaluated {
  contractorId: string;
  firstName: string | null;
  skip: SkipReason | null;
}

const BATCH = 500;

/** Contractors the audience selects, before the consent filter. Erased or erasing accounts are never matched. */
function where(a: Audience): Prisma.ContractorWhereInput {
  const open: Prisma.ContractorWhereInput = { erasedAt: null, erasureRequestedAt: null };
  if (a.kind === "TARGETED") return { ...open, id: { in: a.contractorIds } };
  return {
    ...open,
    ...(a.liveOnly ? { live: true } : {}),
    ...(a.situations.length > 0 ? { employmentSituation: { in: a.situations } } : {}),
    ...(a.colours.length > 0 ? { searchColour: { in: a.colours } } : {}),
  };
}

/**
 * Resolves an audience and applies the consent filter, server-side. Pure reads: it stores nothing and returns
 * no addresses. The same filter runs again at send time (see CampaignSendService).
 */
export async function evaluateAudience(a: Audience, consents: Pick<ConsentService, "activeForMany">): Promise<Evaluated[]> {
  const out: Evaluated[] = [];
  const kind: CampaignKind = a.kind;
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.contractor.findMany({
      where: where(a),
      select: { id: true, firstName: true, email: true },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;
    const [active, suppressed] = await Promise.all([
      consents.activeForMany(rows.map((r) => r.id)),
      prisma.emailSuppression.findMany({
        where: { emailHash: { in: rows.flatMap((r) => (r.email ? [hashKey(r.email.toLowerCase())] : [])) } },
        select: { emailHash: true },
      }),
    ]);
    const blocked = new Set(suppressed.map((s) => s.emailHash));
    for (const r of rows) {
      out.push({
        contractorId: r.id,
        firstName: r.firstName,
        skip: skipReason({
          kind,
          erased: false,
          hasEmail: !!r.email,
          consents: active.get(r.id) ?? new Set<ConsentPurpose>(),
          emailSuppressed: !!r.email && blocked.has(hashKey(r.email.toLowerCase())),
        }),
      });
    }
    cursor = rows[rows.length - 1]?.id;
    if (rows.length < BATCH) break;
  }
  return out;
}
