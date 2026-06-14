import { pgTable, text, serial, bigint, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const questsTable = pgTable("quests", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull(),
  questType: text("quest_type").notNull(),
  description: text("description").notNull(),
  target: integer("target").notNull(),
  progress: integer("progress").notNull().default(0),
  completed: boolean("completed").notNull().default(false),
  reward: bigint("reward", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertQuestSchema = createInsertSchema(questsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertQuest = z.infer<typeof insertQuestSchema>;
export type Quest = typeof questsTable.$inferSelect;
