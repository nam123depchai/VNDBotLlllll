import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { db, stocksTable, marketEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { formatVND } from "../utils/currency.js";

type Tab = "all" | "crypto" | "stock";

function sparkline(history: number[], current: number): string {
  const prices = [...history, current];
  if (prices.length < 2) return "▁▁▁▁▁▁▁▁";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const bars = ["▁","▂","▃","▄","▅","▆","▇","█"];
  return prices.slice(-8).map((p) => bars[Math.round(((p - min) / range) * 7)]!).join("");
}

function pctChange(current: number, prev: number): string {
  if (prev === 0) return "0.00%";
  const pct = ((current - prev) / prev) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

function buildEmbed(
  stocks: (typeof stocksTable.$inferSelect)[],
  tab: Tab,
  events: (typeof marketEventsTable.$inferSelect)[]
): EmbedBuilder {
  const filtered = tab === "all" ? stocks : stocks.filter((s) => s.type === tab);

  const gainers = stocks.filter((s) => s.price > s.prevPrice).length;
  const total = stocks.length || 1;
  const sentiment = gainers / total >= 0.6 ? "🐂 TĂNG" : gainers / total <= 0.4 ? "🐻 GIẢM" : "😐 SIDEWAY";

  let eventBanner = "";
  if (events.length > 0) {
    eventBanner = events.map((e) => `${e.emoji} **${e.title}**`).join("\n") + "\n\n";
  }

  const cryptos = filtered.filter((s) => s.type === "crypto");
  const stocksOnly = filtered.filter((s) => s.type === "stock");

  let desc = eventBanner;

  if (cryptos.length > 0 && (tab === "all" || tab === "crypto")) {
    desc += "━━━━━━━ 💎 CRYPTO ━━━━━━━\n";
    for (const s of cryptos) {
      const up = s.price >= s.prevPrice;
      const icon = up ? "🟢" : "🔴";
      let history: number[] = [];
      try { history = JSON.parse(s.priceHistory ?? "[]"); } catch {}
      const spark = sparkline(history, s.price);
      desc += `${icon} **${s.emoji} ${s.symbol}** ${s.name}\n`;
      desc += `\`${formatVND(s.price)}\` ${pctChange(s.price, s.prevPrice)} \`${spark}\`\n`;
    }
    desc += "\n";
  }

  if (stocksOnly.length > 0 && (tab === "all" || tab === "stock")) {
    desc += "━━━━━━ 📈 CỔ PHIẾU ━━━━━━\n";
    for (const s of stocksOnly) {
      const up = s.price >= s.prevPrice;
      const icon = up ? "🟢" : "🔴";
      let history: number[] = [];
      try { history = JSON.parse(s.priceHistory ?? "[]"); } catch {}
      const spark = sparkline(history, s.price);
      desc += `${icon} **${s.emoji} ${s.symbol}** ${s.name}\n`;
      desc += `\`${formatVND(s.price)}\` ${pctChange(s.price, s.prevPrice)} \`${spark}\`\n`;
    }
  }

  const tabLabel: Record<Tab, string> = { all:"Tất Cả", crypto:"Crypto", stock:"Cổ Phiếu" };

  return new EmbedBuilder()
    .setColor(gainers / total >= 0.5 ? 0x00ff88 : 0xff4444)
    .setTitle("🌐 THỊ TRƯỜNG TÀI CHÍNH")
    .setDescription(desc || "Không có dữ liệu.")
    .addFields(
      { name:"📊 Tâm lý thị trường", value:sentiment, inline:true },
      { name:"📂 Danh mục", value:tabLabel[tab], inline:true },
      { name:"🔥 Sự kiện", value:events.length > 0 ? `${events.length} đang active` : "Không có", inline:true },
    )
    .setFooter({ text:"Giá cập nhật mỗi 5 phút • /suki xem chi tiết sự kiện • /longshort đặt cược ngắn hạn" })
    .setTimestamp();
}

function buildRow(tab: Tab): ActionRowBuilder<ButtonBuilder> {
  const s = (id: Tab, label: string) =>
    new ButtonBuilder().setCustomId(`tt_${id}`).setLabel(label)
      .setStyle(tab === id ? ButtonStyle.Primary : ButtonStyle.Secondary);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    s("all","🌐 Tất Cả"), s("crypto","💎 Crypto"), s("stock","📈 Cổ Phiếu"),
    new ButtonBuilder().setCustomId("tt_refresh").setLabel("🔄 Refresh").setStyle(ButtonStyle.Secondary),
  );
}

export const data = new SlashCommandBuilder()
  .setName("thitruong")
  .setDescription("🌐 Xem bảng giá thị trường với biểu đồ và sự kiện");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  let tab: Tab = "all";
  const stocks = await db.select().from(stocksTable);
  const events = await db.select().from(marketEventsTable).where(eq(marketEventsTable.isActive, true));

  const msg = await interaction.editReply({
    embeds: [buildEmbed(stocks, tab, events)],
    components: [buildRow(tab)],
  });

  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120_000 });

  collector.on("collect", async (i) => {
    if (i.user.id !== interaction.user.id) { await i.reply({ content:"Không phải của bạn!", ephemeral:true }); return; }

    if (i.customId === "tt_refresh") {
      const freshStocks = await db.select().from(stocksTable);
      const freshEvents = await db.select().from(marketEventsTable).where(eq(marketEventsTable.isActive, true));
      await i.update({ embeds:[buildEmbed(freshStocks, tab, freshEvents)], components:[buildRow(tab)] });
      return;
    }
    tab = i.customId.replace("tt_", "") as Tab;
    const freshEvents = await db.select().from(marketEventsTable).where(eq(marketEventsTable.isActive, true));
    await i.update({ embeds:[buildEmbed(stocks, tab, freshEvents)], components:[buildRow(tab)] });
  });

  collector.on("end", () => interaction.editReply({ components:[] }).catch(() => {}));
}
