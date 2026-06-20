import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db, userCoinsTable, userCoinHoldingsTable, discordUsersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getOrCreateUser } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";

export const data = new SlashCommandBuilder()
  .setName("bancoin")
  .setDescription("💸 Bán coin do người dùng tự tạo")
  .addStringOption((o) => o.setName("ma").setDescription("Mã coin cần bán").setRequired(true))
  .addStringOption((o) => o.setName("so-luong").setDescription("Số lượng (hoặc 'all')").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const symbol = interaction.options.getString("ma", true).toUpperCase().trim();
  const qtyInput = interaction.options.getString("so-luong", true).trim().toLowerCase();

  await interaction.deferReply();

  const coinRows = await db.select().from(userCoinsTable).where(eq(userCoinsTable.symbol, symbol)).limit(1);
  if (!coinRows[0]) {
    await interaction.editReply({ content: `❌ Không tìm thấy coin **${symbol}**!` });
    return;
  }
  const coin = coinRows[0];

  const holdingRows = await db.select().from(userCoinHoldingsTable)
    .where(and(eq(userCoinHoldingsTable.discordId, userId), eq(userCoinHoldingsTable.coinId, coin.id)))
    .limit(1);

  if (!holdingRows[0] || holdingRows[0].quantity <= 0) {
    await interaction.editReply({ content: `❌ Bạn không nắm giữ coin **${symbol}**!` });
    return;
  }

  const holding = holdingRows[0];
  const quantity = qtyInput === "all" ? holding.quantity : parseInt(qtyInput, 10);

  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > holding.quantity) {
    await interaction.editReply({ content: `❌ Số lượng không hợp lệ! Bạn đang có **${holding.quantity.toLocaleString()}** ${symbol}.` });
    return;
  }

  const totalEarn = coin.price * quantity;
  const cost = holding.avgBuyPrice * quantity;
  const pnl = totalEarn - cost;
  const up = pnl >= 0;

  const user = await getOrCreateUser(userId, interaction.user.username);
  await db.update(discordUsersTable)
    .set({ balance: user.balance + totalEarn, updatedAt: new Date() })
    .where(eq(discordUsersTable.discordId, userId));

  const remainingQty = holding.quantity - quantity;
  if (remainingQty === 0) {
    await db.delete(userCoinHoldingsTable).where(eq(userCoinHoldingsTable.id, holding.id));
  } else {
    await db.update(userCoinHoldingsTable)
      .set({ quantity: remainingQty, updatedAt: new Date() })
      .where(eq(userCoinHoldingsTable.id, holding.id));
  }

  const embed = new EmbedBuilder()
    .setColor(up ? 0x00ff88 : 0xff4444)
    .setTitle(`✅ Đã bán ${coin.emoji} ${quantity.toLocaleString()} ${symbol}`)
    .addFields(
      { name: "💵 Giá bán", value: formatVND(coin.price), inline: true },
      { name: "💰 Tổng thu", value: formatVND(totalEarn), inline: true },
      { name: `${up ? "📈" : "📉"} Lãi/Lỗ`, value: `${up ? "+" : ""}${formatVND(pnl)}`, inline: true },
      { name: "💳 Số dư mới", value: formatVND(user.balance + totalEarn), inline: true },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
