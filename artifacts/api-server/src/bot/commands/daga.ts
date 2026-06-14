import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getOrCreateUser, updateBalance } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";

export const data = new SlashCommandBuilder()
  .setName("daga")
  .setDescription("Đá gà — Thách đấu người khác, cược tiền, quay xổ số xem ai hơn!")
  .addUserOption((option) =>
    option.setName("doi_thu").setDescription("Người bạn muốn thách đấu").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("sotien").setDescription("Số tiền cược (hoặc 'all')").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const opponent = interaction.options.getUser("doi_thu", true);
  const betInput = interaction.options.getString("sotien", true);

  if (opponent.id === interaction.user.id) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444).setTitle("❌ Không hợp lệ")
      .setDescription("Bạn không thể tự thách đấu chính mình!");
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (opponent.bot) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444).setTitle("❌ Không hợp lệ")
      .setDescription("Bạn không thể thách đấu bot!");
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const player = await getOrCreateUser(interaction.user.id, interaction.user.username);
  const opponentData = await getOrCreateUser(opponent.id, opponent.username);

  let betAmount: number;
  const trimmed = betInput.trim().toLowerCase();
  if (trimmed === "all") {
    betAmount = Math.min(player.balance, opponentData.balance);
  } else {
    const num = parseInt(trimmed.replace(/[.,_]/g, ""), 10);
    if (isNaN(num) || num <= 0) {
      const embed = new EmbedBuilder()
        .setColor(0xff4444).setTitle("❌ Số tiền không hợp lệ!")
        .setDescription("Nhập số tiền hợp lệ (VD: `10000`) hoặc gõ `all`.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }
    betAmount = num;
  }

  if (betAmount < 1_000) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444).setTitle("❌ Cược quá ít!")
      .setDescription("Số tiền cược tối thiểu là **1.000₫**.");
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (betAmount > player.balance) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444).setTitle("❌ Không đủ tiền!")
      .setDescription(`Bạn chỉ có **${formatVND(player.balance)}**. Không thể cược **${formatVND(betAmount)}**.`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (betAmount > opponentData.balance) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444).setTitle("❌ Đối thủ không đủ tiền!")
      .setDescription(`<@${opponent.id}> chỉ có **${formatVND(opponentData.balance)}**. Không đủ **${formatVND(betAmount)}**.`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const playerRoll = Math.floor(Math.random() * 100) + 1;
  const opponentRoll = Math.floor(Math.random() * 100) + 1;

  const isWin = playerRoll > opponentRoll;
  const isDraw = playerRoll === opponentRoll;

  let newPlayerBalance: number;
  let newOppBalance: number;
  let resultTitle: string;
  let color: number;
  let footer: string;

  if (isDraw) {
    newPlayerBalance = player.balance;
    newOppBalance = opponentData.balance;
    resultTitle = "⚠️ Hòa!";
    color = 0xf5c518;
    footer = "Hòa! Cả hai đều xuất sắc! 🎉";
  } else if (isWin) {
    newPlayerBalance = player.balance + betAmount;
    newOppBalance = opponentData.balance - betAmount;
    resultTitle = "🎉 BẠN THẮNG!";
    color = 0x00cc66;
    footer = "Chiến thắng! 🏆";
  } else {
    newPlayerBalance = player.balance - betAmount;
    newOppBalance = opponentData.balance + betAmount;
    resultTitle = "😢 BẠN THUA!";
    color = 0xff4444;
    footer = "Thua rồi! Thử lại lần sau! 💪";
  }

  await updateBalance(interaction.user.id, newPlayerBalance);
  await updateBalance(opponent.id, newOppBalance);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(resultTitle)
    .setDescription(`💰 Cược: **${formatVND(betAmount)}**`)
    .addFields(
      { name: "👤 Bạn", value: `Quay: **${playerRoll}**`, inline: true },
      { name: "👤 Đối thủ", value: `<@${opponent.id}> Quay: **${opponentRoll}**`, inline: true },
      { name: "🏦 Số dư mới của bạn", value: `**${formatVND(newPlayerBalance)}**`, inline: false }
    )
    .setFooter({ text: footer })
    .setTimestamp();

  await interaction.reply({ content: `<@${opponent.id}>`, embeds: [embed] });
}
