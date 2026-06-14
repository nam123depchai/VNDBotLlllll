import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getOrCreateUser, updateBalance } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";
import { incrementQuestProgress } from "../utils/quests.js";

const ICONS = {
  bau: "🌳",
  cua: "🦀",
  tom: "🦐",
  ca: "🐟",
  ga: "🐓",
  nai: "🦌",
};

const NAMES: Record<string, string> = {
  bau: "Bầu",
  cua: "Cua",
  tom: "Tôm",
  ca: "Cá",
  ga: "Gà",
  nai: "Nai",
};

const ALL_CHOICES = Object.keys(ICONS);

function rollBauCua(): string[] {
  return [
    ALL_CHOICES[Math.floor(Math.random() * ALL_CHOICES.length)]!,
    ALL_CHOICES[Math.floor(Math.random() * ALL_CHOICES.length)]!,
    ALL_CHOICES[Math.floor(Math.random() * ALL_CHOICES.length)]!,
  ];
}

function countMatches(roll: string[], choice: string): number {
  return roll.filter((r) => r === choice).length;
}

function getMultiplier(matches: number): number {
  if (matches === 0) return 0;
  if (matches === 1) return 1;
  if (matches === 2) return 2;
  return 3;
}

export const data = new SlashCommandBuilder()
  .setName("baucua")
  .setDescription("Chơi Bầu Cua Tôm Cá — cược 1 trong 6 con, x3 con trúng thì ×3!")
  .addStringOption((option) =>
    option.setName("cuoc").setDescription("Chọn con để cược").setRequired(true)
      .addChoices(
        { name: "🌳 Bầu", value: "bau" },
        { name: "🦀 Cua", value: "cua" },
        { name: "🦐 Tôm", value: "tom" },
        { name: "🐟 Cá", value: "ca" },
        { name: "🐓 Gà", value: "ga" },
        { name: "🦌 Nai", value: "nai" }
      )
  )
  .addStringOption((option) =>
    option.setName("sotien").setDescription("Số tiền cược (hoặc 'all')").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const choice = interaction.options.getString("cuoc", true);
  const betInput = interaction.options.getString("sotien", true);

  const user = await getOrCreateUser(interaction.user.id, interaction.user.username);

  if (user.balance <= 0) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444).setTitle("❌ Không đủ tiền!")
      .setDescription("Hãy dùng `/lamviec` hoặc `/daily` để kiếm tiền trước nhé!");
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  let betAmount: number;
  const trimmed = betInput.trim().toLowerCase();
  if (trimmed === "all") {
    betAmount = user.balance;
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

  if (betAmount > user.balance) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444).setTitle("❌ Không đủ tiền!")
      .setDescription(`Số dư: **${formatVND(user.balance)}**. Không thể cược **${formatVND(betAmount)}**.`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (betAmount < 1_000) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444).setTitle("❌ Cược quá ít!")
      .setDescription("Số tiền cược tối thiểu là **1.000₫**.");
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const roll = rollBauCua();
  const matches = countMatches(roll, choice);
  const multiplier = getMultiplier(matches);
  const winAmount = betAmount * multiplier;
  const newBalance = user.balance - betAmount + winAmount;

  await updateBalance(interaction.user.id, newBalance);
  await incrementQuestProgress(interaction.user.id, "gamble");
  if (matches > 0) await incrementQuestProgress(interaction.user.id, "win");

  const rollDisplay = roll.map((r) => `${ICONS[r as keyof typeof ICONS]} ${NAMES[r]}`).join(" — ");
  const resultLabel = matches === 0
    ? `❌ Không trúng — mất ${formatVND(betAmount)}`
    : `✅ Trúng ${matches} con — thắng ${formatVND(winAmount)}`;

  const embed = new EmbedBuilder()
    .setColor(matches === 0 ? 0xff4444 : matches === 3 ? 0xffd700 : 0x00cc66)
    .setTitle(matches === 3 ? "🎉 TRÚNG CẢ 3 CON!" : matches === 0 ? "😢 Trượt!" : `✅ Trúng ${matches} con!`)
    .setDescription(`Bạn cược **${ICONS[choice as keyof typeof ICONS]} ${NAMES[choice]}** với **${formatVND(betAmount)}**`)
    .addFields(
      { name: "🎲 Kết quả", value: rollDisplay, inline: false },
      { name: "📊 Tổng kết", value: resultLabel, inline: false },
      { name: "🏦 Số dư mới", value: `**${formatVND(newBalance)}**`, inline: true }
    )
    .setFooter({ text: matches === 3 ? "JACKPOT! Bạn là vua Bầu Cua! 🏆" : matches === 0 ? "Chơi lại lần nữa! 💪" : "Thắng rồi! 🎉" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
