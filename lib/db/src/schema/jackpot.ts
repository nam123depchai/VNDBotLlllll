import { pgTable, bigint, timestamp } from "drizzle-orm/pg-core";

export const jackpotTable = pgTable("jackpot", {
  id: bigint("id", { mode: "number" }).primaryKey().default(1),
  amount: bigint("amount", { mode: "number" }).notNull().default(0),
  maxAmount: bigint("max_amount", { mode: "number" }).notNull().default(1_000_000_000),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Jackpot = typeof jackpotTable.$inferSelect;
