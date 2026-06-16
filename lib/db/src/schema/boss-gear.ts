import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Trang bị riêng cho /dauboss, mua tại /shopdauboss
export const bossGearTable = pgTable("boss_gear", {
  discordId: text("discord_id").primaryKey(),
  weaponLevel: integer("weapon_level").notNull().default(0),  // 0-5, tăng dmg
  armorLevel: integer("armor_level").notNull().default(0),    // 0-5, giảm dmg nhận
  potions: integer("potions").notNull().default(0),           // bình hồi máu mang theo trận
  revives: integer("revives").notNull().default(0),           // bùa hồi sinh (sống lại 1 lần khi gục)
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBossGearSchema = createInsertSchema(bossGearTable).omit({
  updatedAt: true,
});
export type InsertBossGear = z.infer<typeof insertBossGearSchema>;
export type BossGear = typeof bossGearTable.$inferSelect;
