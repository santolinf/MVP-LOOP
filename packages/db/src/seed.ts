import { prisma } from "./client.js";

// payouts.live, agency.access and profit_sharing stay disabled in every seed.
const FLAGS = ["payouts.live", "agency.access", "profit_sharing.live"];

async function main() {
  for (const key of FLAGS) {
    await prisma.featureFlag.upsert({ where: { key }, update: {}, create: { key, enabled: false } });
  }
  await prisma.foundingCounter.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  await prisma.contractor.upsert({
    where: { phone: "+447700900001" },
    update: {},
    create: { phone: "+447700900001", firstName: "Test", lastName: "Contractor", employmentSituation: "CONTRACTING" },
  });
}

main().finally(() => prisma.$disconnect());
