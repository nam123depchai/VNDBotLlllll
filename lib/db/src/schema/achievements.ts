import { pgTable, text, serial, bigint, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const achievementsTable = pgTable("achievements", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull(),
  achievementKey: text("achievement_key").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  unlocked: boolean("unlocked").notNull().default(false),
  unlockedAt: timestamp("unlocked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAchievementSchema = createInsertSchema(achievementsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAchievement = z.infer<typeof insertAchievementSchema>;
export type Achievement = typeof achievementsTable.$inferSelect;
