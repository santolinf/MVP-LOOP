// Phase 6 consent rules (ADR 0006). Pure: no I/O.

export const CONSENT_PURPOSES = ["PROFILE_VISIBILITY", "OPERATIONAL_EMAIL", "LOOP_MARKETING", "PARTNER_MARKETING"] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

/** Purposes that must be granted before a profile can go LIVE. Marketing never blocks. */
export const CONSENTS_REQUIRED_FOR_LIVE: readonly ConsentPurpose[] = ["PROFILE_VISIBILITY", "OPERATIONAL_EMAIL"];

/**
 * Current wording per purpose. A grant records the version the contractor saw; changing the text means
 * bumping the version so earlier grants stay tied to the words they agreed to.
 * TODO(spec): wording is draft until Legal signs it off (Plan Q6). Partner marketing (Q13) is optional, default off,
 * and no partner sharing exists at launch.
 */
export const CONSENT_WORDING: Record<ConsentPurpose, { version: string; text: string; required: boolean }> = {
  PROFILE_VISIBILITY: {
    version: "v1-draft",
    required: true,
    text: "I agree that LOOP can show my profile and availability, as previewed on this page, to approved recruitment agencies and IT consultancies once I go LIVE.",
  },
  OPERATIONAL_EMAIL: {
    version: "v1-draft",
    required: true,
    text: "I agree that LOOP can email me reminders to confirm my availability and about how my LOOP profile is being used.",
  },
  LOOP_MARKETING: {
    version: "v1-draft",
    required: false,
    text: "I would like to receive news, tips and offers from LOOP by email. I can opt out at any time.",
  },
  PARTNER_MARKETING: {
    version: "v1-draft",
    required: false,
    text: "I would like to hear about relevant offers from LOOP's selected partners. LOOP will not share my details with partners without this consent.",
  },
};

/** One stored grant. A withdrawn grant keeps its row; a later re-grant is a new row. */
export interface ConsentGrant {
  purpose: ConsentPurpose;
  wordingVersion: string;
  grantedAt: Date;
  withdrawnAt: Date | null;
}

export function isConsentPurpose(value: string): value is ConsentPurpose {
  return (CONSENT_PURPOSES as readonly string[]).includes(value);
}

/** The purposes currently in force: the latest grant per purpose, if it has not been withdrawn. */
export function activeConsents(grants: readonly ConsentGrant[]): Set<ConsentPurpose> {
  const latest = new Map<ConsentPurpose, ConsentGrant>();
  for (const g of grants) {
    const seen = latest.get(g.purpose);
    if (!seen || g.grantedAt > seen.grantedAt) latest.set(g.purpose, g);
  }
  const active = new Set<ConsentPurpose>();
  for (const [purpose, g] of latest) if (g.withdrawnAt === null) active.add(purpose);
  return active;
}

export function missingRequiredConsents(active: ReadonlySet<ConsentPurpose>): ConsentPurpose[] {
  return CONSENTS_REQUIRED_FOR_LIVE.filter((p) => !active.has(p));
}

export type MessageCategory = "SERVICE" | "SECURITY" | "OPERATIONAL" | "MARKETING" | "PARTNER_MARKETING";

/**
 * Whether an email of this category may be sent. Service and security notices (sign-in codes, account
 * changes) are never switched off by a marketing choice; everything else needs its own consent.
 */
export function mayEmail(category: MessageCategory, active: ReadonlySet<ConsentPurpose>): boolean {
  switch (category) {
    case "SERVICE":
    case "SECURITY":
      return true;
    case "OPERATIONAL":
      return active.has("OPERATIONAL_EMAIL");
    case "MARKETING":
      return active.has("LOOP_MARKETING");
    case "PARTNER_MARKETING":
      return active.has("PARTNER_MARKETING");
  }
}
