import { z } from "zod";

export const RewardItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: z.string(),
  amountPence: z.number().int().nullable().meta({ type: "integer", nullable: true } as never),
  supplyingCompany: z.string().nullable().meta({ type: "string", nullable: true } as never),
  createdAt: z.string().datetime(),
});
export type RewardItem = z.infer<typeof RewardItemSchema>;

export const RewardListSchema = z.object({ items: z.array(RewardItemSchema) });
export type RewardList = z.infer<typeof RewardListSchema>;
