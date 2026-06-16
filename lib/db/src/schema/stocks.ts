import { pgTable, text, serial, bigint, integer, timestamp, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const stocksTable = pgTable("stocks", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull().unique(),
  name: text("name").notNull(),
  price: bigint("price", { mode: "number" }).notNull(),
  prevPrice: bigint("prev_price", { mode: "number" }).notNull().default(0),
  type: text("type").notNull().default("stock"), // stock | crypto
  volatility: real("volatility").notNull().default(0.05),
  trend: real("trend").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertStockSchema = createInsertSchema(stocksTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertStock = z.infer<typeof insertStockSchema>;
export type Stock = typeof stocksTable.$inferSelect;

export const userStocksTable = pgTable("user_stocks", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull(),
  stockId: integer("stock_id").notNull(),
  quantity: integer("quantity").notNull().default(0),
  avgBuyPrice: bigint("avg_buy_price", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserStockSchema = createInsertSchema(userStocksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUserStock = z.infer<typeof insertUserStockSchema>;
export type UserStock = typeof userStocksTable.$inferSelect;

export const derivativesPositionsTable = pgTable("derivatives_positions", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull(),
  channelId: text("channel_id").notNull(),
  symbol: text("symbol").notNull(),
  positionType: text("position_type").notNull(), // "long" | "short"
  betAmount: bigint("bet_amount", { mode: "number" }).notNull(),
  startPrice: bigint("start_price", { mode: "number" }).notNull(),
  settleAt: timestamp("settle_at").notNull(),
  isSettled: boolean("is_settled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type DerivativesPosition = typeof derivativesPositionsTable.$inferSelect;
