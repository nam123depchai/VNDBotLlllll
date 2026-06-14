import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getOrCreateUser } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";
import { db, questsTable, discordUsersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

export const data = new SlashCommandBuilder()
  .setName("nhiemvu-nhan")
  .setDescription("Nhận thưởng nhiệm vụ đã hoàn thành!");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const completedQuests = await db
    .select()
    .from(questsTable)
    .where(
      and(
        eq(questsTable.discordId, interaction.user.id),
        eq(questsTable.completed, true)
      )
    );

  if (completedQuests.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle("❌ Không có thưởng!")
      .setDescription("Bạn chưa hoàn thành nhiệm vụ nào. Dùng `/nhiemvu` để xem nhiệm vụ hiện tại!");
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const totalReward = completedQuests.reduce((sum, q) => sum + q.reward, 0);
  const user = await getOrCreateUser(interaction.user.id, interaction.user.username);
  const newBalance = user.balance + totalReward;

  await db
    .update(discordUsersTable)
    .set({ balance: newBalance, updatedAt: new Date() })
    .where(eq(discordUsersTable.discordId, interaction.user.id));

  // Xóa nhiệm vụ đã nhận
  for (const q of completedQuests) {
    await db.delete(questsTable).where(eq(questsTable.id, q.id));
  }

  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("🎉 Nhận Thưởng Thành Công!")
    .setDescription(`Bạn đã nhận thưởng cho **${completedQuests.length}** nhiệm vụ!`)
    .addFields(
      { name: "💰 Tổng thưởng", value: `**${formatVND(totalReward)}**`, inline: true },
      { name: "🏦 Số dư mới", value: `**${formatVND(newBalance)}**`, inline: true }
    )
    .setFooter({ text: "Nhiệm vụ mới sẽ xuất hiện sau khi bạn dùng /nhiemvu lại! 🎉" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
