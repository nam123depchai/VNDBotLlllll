import { db, stocksTable, marketEventsTable, userCoinsTable } from "@workspace/db";
import { eq, and, lte } from "drizzle-orm";

// ═══════════════════════════════════════════════════════════
// ASSETS
// ═══════════════════════════════════════════════════════════
const INITIAL_ASSETS = [
  // ── Stocks ──────────────────────────────────────────────
  { symbol:"VND",  name:"VND Corp",          emoji:"🏦", price:50_000,         type:"stock",  volatility:0.05, trend:0.02 },
  { symbol:"FPT",  name:"FPT Group",         emoji:"💻", price:120_000,        type:"stock",  volatility:0.04, trend:0.03 },
  { symbol:"VCB",  name:"Vietcombank",        emoji:"🏧", price:85_000,         type:"stock",  volatility:0.03, trend:0.01 },
  { symbol:"HPG",  name:"Hoa Phat",          emoji:"⚙️", price:35_000,         type:"stock",  volatility:0.06, trend:-0.01 },
  { symbol:"MWG",  name:"The Gioi Di Dong",  emoji:"📱", price:200_000,        type:"stock",  volatility:0.05, trend:0.04 },
  // ── Crypto ──────────────────────────────────────────────
  { symbol:"BTC",  name:"Bitcoin",           emoji:"₿",  price:2_500_000_000,  type:"crypto", volatility:0.15, trend:0.05 },
  { symbol:"ETH",  name:"Ethereum",          emoji:"⟠",  price:150_000_000,    type:"crypto", volatility:0.12, trend:0.03 },
  { symbol:"SOL",  name:"Solana",            emoji:"◎",  price:8_000_000,      type:"crypto", volatility:0.18, trend:0.06 },
  { symbol:"BNB",  name:"BNB Chain",         emoji:"🔶", price:12_000_000,     type:"crypto", volatility:0.13, trend:0.02 },
  { symbol:"XRP",  name:"Ripple",            emoji:"💧", price:3_000_000,      type:"crypto", volatility:0.16, trend:0.04 },
  { symbol:"ADA",  name:"Cardano",           emoji:"🔵", price:1_200_000,      type:"crypto", volatility:0.17, trend:0.01 },
  { symbol:"DOGE", name:"Dogecoin",          emoji:"🐶", price:500_000,        type:"crypto", volatility:0.25, trend:0.08 },
  { symbol:"PEPE", name:"Pepe Coin",         emoji:"🐸", price:50_000,         type:"crypto", volatility:0.35, trend:0.10 },
  { symbol:"BONK", name:"Bonk",              emoji:"🔨", price:10_000,         type:"crypto", volatility:0.40, trend:0.05 },
  { symbol:"SHIB", name:"Shiba Inu",         emoji:"🐕", price:20_000,         type:"crypto", volatility:0.30, trend:-0.05 },
  { symbol:"TON",  name:"Toncoin",           emoji:"💎", price:4_000_000,      type:"crypto", volatility:0.22, trend:0.07 },
];

// ═══════════════════════════════════════════════════════════
// MARKET EVENTS
// ═══════════════════════════════════════════════════════════
interface EventTemplate {
  eventType: string; emoji: string; title: string; description: string;
  affectedSymbol?: string; trendBoost: number; volatilityMult: number; durationMin: number;
}

