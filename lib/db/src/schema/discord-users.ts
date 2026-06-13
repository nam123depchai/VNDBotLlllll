import { pgTable, text, serial, bigint, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const discordUsersTable = pgTable("discord_users", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull().unique(),
  username: text("username").notNull(),
  balance: bigint("balance", { mode: "number" }).notNull().default(0),
  lastWorkTime: timestamp("last_work_time"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDiscordUserSchema = createInsertSchema(discordUsersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDiscordUser = z.infer<typeof insertDiscordUserSchema>;
export type DiscordUser = typeof discordUsersTable.$inferSelect;
