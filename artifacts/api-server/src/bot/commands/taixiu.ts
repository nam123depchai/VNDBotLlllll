import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getOrCreateUser, updateBalance } from "../utils/db-helpers.js";
import { formatVND, parseBetAmount } from "../utils/currency.js";

function rollDice(): number[] {
  return [
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
  ];
}

function getDiceEmoji(n: number): string {
  return ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][n - 1]!;
}

export const data = new SlashCommandBuilder()
  .setName("taixiu")
  .setDescription("Chơi Tài Xỉu — T là Tài (11-17), X là Xỉu (4-10)")
  .addStringOption((option) =>
    option.setName("cuoc").setDescription("Tài (T) hoặc Xỉu (X)").setRequired(true)
      .addChoices(
        { name: "🔴 Tài (T) — 11 đến 17", value: "T" },
        { name: "🔵 Xỉu (X) — 4 đến 10", value: "X" }
      )
  )
  .addStringOption((option) =>
    option.setName("sotien").setDescription("Số tiền cược (hoặc gõ 'all' để cược tất cả)").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const choice = interaction.options.getString("cuoc", true) as "T" | "X";
  const betInput = interaction.options.getString("sotien", true);

  const user = await getOrCreateUser(interaction.user.id, interaction.user.username);

  if (user.balance <= 0) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle("❌ Không đủ tiền!")
      .setDescription("Bạn không có tiền để cược. Hãy dùng `/lamviec` để kiếm tiền trước nhé!")
      .setFooter({ text: "Nghèo mà vẫn muốn đánh 😂" });
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const betAmount = parseBetAmount(betInput, user.balance);

  if (betAmount === null) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle("❌ Số tiền không hợp lệ!")
      .setDescription("Nhập số tiền hợp lệ (VD: `1000`, `500`) hoặc gõ `all` để cược tất cả.");
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (betAmount > user.balance) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle("❌ Không đủ tiền!")
      .setDescription(`Số dư của bạn chỉ còn **${formatVND(user.balance)}**. Không thể cược **${formatVND(betAmount)}**.`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (betAmount < 1_000) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle("❌ Cược quá ít!")
      .setDescription("Số tiền cược tối thiểu là **1.000₫**.");
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const dice = rollDice();
  const total = dice.reduce((a, b) => a + b, 0);
  const result = total >= 11 ? "T" : "X";
  const isWin = result === choice;

  const winMultiplier = 1.9;
  const winAmount = Math.floor(betAmount * winMultiplier);
  const newBalance = isWin
    ? user.balance + winAmount
    : user.balance - betAmount;

  await updateBalance(interaction.user.id, Math.max(0, newBalance));

  const diceDisplay = dice.map(getDiceEmoji).join(" ");
  const resultLabel = result === "T" ? "🔴 Tài" : "🔵 Xỉu";
  const choiceLabel = choice === "T" ? "🔴 Tài" : "🔵 Xỉu";

  const embed = new EmbedBuilder()
    .setColor(isWin ? 0x00cc66 : 0xff4444)
    .setTitle(isWin ? "🎉 BẠN THẮNG!" : "😢 BẠN THUA!")
    .addFields(
      { name: "🎲 Xúc xắc", value: `${diceDisplay} = **${total}**`, inline: false },
      { name: "📊 Kết quả", value: resultLabel, inline: true },
      { name: "🎯 Bạn cược", value: choiceLabel, inline: true },
      {
        name: isWin ? "💰 Thắng" : "💸 Thua",
        value: isWin ? `**+${formatVND(winAmount)}**` : `**-${formatVND(betAmount)}**`,
        inline: true,
      },
      { name: "🏦 Số dư mới", value: `**${formatVND(Math.max(0, newBalance))}**`, inline: false }
    )
    .setFooter({ text: isWin ? "Hên quá! Chơi tiếp không? 😏" : "Xui rồi... Thử lại lần nữa không? 🥲" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
