import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db, stocksTable, userStocksTable, discordUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { formatVND } from "../utils/currency.js";

export const data = new SlashCommandBuilder()
  .setName("ranktrader")
  .setDescription("🏆 Bảng xếp hạng trader lãi nhất server");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const holdings = await db.select().from(userStocksTable);
  const prices = await db.select().from(stocksTable);
  const priceMap = new Map(prices.map((s) => [s.id, s.price]));

  const pnlMap = new Map<string, number>();
  for (const h of holdings) {
    const cur = priceMap.get(h.stockId) ?? 0;
    const pnl = (cur - h.avgBuyPrice) * h.quantity;
    pnlMap.set(h.discordId, (pnlMap.get(h.discordId) ?? 0) + pnl);
  }

  if (pnlMap.size === 0) {
    await interaction.editReply({ content:"📭 Chưa có ai đầu tư!" });
    return;
  }

  const sorted = [...pnlMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const medals = ["🥇","🥈","🥉"];
  let desc = "";

  for (let i = 0; i < sorted.length; i++) {
    const [userId, pnl] = sorted[i]!;
    const user = await db.select().from(discordUsersTable).where(eq(discordUsersTable.discordId, userId)).limit(1);
    const name = user[0]?.username ?? `<@${userId}>`;
    const medal = medals[i] ?? `**${i + 1}.**`;
    const pnlStr = pnl >= 0 ? `🟢 +${formatVND(pnl)}` : `🔴 -${formatVND(Math.abs(pnl))}`;
    desc += `${medal} **${name}** — ${pnlStr}\n`;
  }

  const topPnl = sorted[0]?.[1] ?? 0;

  const embed = new EmbedBuilder()
    .setColor(topPnl >= 0 ? 0xffd700 : 0xff4444)
    .setTitle("🏆 BXH TRADER — Lãi/Lỗ Chưa Thực Hiện")
    .setDescription(desc)
    .setFooter({ text:"PnL = (Giá hiện tại − Giá mua) × Số lượng nắm giữ" })
    .setTimestamp();

  await interaction.editReply({ embeds:[embed] });
}