const EVENT_TEMPLATES: EventTemplate[] = [
  { eventType:"BULL",  emoji:"🐂", title:"Thị Trường Tăng Trưởng",    description:"Tin kinh tế tích cực, dòng tiền đổ vào thị trường!",      trendBoost:0.12,  volatilityMult:1.2, durationMin:30 },
  { eventType:"BEAR",  emoji:"🐻", title:"Thị Trường Sụt Giảm",       description:"Dữ liệu kinh tế tiêu cực, nhà đầu tư hoảng loạn!",        trendBoost:-0.10, volatilityMult:1.5, durationMin:20 },
  { eventType:"MOON",  emoji:"🚀", title:"Crypto Trên Đà Tăng",       description:"Dòng tiền lớn đổ vào crypto! Cơ hội vàng!",               trendBoost:0.25,  volatilityMult:2.0, durationMin:15, affectedSymbol:"crypto" },
  { eventType:"CRASH", emoji:"💥", title:"Crypto Đang Sụp Đổ",        description:"Panic sell! Giá crypto giảm thảm hại, cẩn thận!",          trendBoost:-0.20, volatilityMult:2.5, durationMin:10, affectedSymbol:"crypto" },
  { eventType:"PUMP",  emoji:"💉", title:"BTC Được Gom Hàng",         description:"Cá voi đang gom BTC! Giá tăng không phanh 🐋",            trendBoost:0.40,  volatilityMult:2.0, durationMin:12, affectedSymbol:"BTC" },
  { eventType:"NEWS",  emoji:"📰", title:"Elon Tweet DOGE",           description:"Elon Musk vừa tweet về Dogecoin. DOGE đang bơm lên!",      trendBoost:0.50,  volatilityMult:3.0, durationMin:10, affectedSymbol:"DOGE" },
  { eventType:"PUMP",  emoji:"🐸", title:"PEPE Viral Trên Mạng",      description:"PEPE meme đang viral! Giá tăng mạnh trong vài phút!",      trendBoost:0.60,  volatilityMult:3.5, durationMin:8,  affectedSymbol:"PEPE" },
  { eventType:"DUMP",  emoji:"🚨", title:"Cảnh Báo Pháp Lý Crypto",   description:"Cơ quan quản lý phát cảnh báo mới! Giá đang lao dốc...",   trendBoost:-0.30, volatilityMult:2.0, durationMin:15, affectedSymbol:"crypto" },
  { eventType:"NEWS",  emoji:"🏗️", title:"FPT Công Bố Dự Án AI Lớn",description:"FPT vừa ký hợp đồng AI nghìn tỷ! Cổ phiếu tăng vọt 🚀",   trendBoost:0.35,  volatilityMult:1.5, durationMin:20, affectedSymbol:"FPT" },
  { eventType:"DUMP",  emoji:"📉", title:"HPG Bị Điều Tra",           description:"Hoa Phat đang bị điều tra tài chính, cổ phiếu rơi tự do!", trendBoost:-0.25, volatilityMult:2.0, durationMin:15, affectedSymbol:"HPG" },
  { eventType:"PUMP",  emoji:"◎", title:"Solana Vượt Ethereum",       description:"SOL xử lý lượng giao dịch khổng lồ! Vốn hóa vượt ETH!",    trendBoost:0.45,  volatilityMult:2.5, durationMin:12, affectedSymbol:"SOL" },
  { eventType:"NEWS",  emoji:"🔨", title:"BONK Listing Sàn Lớn",      description:"BONK vừa được list trên sàn lớn! Giá tăng vọt ngay lập tức!", trendBoost:0.80,  volatilityMult:4.0, durationMin:8,  affectedSymbol:"BONK" },
  { eventType:"BULL",  emoji:"🏆", title:"VN Index Kỷ Lục",          description:"VN-Index phá đỉnh lịch sử! Cổ phiếu Việt tăng bùng nổ!",   trendBoost:0.15,  volatilityMult:1.3, durationMin:25, affectedSymbol:"stock" },
  { eventType:"CRASH", emoji:"🌊", title:"Thanh Khoản Cạn Kiệt",     description:"Flash crash! Thanh khoản cạn kiệt trên toàn thị trường!",  trendBoost:-0.35, volatilityMult:3.0, durationMin:10 },
];

