import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getOrCreateUser, updateBalance, addXp } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";

export const data = new SlashCommandBuilder()
  .setName("chuyentien")
  .setDescription("Chuyển tiền cho người khác")
  .addUserOption((option) =>
    option.setName("nguoi_nhan").setDescription("Người nhận tiền").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("sotien").setDescription("Số tiền chuyển (hoặc 'all')").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const receiver = interaction.options.getUser("nguoi_nhan", true);
  const amountInput = interaction.options.getString("sotien", true);

  if (receiver.id === interaction.user.id) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle("❌ Không hợp lệ")
      .setDescription("Bạn không thể tự chuyển tiền cho chính mình!");
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (receiver.bot) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle("❌ Không hợp lệ")
      .setDescription("Bạn không thể chuyển tiền cho bot!");
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const sender = await getOrCreateUser(interaction.user.id, interaction.user.username);

  if (sender.balance <= 0) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle("❌ Không đủ tiền")
      .setDescription(`Số dư của bạn chỉ là **${formatVND(sender.balance)}** — không thể chuyển tiền!`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  let amount: number;
  const trimmed = amountInput.trim().toLowerCase();
  if (trimmed === "all") {
    amount = sender.balance;
  } else {
    const num = parseInt(trimmed.replace(/[.,_]/g, ""), 10);
    if (isNaN(num) || num <= 0) {
      const embed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle("❌ Số tiền không hợp lệ")
        .setDescription("Nhập số tiền hợp lệ (VD: `100000`, `500000`) hoặc gõ `all`.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }
    amount = num;
  }

  if (amount > sender.balance) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle("❌ Không đủ tiền")
      .setDescription(`Số dư của bạn chỉ là **${formatVND(sender.balance)}**. Không thể chuyển **${formatVND(amount)}**.`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (amount < 1_000) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle("❌ Chuyển quá ít")
      .setDescription("Số tiền chuyển tối thiểu là **1.000₫**.");
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const receiverUser = await getOrCreateUser(receiver.id, receiver.username);

  const newSenderBalance = sender.balance - amount;
  const newReceiverBalance = receiverUser.balance + amount;

  await updateBalance(interaction.user.id, newSenderBalance);
  await updateBalance(receiver.id, newReceiverBalance);
  await addXp(interaction.user.id, 10);

  const embed = new EmbedBuilder()
    .setColor(0x00cc66)
    .setTitle("💸 Chuyển Tiền Thành Công")
    .setDescription(`Bạn đã chuyển **${formatVND(amount)}** cho <@${receiver.id}>!`)
    .addFields(
      { name: "👤 Người gửi", value: `<@${interaction.user.id}>`, inline: true },
      { name: "👤 Người nhận", value: `<@${receiver.id}>`, inline: true },
      { name: "💰 Số tiền", value: `**${formatVND(amount)}**`, inline: true },
      { name: "🏦 Số dư mới của bạn", value: `**${formatVND(newSenderBalance)}**`, inline: false }
    )
    .setFooter({ text: "Chuyển tiền thành công! 🎉" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
