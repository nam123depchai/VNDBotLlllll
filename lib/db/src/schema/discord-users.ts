import { pgTable, text, serial, bigint, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const discordUsersTable = pgTable("discord_users", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull().unique(),
  username: text("username").notNull(),
  balance: bigint("balance", { mode: "number" }).notNull().default(0),
  bankBalance: bigint("bank_balance", { mode: "number" }).notNull().default(0),
  bankDepositTime: timestamp("bank_deposit_time"),
  loanAmount: bigint("loan_amount", { mode: "number" }).notNull().default(0),
  loanTime: timestamp("loan_time"),
  lastWorkTime: timestamp("last_work_time"),
  lastDailyTime: timestamp("last_daily_time"),
  dailyStreak: integer("daily_streak").notNull().default(0),
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
