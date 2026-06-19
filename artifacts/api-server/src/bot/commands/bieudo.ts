import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  AttachmentBuilder,
} from "discord.js";
import { db, stocksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { formatVND } from "../utils/currency.js";

const QUICKCHART_URL = "https://quickchart.io/chart";
const FIVE_MIN = 5 * 60 * 1000;

interface Candle {
  x: number; // epoch ms
  o: number;
  h: number;
  l: number;
  c: number;
}

// Dựng nến từ chuỗi giá đóng cửa.
// DB chỉ lưu giá đóng cửa nên high/low được xấp xỉ theo volatility của mã.
function buildCandles(closes: number[], volatility: number): Candle[] {
  const now = Date.now();
  const n = closes.length;
  const wick = Math.min(Math.max(volatility, 0.02), 0.5) * 0.4; // biên độ bóng nến

  return closes.map((close, i) => {
    const open = i === 0 ? close : closes[i - 1]!;
    const body = Math.max(open, close);
    const base = Math.min(open, close);
    const h = Math.round(body * (1 + wick * Math.random()));
    const l = Math.round(base * (1 - wick * Math.random()));
    return {
      x: now - (n - 1 - i) * FIVE_MIN,
      o: Math.round(open),
      h,
      l,
      c: Math.round(close),
    };
  });
}

function sparkline(prices: number[]): string {
  if (prices.length < 2) return "▁▁▁▁▁▁▁▁";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const bars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  return prices
    .slice(-12)
    .map((p) => bars[Math.round(((p - min) / range) * 7)]!)
    .join("");
}

function pctChange(current: number, prev: number): string {
  if (prev === 0) return "0.00%";
  const pct = ((current - prev) / prev) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

async function renderChartPng(
  symbol: string,
  name: string,
  candles: Candle[],
  up: boolean,
): Promise<Buffer | null> {
  const upColor = "#16c784";
  const downColor = "#ea3943";
  const chartConfig = {
    type: "candlestick",
    data: {
      datasets: [
        {
          label: symbol,
          data: candles,
          color: {
            up: upColor,
            down: downColor,
            unchanged: "#888888",
          },
          borderColor: {
            up: upColor,
            down: downColor,
            unchanged: "#888888",
          },
        },
      ],
    },
    options: {
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: `${symbol} • ${name}`,
          color: "#ffffff",
          font: { size: 18, weight: "bold" },
        },
      },
      scales: {
        x: {
          type: "time",
          time: { unit: "minute", displayFormats: { minute: "HH:mm" } },
          ticks: { color: "#9aa4b2", maxTicksLimit: 8 },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
        y: {
          ticks: { color: "#9aa4b2" },
          grid: { color: "rgba(255,255,255,0.08)" },
        },
      },
    },
  };

  try {
    const res = await fetch(QUICKCHART_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chart: chartConfig,
        width: 760,
        height: 420,
        backgroundColor: "#0d1117",
        format: "png",
        version: "4",
      }),
    });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

export const data = new SlashCommandBuilder()
  .setName("bieudo")
  .setDescription("📊 Xem biểu đồ nến giá của một mã cổ phiếu/crypto")
  .addStringOption((o) =>
    o
      .setName("ma")
      .setDescription("Mã cần xem (VD: BTC, ETH, VND, FPT...)")
      .setRequired(true),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const symbol = interaction.options.getString("ma", true).toUpperCase().trim();

  await interaction.deferReply();

  const rows = await db
    .select()
    .from(stocksTable)
    .where(eq(stocksTable.symbol, symbol))
    .limit(1);

  if (!rows[0]) {
    await interaction.editReply({
      content: `❌ Không tìm thấy mã **${symbol}**! Dùng /thitruong để xem danh sách.`,
    });
    return;
  }

  const s = rows[0];

  let history: number[] = [];
  try {
    history = JSON.parse(s.priceHistory ?? "[]");
  } catch {
    history = [];
  }
  const closes = [...history, s.price];
  const up = s.price >= s.prevPrice;
  const changeStr = pctChange(s.price, s.prevPrice);

  if (closes.length < 2) {
    const embed = new EmbedBuilder()
      .setColor(up ? 0x16c784 : 0xea3943)
      .setTitle(`${s.emoji} ${s.symbol} — ${s.name}`)
      .setDescription(
        `💵 Giá hiện tại: **${formatVND(s.price)}** (${changeStr})\n\n` +
          `⏳ Chưa đủ dữ liệu để vẽ biểu đồ — đợi vài nến nữa nhé! (giá cập nhật mỗi 5 phút)`,
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const candles = buildCandles(closes, s.volatility);
  const png = await renderChartPng(s.symbol, s.name, candles, up);

  const embed = new EmbedBuilder()
    .setColor(up ? 0x16c784 : 0xea3943)
    .setTitle(`${s.emoji} ${s.symbol} — ${s.name}`)
    .addFields(
      { name: "💵 Giá hiện tại", value: formatVND(s.price), inline: true },
      {
        name: up ? "📈 Thay đổi" : "📉 Thay đổi",
        value: changeStr,
        inline: true,
      },
      {
        name: "📦 Loại",
        value: s.type === "crypto" ? "💎 Crypto" : "📈 Cổ phiếu",
        inline: true,
      },
    )
    .setFooter({ text: "Mỗi nến = 1 chu kỳ 5 phút • /thitruong xem toàn thị trường" })
    .setTimestamp();

  if (png) {
    const attachment = new AttachmentBuilder(png, { name: "chart.png" });
    embed.setImage("attachment://chart.png");
    await interaction.editReply({ embeds: [embed], files: [attachment] });
  } else {
    // Fallback nếu QuickChart lỗi: dùng sparkline text
    embed.setDescription(`\`${sparkline(closes)}\`\n_(Không tạo được ảnh biểu đồ, hiển thị dạng thu gọn)_`);
    await interaction.editReply({ embeds: [embed] });
  }
}
