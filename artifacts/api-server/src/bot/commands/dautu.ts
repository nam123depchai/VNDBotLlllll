import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db, stocksTable, userStocksTable, derivativesPositionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getOrCreateUser } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";

function pctStr(pnl: number, cost: number): string {
  if (cost === 0) return "0%";
  return `${((pnl / cost) * 100).toFixed(1)}%`;
}

export const data = new SlashCommandBuilder()
  .setName("dautu")
  .setDescription("📊 Xem danh mục đầu tư của bạn");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const userId = interaction.user.id;
  const user = await getOrCreateUser(userId, interaction.user.username);
  const holdings = await db.select().from(userStocksTable).where(eq(userStocksTable.discordId, userId));
  const openPositions = await db.select().from(derivativesPositionsTable)
    .where(and(eq(derivativesPositionsTable.discordId, userId), eq(derivativesPositionsTable.isSettled, false)));

  // ── Trống hoàn toàn ─────────────────────────────────────
  if (holdings.length === 0 && openPositions.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0x888888)
      .setTitle("📊 Danh Mục Đầu Tư Trống")
      .setDescription(
        `Bạn chưa đầu tư gì!\n\n` +
        `💵 **Số dư:** ${formatVND(user.balance)}\n\n` +
        `📌 Dùng **/muack** để mua cổ phiếu/crypto\n` +
        `📈 Dùng **/longshort** để đặt cược ngắn hạn\n` +
        `📰 Dùng **/thitruong** để xem giá thị trường`
      );
    await interaction.editReply({ embeds:[embed] });
    return;
  }

  let totalValue = 0, totalCost = 0;
  let bestPnl = -Infinity, worstPnl = Infinity;
  let bestName = "", worstName = "";
  let cryptoLines = "", stockLines = "";

  // ── Holdings (mua hẳn) ───────────────────────────────────
  for (const h of holdings) {
    const stock = await db.select().from(stocksTable).where(eq(stocksTable.id, h.stockId)).limit(1);
    if (!stock[0]) continue;
    const s = stock[0];

    const curVal = h.quantity * s.price;
    const cost = h.quantity * h.avgBuyPrice;
    const pnl = curVal - cost;
    const up = pnl >= 0;
    const icon = up ? "🟢" : "🔴";

    totalValue += curVal;
    totalCost += cost;

    if (pnl > bestPnl) { bestPnl = pnl; bestName = s.symbol; }
    if (pnl < worstPnl) { worstPnl = pnl; worstName = s.symbol; }

    const line =
      `${icon} **${s.emoji} ${s.symbol}** x${h.quantity.toLocaleString()}\n` +
      `> Giá TB: ${formatVND(h.avgBuyPrice)} → ${formatVND(s.price)}\n` +
      `> Giá trị: ${formatVND(curVal)} | ${up ? "+" : ""}${formatVND(pnl)} (${up ? "+" : ""}${pctStr(pnl, cost)})\n`;

    if (s.type === "crypto") cryptoLines += line;
    else stockLines += line;
  }

  // ── Vị thế Long/Short đang mở ────────────────────────────
  let posLines = "";
  if (openPositions.length > 0) {
    for (const pos of openPositions) {
      const stock = await db.select().from(stocksTable).where(eq(stocksTable.symbol, pos.symbol)).limit(1);
      const curPrice = stock[0]?.price ?? pos.startPrice;
      const isUp = curPrice > pos.startPrice;
      const isDraw = curPrice === pos.startPrice;
      const winning = isDraw ? null : pos.positionType === "long" ? isUp : !isUp;

      const posIcon = pos.positionType === "long" ? "🟢 LONG" : "🔴 SHORT";
      const statusIcon = isDraw ? "🟡" : winning ? "📈" : "📉";
      const endEpoch = Math.floor(pos.settleAt.getTime() / 1000);

      posLines +=
        `${statusIcon} **${pos.symbol}** ${posIcon} — Cọc ${formatVND(pos.betAmount)}\n` +
        `> Giá mở: ${formatVND(pos.startPrice)} → hiện tại: ${formatVND(curPrice)}\n` +
        `> Chốt: <t:${endEpoch}:R>\n`;
    }
  }

  const totalPnl = totalValue - totalCost;
  const up = totalPnl >= 0;

  let desc = "";
  if (cryptoLines) desc += "**💎 CRYPTO**\n" + cryptoLines + "\n";
  if (stockLines) desc += "**📈 CỔ PHIẾU**\n" + stockLines + "\n";
  if (posLines) desc += "**🎮 VỊ THẾ ĐANG MỞ (Long/Short)**\n" + posLines;

  const fields = [];
  if (holdings.length > 0) {
    fields.push(
      { name:"💰 Tổng giá trị", value:formatVND(totalValue), inline:true },
      { name:"💵 Vốn bỏ vào", value:formatVND(totalCost), inline:true },
      { name:`${up ? "📈" : "📉"} Lãi/Lỗ`, value:`${up ? "+" : ""}${formatVND(totalPnl)} (${up ? "+" : ""}${pctStr(totalPnl, totalCost)})`, inline:true },
      { name:"🏆 Tốt nhất", value:bestName || "—", inline:true },
      { name:"💀 Tệ nhất", value:worstName || "—", inline:true },
    );
  }
  fields.push({ name:"💵 Số dư còn lại", value:formatVND(user.balance), inline:true });
  if (openPositions.length > 0) {
    fields.push({ name:"🎮 Vị thế đang mở", value:`${openPositions.length} lệnh`, inline:true });
  }

  const embed = new EmbedBuilder()
    .setColor(up ? 0x00ff88 : 0xff4444)
    .setTitle(`📊 Danh Mục — ${interaction.user.username}`)
    .setDescription(desc || "—")
    .addFields(fields)
    .setFooter({ text:"/thitruong xem giá • /ranktrader xem BXH • /longshort đặt cược ngắn hạn" })
    .setTimestamp();

  await interaction.editReply({ embeds:[embed] });
}