export async function initStocks(): Promise<void> {
  for (const asset of INITIAL_ASSETS) {
    const existing = await db.select().from(stocksTable).where(eq(stocksTable.symbol, asset.symbol)).limit(1);
    if (existing.length === 0) {
      await db.insert(stocksTable).values({ ...asset, prevPrice: asset.price, priceHistory: "[]" });
    } else if (!existing[0]!.emoji || existing[0]!.emoji === "📊") {
      await db.update(stocksTable).set({ emoji: asset.emoji }).where(eq(stocksTable.symbol, asset.symbol));
    }
  }
  console.log("[Stocks] Initialized stocks/cryptos");
}

async function expireEvents(): Promise<void> {
  const now = new Date();
  await db.update(marketEventsTable)
    .set({ isActive: false })
    .where(and(eq(marketEventsTable.isActive, true), lte(marketEventsTable.expiresAt, now)));
}

async function maybeFireEvent(): Promise<void> {
  if (Math.random() > 0.05) return;
  const activeNow = await db.select().from(marketEventsTable).where(eq(marketEventsTable.isActive, true));
  if (activeNow.length >= 3) return;

  const tmpl = EVENT_TEMPLATES[Math.floor(Math.random() * EVENT_TEMPLATES.length)]!;
  const expiresAt = new Date(Date.now() + tmpl.durationMin * 60_000);

  await db.insert(marketEventsTable).values({
    eventType: tmpl.eventType, emoji: tmpl.emoji, title: tmpl.title, description: tmpl.description,
    affectedSymbol: tmpl.affectedSymbol ?? null,
    trendBoost: tmpl.trendBoost, volatilityMult: tmpl.volatilityMult,
    isActive: true, expiresAt,
  });
}

function calcChange(
  s: { price: number; trend: number; volatility: number; symbol: string; type: string },
  events: { affectedSymbol: string | null; trendBoost: number; volatilityMult: number }[]
): number {
  let totalTrend = s.trend;
  let totalVolMult = 1;
  for (const ev of events) {
    const sym = ev.affectedSymbol;
    const applies = !sym || sym === s.symbol || sym === s.type;
    if (applies) { totalTrend += ev.trendBoost; totalVolMult *= ev.volatilityMult; }
  }
  const rand = (Math.random() - 0.5) * 2;
  return s.price * (totalTrend * 0.1 + s.volatility * totalVolMult * rand * 0.3);
}

export async function updateStockPrices(): Promise<void> {
  await expireEvents();

  const events = await db.select().from(marketEventsTable).where(eq(marketEventsTable.isActive, true));
  const stocks = await db.select().from(stocksTable);

  for (const s of stocks) {
    const change = calcChange(s, events);
    const newPrice = Math.max(1_000, Math.floor(s.price + change));

    let history: number[] = [];
    try { history = JSON.parse(s.priceHistory ?? "[]"); } catch {}
    history.push(s.price);
    if (history.length > 12) history = history.slice(-12);

    await db.update(stocksTable).set({
      prevPrice: s.price,
      price: newPrice,
      priceHistory: JSON.stringify(history),
      updatedAt: new Date(),
    }).where(eq(stocksTable.id, s.id));
  }

  // Coin tự tạo cũng biến động giá theo cùng cơ chế (không bị ảnh hưởng bởi market events)
  const userCoins = await db.select().from(userCoinsTable).where(eq(userCoinsTable.isActive, true));
  for (const c of userCoins) {
    const rand = (Math.random() - 0.5) * 2;
    const change = c.price * (c.trend * 0.1 + c.volatility * rand * 0.3);
    const newPrice = Math.max(10, Math.floor(c.price + change));

    let history: number[] = [];
    try { history = JSON.parse(c.priceHistory ?? "[]"); } catch {}
    history.push(c.price);
    if (history.length > 12) history = history.slice(-12);

    await db.update(userCoinsTable).set({
      prevPrice: c.price,
      price: newPrice,
      priceHistory: JSON.stringify(history),
      updatedAt: new Date(),
    }).where(eq(userCoinsTable.id, c.id));
  }

  await maybeFireEvent();
}
