import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getOrCreateUser, getXpForLevel } from "../utils/db-helpers.js";
import { formatVNDShort } from "../utils/currency.js";

export const data = new SlashCommandBuilder()
  .setName("level")
  .setDescription("Xem level và XP của bạn")
  .addUserOption((option) =>
    option.setName("user").setDescription("Xem level của người khác (optional)").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const targetUser = interaction.options.getUser("user") || interaction.user;
  const user = await getOrCreateUser(targetUser.id, targetUser.username);

  const xpNeeded = getXpForLevel(user.level);
  const progressBarLength = 20;
  const filled = Math.floor((user.xp / xpNeeded) * progressBarLength);
  const progressBar = "█".repeat(filled) + "░".repeat(progressBarLength - filled);

  const embed = new EmbedBuilder()
    .setColor(0x00ff88)
    .setTitle(`🏆 Level ${user.level} — ${targetUser.username}`)
    .setDescription(
      `**XP:** ${user.xp.toLocaleString()} / ${xpNeeded.toLocaleString()}\n` +
      `[${progressBar}]\n\n` +
      `**Tổng XP:** ${user.totalXp.toLocaleString()}\n` +
      `**Số dư:** ${formatVNDShort(user.balance)}\n` +
      `**Level tiếp theo cần:** ${(xpNeeded - user.xp).toLocaleString()} XP`
    )
    .setThumbnail(targetUser.displayAvatarURL())
    .setFooter({ text: "Càng hoạt động nhiều, level càng cao! 💪" });

  await interaction.reply({ embeds: [embed] });
}
