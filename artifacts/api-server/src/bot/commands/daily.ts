import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { getOrCreateUser } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";
import { db, discordUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const BASE_DAILY = 200_000;
const STREAK_BONUS = 50_000;
const MAX_STREAK = 7;

export const data = new SlashCommandBuilder()
  .setName("daily")
  .setDescription("Nhận thưởng hàng ngày — streak càng dài càng nhận nhiều!");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await getOrCreateUser(interaction.user.id, interaction.user.username);

  const now = new Date();
  const lastDaily = user.lastDailyTime;
  const streak = user.dailyStreak ?? 0;

  if (lastDaily) {
    const elapsed = now.getTime() - new Date(lastDaily).getTime();
    if (elapsed < DAILY_COOLDOWN_MS) {
      const remaining = DAILY_COOLDOWN_MS - elapsed;
      const hours = Math.floor(remaining / 3_600_000);
      const mins = Math.floor((remaining % 3_600_000) / 60_000);

      const embed = new EmbedBuilder()
        .setColor(0xff8800)
        .setTitle("⏰ Đã nhận hôm nay rồi!")
        .setDescription(`Quay lại sau **${hours} giờ ${mins} phút** nữa nhé.`)
        .addFields(
          { name: "🔥 Streak", value: `${streak} ngày`, inline: true },
          { name: "💵 Số dư", value: formatVND(user.balance), inline: true }
        )
        .setFooter({ text: "Duy trì streak để nhận thưởng nhiều hơn! 💪" });
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }
  }

  const isStreakBroken =
    lastDaily ? now.getTime() - new Date(lastDaily).getTime() > DAILY_COOLDOWN_MS * 2 : false;

  const newStreak = isStreakBroken ? 1 : Math.min(streak + 1, MAX_STREAK);
  const reward = BASE_DAILY + STREAK_BONUS * (newStreak - 1);
  const newBalance = user.balance + reward;

  await db
    .update(discordUsersTable)
    .set({ balance: newBalance, lastDailyTime: now, dailyStreak: newStreak, updatedAt: now })
    .where(eq(discordUsersTable.discordId, interaction.user.id));

  const streakBar = Array.from({ length: MAX_STREAK }, (_, i) =>
    i < newStreak ? "🟡" : "⬜"
  ).join("");

  const tomorrowReward = BASE_DAILY + STREAK_BONUS * Math.min(newStreak, MAX_STREAK - 1);

  const embed = new EmbedBuilder()
    .setColor(isStreakBroken ? 0xff8800 : newStreak === MAX_STREAK ? 0xff4500 : 0xf5c518)
    .setTitle(
      isStreakBroken
        ? "💔 Streak bị phá!"
        : newStreak === MAX_STREAK
        ? "🔥 STREAK MAX 7 NGÀY!"
        : `✅ Nhận Thưởng Ngày ${newStreak}!`
    )
    .setDescription(
      isStreakBroken
        ? "Bạn quên nhận hôm qua nên streak bị reset về 1. Nhớ nhận mỗi ngày nhé!"
        : newStreak === MAX_STREAK
        ? "Streak tối đa! Bạn đang nhận phần thưởng cao nhất mỗi ngày! 🏆"
        : `Ngày thứ **${newStreak}** liên tiếp! Cố duy trì nhé!`
    )
    .addFields(
      { name: "💰 Nhận được", value: `**+${formatVND(reward)}**`, inline: true },
      { name: "🏦 Số dư mới", value: `**${formatVND(newBalance)}**`, inline: true },
      {
        name: `🔥 Streak: ${newStreak}/${MAX_STREAK}`,
        value: streakBar,
        inline: false,
      }
    )
    .setFooter({
      text:
        newStreak < MAX_STREAK
          ? `Ngày mai nhận được ${formatVND(tomorrowReward)} nếu không quên!`
          : `Tiếp tục nhận ${formatVND(reward)}/ngày. Đừng bỏ streak!`,
    })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
