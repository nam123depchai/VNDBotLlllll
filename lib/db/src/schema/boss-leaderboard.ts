import { pgTable, text, serial, bigint, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bossLeaderboardTable = pgTable("boss_leaderboard", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull(),
  username: text("username").notNull(),
  bossKills: integer("boss_kills").notNull().default(0),
  totalDamage: integer("total_damage").notNull().default(0),
  highestDamage: integer("highest_damage").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBossLeaderboardSchema = createInsertSchema(bossLeaderboardTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBossLeaderboard = z.infer<typeof insertBossLeaderboardSchema>;
export type BossLeaderboard = typeof bossLeaderboardTable.$inferSelect;
