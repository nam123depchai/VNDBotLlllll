import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getOrCreateUser } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";
import { db, discordUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const MAX_LOAN_RATIO = 0.5; // Vay tối đa 50% tổng tài sản

export const data = new SlashCommandBuilder()
  .setName("vay")
  .setDescription("Vay tiền ngân hàng — lãi suất 5%/ngày, tối đa 50% tổng tài sản")
  .addStringOption((option) =>
    option.setName("sotien").setDescription("Số tiền muốn vay").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const amountInput = interaction.options.getString("sotien", true);
  const user = await getOrCreateUser(interaction.user.id, interaction.user.username);

  const totalAsset = user.balance + user.bankBalance;
  const maxLoan = Math.floor(totalAsset * MAX_LOAN_RATIO);

  const num = parseInt(amountInput.trim().replace(/[.,_]/g, ""), 10);
  if (isNaN(num) || num <= 0) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444).setTitle("❌ Số tiền không hợp lệ!")
      .setDescription("Nhập số tiền hợp lệ (VD: `10000`).");
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (num > maxLoan) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444).setTitle("❌ Vay quá nhiều!")
      .setDescription(`Tổng tài sản: **${formatVND(totalAsset)}**. Tối đa vay: **${formatVND(maxLoan)}**.\nBạn muốn vay **${formatVND(num)}**.`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (num < 1_000) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444).setTitle("❌ Vay quá ít!")
      .setDescription("Số tiền vay tối thiểu là **1.000₫**.");
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const newBalance = user.balance + num;
  const newLoan = user.loanAmount + num;
  const now = new Date();

  await db
    .update(discordUsersTable)
    .set({ balance: newBalance, loanAmount: newLoan, loanTime: now, updatedAt: now })
    .where(eq(discordUsersTable.discordId, interaction.user.id));

  const embed = new EmbedBuilder()
    .setColor(0xff8800)
    .setTitle("💸 Vay Tiền Thành Công!")
    .setDescription(`Bạn đã vay **${formatVND(num)}** từ ngân hàng!`)
    .addFields(
      { name: "💵 Số dư mới", value: formatVND(newBalance), inline: true },
      { name: "💸 Tổng nợ", value: formatVND(newLoan), inline: true },
      { name: "📉 Lãi suất", value: "5%/ngày", inline: true },
      { name: "⚠️ Lưu ý", value: "Nợ càng lâu càng nhiều lãi! Trả sớm để tiết kiệm!", inline: false }
    )
    .setFooter({ text: "Dùng /trano để trả nợ! 💰" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
