import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getOrCreateUser } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";
import { db, discordUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { incrementQuestProgress } from "../utils/quests.js";

export const data = new SlashCommandBuilder()
  .setName("gui")
  .setDescription("Gửi tiền vào ngân hàng — nhận lãi 2%/ngày!")
  .addStringOption((option) =>
    option.setName("sotien").setDescription("Số tiền gửi (hoặc 'all')").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const amountInput = interaction.options.getString("sotien", true);
  const user = await getOrCreateUser(interaction.user.id, interaction.user.username);

  let amount: number;
  const trimmed = amountInput.trim().toLowerCase();
  if (trimmed === "all") {
    amount = user.balance;
  } else {
    const num = parseInt(trimmed.replace(/[.,_]/g, ""), 10);
    if (isNaN(num) || num <= 0) {
      const embed = new EmbedBuilder()
        .setColor(0xff4444).setTitle("❌ Số tiền không hợp lệ!")
        .setDescription("Nhập số tiền hợp lệ (VD: `10000`) hoặc gõ `all`.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }
    amount = num;
  }

  if (amount > user.balance) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444).setTitle("❌ Không đủ tiền!")
      .setDescription(`Số dư: **${formatVND(user.balance)}**. Không thể gửi **${formatVND(amount)}**.`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (amount < 1_000) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444).setTitle("❌ Gửi quá ít!")
      .setDescription("Số tiền gửi tối thiểu là **1.000₫**.");
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const newBalance = user.balance - amount;
  const newBank = user.bankBalance + amount;
  const now = new Date();

  await db
    .update(discordUsersTable)
    .set({ balance: newBalance, bankBalance: newBank, bankDepositTime: now, updatedAt: now })
    .where(eq(discordUsersTable.discordId, interaction.user.id));
  await incrementQuestProgress(interaction.user.id, "bank");

  const embed = new EmbedBuilder()
    .setColor(0x00cc66)
    .setTitle("🏧 Gửi Tiền Thành Công!")
    .setDescription(`Bạn đã gửi **${formatVND(amount)}** vào ngân hàng!`)
    .addFields(
      { name: "💵 Số dư ví", value: formatVND(newBalance), inline: true },
      { name: "🏧 Ngân hàng", value: formatVND(newBank), inline: true },
      { name: "📈 Lãi suất", value: "2%/ngày", inline: true }
    )
    .setFooter({ text: "Tiền trong ngân hàng sẽ sinh lãi mỗi ngày! 💰" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
