import { pgTable, text, serial, bigint, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const lotteryTicketsTable = pgTable("lottery_tickets", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull(),
  numbers: text("numbers").notNull(), // "123"
  digits: integer("digits").notNull().default(1), // 1, 2, or 3
  drawDate: timestamp("draw_date").notNull(),
  matched: integer("matched").notNull().default(0), // 0, 1, 2, 3
  won: boolean("won").notNull().default(false),
  prize: bigint("prize", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertLotteryTicketSchema = createInsertSchema(lotteryTicketsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertLotteryTicket = z.infer<typeof insertLotteryTicketSchema>;
export type LotteryTicket = typeof lotteryTicketsTable.$inferSelect;
