import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Pet dùng riêng cho /dauboss — mỗi người chỉ có 1 pet
export const bossPetTable = pgTable("boss_pet", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull().unique(),
  petType: text("pet_type").notNull(),       // "cho" | "meo" | "rong" | "phoenix" | "ho"
  name: text("name").notNull(),
  level: integer("level").notNull().default(1),
  exp: integer("exp").notNull().default(0),
  atkBonus: integer("atk_bonus").notNull().default(0),     // % tăng dmg gây ra
  defBonus: integer("def_bonus").notNull().default(0),     // % giảm dmg nhận vào
  critBonus: integer("crit_bonus").notNull().default(0),   // % tăng tỉ lệ crit
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBossPetSchema = createInsertSchema(bossPetTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBossPet = z.infer<typeof insertBossPetSchema>;
export type BossPet = typeof bossPetTable.$inferSelect;
