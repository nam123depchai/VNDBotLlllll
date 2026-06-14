import { db, stocksTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const INITIAL_STOCKS = [
  // Stocks
  { symbol: "VND", name: "VND Corp", price: 50_000, prevPrice: 50_000, type: "stock", volatility: 0.05, trend: 0.02 },
  { symbol: "FPT", name: "FPT Group", price: 120_000, prevPrice: 120_000, type: "stock", volatility: 0.04, trend: 0.03 },
  { symbol: "VCB", name: "Vietcombank", price: 85_000, prevPrice: 85_000, type: "stock", volatility: 0.03, trend: 0.01 },
  { symbol: "HPG", name: "Hoa Phat", price: 35_000, prevPrice: 35_000, type: "stock", volatility: 0.06, trend: -0.01 },
  { symbol: "MWG", name: "The Gioi Di Dong", price: 200_000, prevPrice: 200_000, type: "stock", volatility: 0.05, trend: 0.04 },
  // Crypto
  { symbol: "BTC", name: "Bitcoin", price: 2_500_000_000, prevPrice: 2_500_000_000, type: "crypto", volatility: 0.15, trend: 0.05 },
  { symbol: "ETH", name: "Ethereum", price: 150_000_000, prevPrice: 150_000_000, type: "crypto", volatility: 0.12, trend: 0.03 },
  { symbol: "DOGE", name: "Dogecoin", price: 500_000, prevPrice: 500_000, type: "crypto", volatility: 0.2, trend: 0.08 },
  { symbol: "SHIB", name: "Shiba Inu", price: 50_000, prevPrice: 50_000, type: "crypto", volatility: 0.25, trend: -0.05 },
  { symbol: "SOL", name: "Solana", price: 8_000_000, prevPrice: 8_000_000, type: "crypto", volatility: 0.18, trend: 0.06 },
];

export async function initStocks(): Promise<void> {
  for (const stock of INITIAL_STOCKS) {
    const existing = await db
      .select()
      .from(stocksTable)
      .where(eq(stocksTable.symbol, stock.symbol))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(stocksTable).values(stock);
    }
  }
  console.log("[Stocks] Initialized stocks/cryptos");
}

export async function updateStockPrices(): Promise<void> {
  const stocks = await db.select().from(stocksTable);

  for (const s of stocks) {
    const trend = s.trend;
    const volatility = s.volatility;
    const randomFactor = (Math.random() - 0.5) * 2;
    const change = s.price * (trend + volatility * randomFactor);
    const newPrice = Math.max(1000, Math.floor(s.price + change));

    await db
      .update(stocksTable)
      .set({
        prevPrice: s.price,
        price: newPrice,
        updatedAt: new Date(),
      })
      .where(eq(stocksTable.id, s.id));
  }
}
