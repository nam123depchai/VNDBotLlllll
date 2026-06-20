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
  .setName("muacoin")
  .setDescription("💰 Mua coin do người dùng tự tạo")
  .addStringOption((o) => o.setName("ma").setDescription("Mã coin cần mua").setRequired(true))
  .addIntegerOption((o) => o.setName("so-luong").setDescription("Số lượng coin muốn mua").setRequired(true).setMinValue(1));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const symbol = interaction.options.getString("ma", true).toUpperCase().trim();
  const quantity = interaction.options.getInteger("so-luong", true);

  await interaction.deferReply();

  const coinRows = await db.select().from(userCoinsTable).where(eq(userCoinsTable.symbol, symbol)).limit(1);
  if (!coinRows[0] || !coinRows[0].isActive) {
    await interaction.editReply({ content: `❌ Không tìm thấy coin **${symbol}**! Dùng /chợcoin để xem danh sách.` });
    return;
  }

  const coin = coinRows[0];
  const totalCost = coin.price * quantity;
  const user = await getOrCreateUser(userId, interaction.user.username);

  if (user.balance < totalCost) {
    await interaction.editReply({
      content: `❌ Không đủ tiền!\n💰 Cần: **${formatVND(totalCost)}** | Số dư: **${formatVND(user.balance)}**`,
    });
    return;
  }

  await db.update(discordUsersTable)
    .set({ balance: user.balance - totalCost, updatedAt: new Date() })
    .where(eq(discordUsersTable.discordId, userId));

  const existing = await db.select().from(userCoinHoldingsTable)
    .where(and(eq(userCoinHoldingsTable.discordId, userId), eq(userCoinHoldingsTable.coinId, coin.id)))
    .limit(1);

  if (existing.length > 0) {
    const h = existing[0]!;
    const newQty = h.quantity + quantity;
    const newAvg = Math.round((h.avgBuyPrice * h.quantity + totalCost) / newQty);
    await db.update(userCoinHoldingsTable)
      .set({ quantity: newQty, avgBuyPrice: newAvg, updatedAt: new Date() })
      .where(eq(userCoinHoldingsTable.id, h.id));
  } else {
    await db.insert(userCoinHoldingsTable).values({
      discordId: userId, coinId: coin.id, quantity, avgBuyPrice: coin.price,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(0x00ff88)
    .setTitle(`✅ Đã mua ${coin.emoji} ${quantity.toLocaleString()} ${symbol}`)
    .addFields(
      { name: "💵 Giá mua", value: formatVND(coin.price), inline: true },
      { name: "💰 Tổng chi", value: formatVND(totalCost), inline: true },
      { name: "💳 Số dư còn lại", value: formatVND(user.balance - totalCost), inline: true },
    )
    .setFooter({ text: `Coin tạo bởi <@${coin.creatorId}>` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
