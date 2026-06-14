import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getOrCreateUser } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";
import { db, discordUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const DEPOSIT_RATE = 0.02;

export const data = new SlashCommandBuilder()
  .setName("rut")
  .setDescription("Rút tiền từ ngân hàng — nhận luôn lãi tích lũy!")
  .addStringOption((option) =>
    option.setName("sotien").setDescription("Số tiền rút (hoặc 'all')").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const amountInput = interaction.options.getString("sotien", true);
  const user = await getOrCreateUser(interaction.user.id, interaction.user.username);

  if (user.bankBalance <= 0) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444).setTitle("❌ Không có tiền trong ngân hàng!")
      .setDescription("Bạn chưa gửi tiền vào ngân hàng. Dùng `/gui` để gửi tiền!");
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  let amount: number;
  const trimmed = amountInput.trim().toLowerCase();
  if (trimmed === "all") {
    amount = user.bankBalance;
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

  if (amount > user.bankBalance) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444).setTitle("❌ Không đủ tiền trong ngân hàng!")
      .setDescription(`Ngân hàng của bạn chỉ có **${formatVND(user.bankBalance)}**.`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // Tính lãi trước khi rút
  let interest = 0;
  const now = new Date();
  if (user.bankDepositTime) {
    const days = Math.floor((now.getTime() - new Date(user.bankDepositTime).getTime()) / (24 * 3600 * 1000));
    interest = Math.floor(user.bankBalance * DEPOSIT_RATE * days);
  }

  const totalWithdraw = amount + (amount === user.bankBalance ? interest : 0);
  const newBalance = user.balance + totalWithdraw;
  const newBank = user.bankBalance - amount;

  await db
    .update(discordUsersTable)
    .set({ balance: newBalance, bankBalance: newBank, bankDepositTime: newBank > 0 ? user.bankDepositTime : null, updatedAt: now })
    .where(eq(discordUsersTable.discordId, interaction.user.id));

  const embed = new EmbedBuilder()
    .setColor(0x00cc66)
    .setTitle("🏧 Rút Tiền Thành Công!")
    .setDescription(`Bạn đã rút **${formatVND(amount)}** từ ngân hàng!`)
    .addFields(
      { name: "💰 Tiền rút", value: formatVND(amount), inline: true },
      { name: "📈 Lãi nhận được", value: amount === user.bankBalance ? formatVND(interest) : "0₫ (rút một phần)", inline: true },
      { name: "💵 Số dư ví", value: formatVND(newBalance), inline: true },
      { name: "🏧 Ngân hàng còn lại", value: formatVND(newBank), inline: true }
    )
    .setFooter({ text: "Rút toàn bộ để nhận lãi! 💰" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
