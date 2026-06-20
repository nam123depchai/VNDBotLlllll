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
  priceHistory: text("price_history").notNull().default("[]"), // JSON array, last 12 prices
  emoji: text("emoji").notNull().default("📊"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertStockSchema = createInsertSchema(stocksTable).omit({
  id: true, updatedAt: true,
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
  id: true, createdAt: true, updatedAt: true,
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

export const marketEventsTable = pgTable("market_events", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),  // MOON|CRASH|PUMP|DUMP|BULL|BEAR|NEWS
  emoji: text("emoji").notNull().default("📰"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  affectedSymbol: text("affected_symbol"), // null = toàn thị trường, "crypto"/"stock" = nhóm, hoặc mã cụ thể
  trendBoost: real("trend_boost").notNull().default(0),
  volatilityMult: real("volatility_mult").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});
export type MarketEvent = typeof marketEventsTable.$inferSelect;

// ═══════════════════════════════════════════════════════════
// USER-CREATED COINS — Coin tự tạo bởi người dùng
// ═══════════════════════════════════════════════════════════
export const userCoinsTable = pgTable("user_coins", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull().unique(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("🪙"),
  price: bigint("price", { mode: "number" }).notNull(),
  prevPrice: bigint("prev_price", { mode: "number" }).notNull().default(0),
  volatility: real("volatility").notNull().default(0.05),
  trend: real("trend").notNull().default(0),
  priceHistory: text("price_history").notNull().default("[]"),
  creatorId: text("creator_id").notNull(),
  creationCost: bigint("creation_cost", { mode: "number" }).notNull(),
  totalSupply: bigint("total_supply", { mode: "number" }).notNull().default(1_000_000),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type UserCoin = typeof userCoinsTable.$inferSelect;

export const userCoinHoldingsTable = pgTable("user_coin_holdings", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull(),
  coinId: integer("coin_id").notNull(),
  quantity: integer("quantity").notNull().default(0),
  avgBuyPrice: bigint("avg_buy_price", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type UserCoinHolding = typeof userCoinHoldingsTable.$inferSelect;

// Theo dõi số lần 1 người đã tạo coin, để tính phí x3 lần sau
export const coinCreationCounterTable = pgTable("coin_creation_counter", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull().unique(),
  coinsCreated: integer("coins_created").notNull().default(0),
});
export type CoinCreationCounter = typeof coinCreationCounterTable.$inferSelect;

// ═══════════════════════════════════════════════════════════
// INVESTMENT FUND — Quỹ đầu tư chung toàn server
// ═══════════════════════════════════════════════════════════
export const investmentFundTable = pgTable("investment_fund", {
  id: serial("id").primaryKey(),
  totalPool: bigint("total_pool", { mode: "number" }).notNull().default(0), // tiền mặt chưa đầu tư
  totalInvested: bigint("total_invested", { mode: "number" }).notNull().default(0), // giá trị đang nằm trong các vị thế
  totalShares: bigint("total_shares", { mode: "number" }).notNull().default(0), // tổng "cổ phần" quỹ đã phát hành
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type InvestmentFund = typeof investmentFundTable.$inferSelect;

export const fundContributionsTable = pgTable("fund_contributions", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull(),
  shares: bigint("shares", { mode: "number" }).notNull().default(0), // số cổ phần người này nắm giữ
  totalContributed: bigint("total_contributed", { mode: "number" }).notNull().default(0), // tổng đã góp (lịch sử)
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type FundContribution = typeof fundContributionsTable.$inferSelect;

// Vị thế quỹ đang nắm giữ (mã + số lượng), tách riêng khỏi user_stocks
export const fundHoldingsTable = pgTable("fund_holdings", {
  id: serial("id").primaryKey(),
  stockId: integer("stock_id").notNull(),
  quantity: integer("quantity").notNull().default(0),
  avgBuyPrice: bigint("avg_buy_price", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type FundHolding = typeof fundHoldingsTable.$inferSelect;
