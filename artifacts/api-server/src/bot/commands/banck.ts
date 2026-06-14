import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db, stocksTable, userStocksTable, discordUsersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getOrCreateUser } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";

export const data = new SlashCommandBuilder()
  .setName("banck")
  .setDescription("Bán cổ phiếu hoặc crypto")
  .addStringOption((option) =>
    option.setName("ma").setDescription("Mã cổ phiếu/crypto").setRequired(true)
  )
  .addIntegerOption((option) =>
    option.setName("soluong").setDescription("Số lượng bán (hoặc bỏ trống để bán tất)").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const symbol = interaction.options.getString("ma", true).toUpperCase().trim();
  const sellQty = interaction.options.getInteger("soluong");

  const stock = await db
    .select()
    .from(stocksTable)
    .where(eq(stocksTable.symbol, symbol))
    .limit(1);

  if (stock.length === 0) {
    await interaction.reply({
      content: `❌ Không tìm thấy mã **${symbol}**!`,
      ephemeral: true,
    });
    return;
  }

  const s = stock[0]!;
  const user = await getOrCreateUser(interaction.user.id, interaction.user.username);

  const holding = await db
    .select()
    .from(userStocksTable)
    .where(
      and(
        eq(userStocksTable.discordId, interaction.user.id),
        eq(userStocksTable.stockId, s.id)
      )
    )
    .limit(1);

  if (holding.length === 0 || holding[0]!.quantity <= 0) {
    await interaction.reply({
      content: `❌ Bạn không sở hữu **${symbol}**!`,
      ephemeral: true,
    });
    return;
  }

  const h = holding[0]!;
  const qtyToSell = sellQty ?? h.quantity;

  if (qtyToSell <= 0 || qtyToSell > h.quantity) {
    await interaction.reply({
      content: `❌ Bạn chỉ có **${h.quantity}** ${symbol}!`,
      ephemeral: true,
    });
    return;
  }

  const revenue = qtyToSell * s.price;
  const profit = revenue - (qtyToSell * h.avgBuyPrice);
  const profitText = profit >= 0 ? `+${formatVND(profit)}` : `-${formatVND(Math.abs(profit))}`;
  const profitEmoji = profit >= 0 ? "📈" : "📉";

  // Update balance
  await db
    .update(discordUsersTable)
    .set({ balance: user.balance + revenue, updatedAt: new Date() })
    .where(eq(discordUsersTable.discordId, interaction.user.id));

  // Update holding
  const newQty = h.quantity - qtyToSell;
  if (newQty <= 0) {
    await db.delete(userStocksTable).where(eq(userStocksTable.id, h.id));
  } else {
    await db
      .update(userStocksTable)
      .set({ quantity: newQty, updatedAt: new Date() })
      .where(eq(userStocksTable.id, h.id));
  }

  const embed = new EmbedBuilder()
    .setColor(profit >= 0 ? 0x00ff88 : 0xff4444)
    .setTitle(`${profitEmoji} Bán thành công!`)
    .setDescription(
      `**${s.symbol}** — ${s.name}\n` +
      `Số lượng bán: **${qtyToSell.toLocaleString()}**\n` +
      `Giá bán: ${formatVND(s.price)}\n` +
      `Doanh thu: ${formatVND(revenue)}\n` +
      `Lãi/Lỗ: ${profitText}`
    )
    .setFooter({ text: `Số dư: ${formatVND(user.balance + revenue)}` });

  await interaction.reply({ embeds: [embed] });
}
