import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db, stocksTable, userStocksTable, discordUsersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getOrCreateUser } from "../utils/db-helpers.js";
import { formatVND, parseBetAmount } from "../utils/currency.js";

export const data = new SlashCommandBuilder()
  .setName("muack")
  .setDescription("Mua cổ phiếu hoặc crypto")
  .addStringOption((option) =>
    option.setName("ma").setDescription("Mã cổ phiếu/crypto (VD: VND, BTC, ETH)").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("sotien").setDescription("Số tiền đầu tư (hoặc 'all')").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const symbol = interaction.options.getString("ma", true).toUpperCase().trim();
  const amountInput = interaction.options.getString("sotien", true);

  const stock = await db
    .select()
    .from(stocksTable)
    .where(eq(stocksTable.symbol, symbol))
    .limit(1);

  if (stock.length === 0) {
    await interaction.reply({
      content: `❌ Không tìm thấy mã **${symbol}**! Dùng /sanck để xem danh sách.`,
      ephemeral: true,
    });
    return;
  }

  const s = stock[0]!;
  const user = await getOrCreateUser(interaction.user.id, interaction.user.username);
  const amount = parseBetAmount(amountInput, user.balance);

  if (amount === null || amount <= 0) {
    await interaction.reply({
      content: "❌ Số tiền không hợp lệ!",
      ephemeral: true,
    });
    return;
  }

  if (amount > user.balance) {
    await interaction.reply({
      content: "❌ Không đủ tiền!",
      ephemeral: true,
    });
    return;
  }

  const quantity = Math.floor(amount / s.price);
  if (quantity <= 0) {
    await interaction.reply({
      content: `❌ Số tiền quá ít! Giá **${s.symbol}** là ${formatVND(s.price)}. Cần ít nhất ${formatVND(s.price)}.`,
      ephemeral: true,
    });
    return;
  }

  const actualCost = quantity * s.price;

  // Update user balance
  await db
    .update(discordUsersTable)
    .set({ balance: user.balance - actualCost, updatedAt: new Date() })
    .where(eq(discordUsersTable.discordId, interaction.user.id));

  // Update or create user stock
  const existing = await db
    .select()
    .from(userStocksTable)
    .where(
      and(
        eq(userStocksTable.discordId, interaction.user.id),
        eq(userStocksTable.stockId, s.id)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const old = existing[0]!;
    const newQty = old.quantity + quantity;
    const newAvg = Math.floor((old.avgBuyPrice * old.quantity + actualCost) / newQty);
    await db
      .update(userStocksTable)
      .set({ quantity: newQty, avgBuyPrice: newAvg, updatedAt: new Date() })
      .where(eq(userStocksTable.id, old.id));
  } else {
    await db.insert(userStocksTable).values({
      discordId: interaction.user.id,
      stockId: s.id,
      quantity,
      avgBuyPrice: s.price,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(0x00ff88)
    .setTitle("✅ Mua thành công!")
    .setDescription(
      `**${s.symbol}** — ${s.name}\n` +
      `Số lượng: **${quantity.toLocaleString()}**\n` +
      `Giá mua: ${formatVND(s.price)}\n` +
      `Tổng chi phí: ${formatVND(actualCost)}\n` +
      `Số dư còn lại: ${formatVND(user.balance - actualCost)}`
    )
    .setFooter({ text: "Chúc may mắn đầu tư! 📈" });

  await interaction.reply({ embeds: [embed] });
}
