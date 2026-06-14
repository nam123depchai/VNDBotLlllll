import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
  import { getOrCreateUser } from "../utils/db-helpers.js";
  import { formatVND } from "../utils/currency.js";
  import { db, discordUsersTable } from "@workspace/db";
  import { eq } from "drizzle-orm";

  const LOAN_RATE = 0.05;

  export const data = new SlashCommandBuilder()
    .setName("trano")
    .setDescription("Trả nợ ngân hàng — trả từng phần hoặc trả hết!")
    .addStringOption((option) =>
      option.setName("sotien").setDescription("Số tiền trả (hoặc 'all')").setRequired(true)
    );

  export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const amountInput = interaction.options.getString("sotien", true);
    const user = await getOrCreateUser(interaction.user.id, interaction.user.username);

    if (user.loanAmount <= 0) {
      const embed = new EmbedBuilder()
        .setColor(0x00cc66).setTitle("✅ Không có nợ!")
        .setDescription("Bạn không có nợ cần trả. Tuyệt vời! 🎉");
      await interaction.reply({ embeds: [embed] });
      return;
    }

    // Tính lãi
    let interest = 0;
    const now = new Date();
    if (user.loanTime) {
      const days = Math.floor((now.getTime() - new Date(user.loanTime).getTime()) / (24 * 3600 * 1000));
      interest = Math.floor(user.loanAmount * LOAN_RATE * days);
    }
    const totalDebt = user.loanAmount + interest;

    let amount: number;
    const trimmed = amountInput.trim().toLowerCase();
    if (trimmed === "all") {
      amount = totalDebt;
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

    if (amount > totalDebt) amount = totalDebt;

    if (amount > user.balance) {
      const embed = new EmbedBuilder()
        .setColor(0xff4444).setTitle("❌ Không đủ tiền!")
        .setDescription(`Số dư: **${formatVND(user.balance)}**. Tổng nợ: **${formatVND(totalDebt)}**.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // Trả: ưu tiên trả lãi trước, sau đó trả gốc
    let remainingPayment = amount;
    const paidInterest = Math.min(interest, remainingPayment);
    remainingPayment -= paidInterest;
    const paidPrincipal = Math.min(user.loanAmount, remainingPayment);
    const newLoan = user.loanAmount - paidPrincipal;
    const newBalance = user.balance - amount;

    await db
      .update(discordUsersTable)
      .set({
        balance: newBalance,
        loanAmount: newLoan,
        loanTime: newLoan > 0 ? user.loanTime : null,
        updatedAt: now,
      })
      .where(eq(discordUsersTable.discordId, interaction.user.id));

    const isFullyPaid = newLoan <= 0;
    const embed = new EmbedBuilder()
      .setColor(isFullyPaid ? 0x00cc66 : 0xff8800)
      .setTitle(isFullyPaid ? "🎉 TRẢ NỢ XONG!" : "💸 Trả Nợ Thành Công!")
      .setDescription(`Bạn đã trả **${formatVND(amount)}**!`)
      .addFields(
        { name: "💰 Trả lãi", value: formatVND(paidInterest), inline: true },
        { name: "💰 Trả gốc", value: formatVND(paidPrincipal), inline: true },
        { name: "💵 Số dư ví", value: formatVND(newBalance), inline: true },
        { name: "💸 Nợ còn lại", value: formatVND(newLoan), inline: true }
      )
      .setFooter({ text: isFullyPaid ? "Tự do tài chính! 🎉" : "Tiếp tục trả nợ nhé! 💪" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
