import { db, investmentFundTable, fundHoldingsTable, stocksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getOrCreateFund } from "./fund-helpers.js";

const MIN_CASH_RESERVE_RATIO = 0.2; // luôn giữ lại tối thiểu 20% tiền mặt
const MAX_INVEST_PER_TICK = 0.3; // mỗi lần tự đầu tư, dùng tối đa 30% tiền mặt khả dụng
const SELL_CHANCE = 0.25; // 25% cơ hội mỗi vị thế bị bán (chốt lời/cắt lỗ) mỗi tick

/**
 * Quỹ tự động đầu tư: mỗi tick có thể mua thêm 1 mã ngẫu nhiên,
 * hoặc bán 1 phần vị thế đang giữ (chốt lời/cắt lỗ ngẫu nhiên).
 * Chạy định kỳ từ bot/index.ts cùng lúc với updateStockPrices.
 */
export async function runFundAutoInvest(): Promise<void> {
  const fund = await getOrCreateFund();
  if (fund.totalPool <= 0 && fund.totalInvested <= 0) return; // quỹ trống, không làm gì

  // ── Bước 1: Có thể bán 1 vài vị thế (chốt lời/cắt lỗ ngẫu nhiên) ──
  const holdings = await db.select().from(fundHoldingsTable);
  for (const h of holdings) {
    if (h.quantity <= 0) continue;
    if (Math.random() > SELL_CHANCE) continue;

    const stock = await db.select().from(stocksTable).where(eq(stocksTable.id, h.stockId)).limit(1);
    if (!stock[0]) continue;

    const sellQty = Math.ceil(h.quantity * (0.3 + Math.random() * 0.4)); // bán 30-70% vị thế
    const actualSellQty = Math.min(sellQty, h.quantity);
    const proceeds = actualSellQty * stock[0].price;

    const freshFund = await getOrCreateFund();
    await db.update(investmentFundTable)
      .set({ totalPool: freshFund.totalPool + proceeds, updatedAt: new Date() })
      .where(eq(investmentFundTable.id, freshFund.id));

    const remaining = h.quantity - actualSellQty;
    if (remaining <= 0) {
      await db.delete(fundHoldingsTable).where(eq(fundHoldingsTable.id, h.id));
    } else {
      await db.update(fundHoldingsTable)
        .set({ quantity: remaining, updatedAt: new Date() })
        .where(eq(fundHoldingsTable.id, h.id));
    }
  }

  // ── Bước 2: Có thể mua thêm 1 mã ngẫu nhiên nếu còn tiền mặt dư ──
  const freshFund = await getOrCreateFund();
  const reserveAmount = freshFund.totalPool * MIN_CASH_RESERVE_RATIO;
  const availableToInvest = freshFund.totalPool - reserveAmount;

  if (availableToInvest < 100_000) return; // quá ít để đầu tư thêm

  const allStocks = await db.select().from(stocksTable);
  if (allStocks.length === 0) return;

  const pick = allStocks[Math.floor(Math.random() * allStocks.length)]!;
  const investAmount = Math.floor(availableToInvest * (Math.random() * MAX_INVEST_PER_TICK));
  if (investAmount < 50_000) return;

  const buyQty = Math.floor(investAmount / pick.price);
  if (buyQty <= 0) return;

  const actualCost = buyQty * pick.price;

  await db.update(investmentFundTable)
    .set({ totalPool: freshFund.totalPool - actualCost, updatedAt: new Date() })
    .where(eq(investmentFundTable.id, freshFund.id));

  const existingHolding = await db.select().from(fundHoldingsTable).where(eq(fundHoldingsTable.stockId, pick.id)).limit(1);
  if (existingHolding.length > 0) {
    const h = existingHolding[0]!;
    const newQty = h.quantity + buyQty;
    const newAvg = Math.round((h.avgBuyPrice * h.quantity + actualCost) / newQty);
    await db.update(fundHoldingsTable)
      .set({ quantity: newQty, avgBuyPrice: newAvg, updatedAt: new Date() })
      .where(eq(fundHoldingsTable.id, h.id));
  } else {
    await db.insert(fundHoldingsTable).values({ stockId: pick.id, quantity: buyQty, avgBuyPrice: pick.price });
  }
}
