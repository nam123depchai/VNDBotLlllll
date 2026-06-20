import { db, investmentFundTable, fundHoldingsTable, stocksTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Lấy hoặc tạo quỹ (chỉ có 1 quỹ duy nhất cho toàn server, id luôn = 1 hàng đầu tiên)
 */
export async function getOrCreateFund() {
  const rows = await db.select().from(investmentFundTable).limit(1);
  if (rows.length > 0) return rows[0]!;

  const [created] = await db.insert(investmentFundTable).values({
    totalPool: 0, totalInvested: 0, totalShares: 0,
  }).returning();
  return created!;
}

/**
 * Tính NAV (Net Asset Value) hiện tại của quỹ = tiền mặt + giá trị các vị thế đang nắm giữ
 */
export async function calcFundNAV(): Promise<{ nav: number; cashPool: number; investedValue: number }> {
  const fund = await getOrCreateFund();
  const holdings = await db.select().from(fundHoldingsTable);

  let investedValue = 0;
  for (const h of holdings) {
    const stock = await db.select().from(stocksTable).where(eq(stocksTable.id, h.stockId)).limit(1);
    if (stock[0]) investedValue += h.quantity * stock[0].price;
  }

  return {
    nav: fund.totalPool + investedValue,
    cashPool: fund.totalPool,
    investedValue,
  };
}

/**
 * Giá trị 1 share hiện tại = NAV / tổng số share đang lưu hành
 * Nếu quỹ trống (chưa ai góp), giá khởi điểm là 1 share = 1.000₫
 */
export async function calcSharePrice(): Promise<number> {
  const fund = await getOrCreateFund();
  const { nav } = await calcFundNAV();
  if (fund.totalShares === 0) return 1_000;
  return nav / fund.totalShares;
}
