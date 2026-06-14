import { pgTable, text, serial, bigint, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fishInventoryTable = pgTable("fish_inventory", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull(),
  fishName: text("fish_name").notNull(),
  emoji: text("emoji").notNull(),
  value: bigint("value", { mode: "number" }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  fishType: text("fish_type").notNull().default("real"),   // "real" | "fantasy"
  rarity: text("rarity").notNull().default("common"),      // common/uncommon/rare/epic/legendary/mythic
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertFishInventorySchema = createInsertSchema(fishInventoryTable).omit({
  id: true, createdAt: true,
});
export type InsertFishInventory = z.infer<typeof insertFishInventorySchema>;
export type FishInventory = typeof fishInventoryTable.$inferSelect;

export const userFishingGearTable = pgTable("user_fishing_gear", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull().unique(),
  hasRod: boolean("has_rod").notNull().default(false),
  rodLevel: integer("rod_level").notNull().default(0),           // 0-4
  totalFishCaught: integer("total_fish_caught").notNull().default(0),
  bait: integer("bait").notNull().default(0),                    // mồi giun (basic)
  baitGold: integer("bait_gold").notNull().default(0),           // mồi tôm (premium)
  baitDivine: integer("bait_divine").notNull().default(0),       // mồi vàng (legendary)
  cooldownLevel: integer("cooldown_level").notNull().default(0), // 0=20s 1=17s 2=12s 3=5s
  luckLevel: integer("luck_level").notNull().default(0),         // 0-2
  hasNet: boolean("has_net").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserFishingGearSchema = createInsertSchema(userFishingGearTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertUserFishingGear = z.infer<typeof insertUserFishingGearSchema>;
export type UserFishingGear = typeof userFishingGearTable.$inferSelect;
