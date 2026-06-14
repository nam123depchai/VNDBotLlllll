import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db, stocksTable, userStocksTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getOrCreateUser } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";

export const data = new SlashCommandBuilder()
  .setName("dautu")
  .setDescription("Xem danh mục đầu tư của bạn");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await getOrCreateUser(interaction.user.id, interaction.user.username);

  const holdings = await db
    .select()
    .from(userStocksTable)
    .where(eq(userStocksTable.discordId, interaction.user.id));

  if (holdings.length === 0) {
    await interaction.reply({
      content: `📭 Bạn chưa đầu tư gì! Dùng /muack để mua cổ phiếu hoặc crypto.\n💵 Số dư: ${formatVND(user.balance)}`,
      ephemeral: true,
    });
    return;
  }

  let totalValue = 0;
  let totalCost = 0;
  let lines = "";

  for (const h of holdings) {
    const stock = await db
      .select()
      .from(stocksTable)
      .where(eq(stocksTable.id, h.stockId))
      .limit(1);

    if (stock.length === 0) continue;
    const s = stock[0]!;

    const currentValue = h.quantity * s.price;
    const cost = h.quantity * h.avgBuyPrice;
    const pnl = currentValue - cost;
    const pnlEmoji = pnl >= 0 ? "🟢" : "🔴";

    totalValue += currentValue;
    totalCost += cost;

    lines += `${pnlEmoji} **${s.symbol}** x${h.quantity.toLocaleString()} — ${formatVND(currentValue)} (${pnl >= 0 ? "+" : ""}${formatVND(pnl)})\n`;
  }

  const totalPnl = totalValue - totalCost;
  const totalPnlEmoji = totalPnl >= 0 ? "📈" : "📉";

  const embed = new EmbedBuilder()
    .setColor(totalPnl >= 0 ? 0x00ff88 : 0xff4444)
    .setTitle(`📊 Danh mục đầu tư — ${interaction.user.username}`)
    .setDescription(
      lines +
      `\n**Tổng giá trị:** ${formatVND(totalValue)}\n` +
      `**Tổng vốn:** ${formatVND(totalCost)}\n` +
      `${totalPnlEmoji} **Lãi/Lỗ:** ${totalPnl >= 0 ? "+" : "-"}${formatVND(Math.abs(totalPnl))}\n` +
      `💵 **Số dư:** ${formatVND(user.balance)}`
    )
    .setFooter({ text: "Thị trường có rủi ro, đầu tư cần thận trọng!" });

  await interaction.reply({ embeds: [embed] });
}
