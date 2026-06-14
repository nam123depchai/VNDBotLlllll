import { pgTable, text, serial, bigint, integer, timestamp, boolean } from "drizzle-orm/pg-core";

export const redemptionCodesTable = pgTable("redemption_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  createdBy: text("created_by").notNull(),
  money: bigint("money", { mode: "number" }).notNull().default(0),
  xp: integer("xp").notNull().default(0),
  bait: integer("bait").notNull().default(0),
  baitGold: integer("bait_gold").notNull().default(0),
  baitDivine: integer("bait_divine").notNull().default(0),
  fishName: text("fish_name"),
  fishEmoji: text("fish_emoji"),
  fishValue: bigint("fish_value", { mode: "number" }),
  fishRarity: text("fish_rarity"),
  fishQuantity: integer("fish_quantity").notNull().default(1),
  maxUses: integer("max_uses"),          // null = không giới hạn
  currentUses: integer("current_uses").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
});

export const codeRedemptionsTable = pgTable("code_redemptions", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  userId: text("user_id").notNull(),
  redeemedAt: timestamp("redeemed_at").notNull().defaultNow(),
});

export type RedemptionCode = typeof redemptionCodesTable.$inferSelect;
export type CodeRedemption = typeof codeRedemptionsTable.$inferSelect;

