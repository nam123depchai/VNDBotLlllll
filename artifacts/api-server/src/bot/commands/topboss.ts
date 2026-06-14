import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db, bossLeaderboardTable } from "@workspace/db";
import { desc } from "drizzle-orm";

export const data = new SlashCommandBuilder()
  .setName("topboss")
  .setDescription("Bảng xếp hạng sát Boss");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const top = await db
    .select()
    .from(bossLeaderboardTable)
    .orderBy(desc(bossLeaderboardTable.bossKills))
    .limit(10);

  if (top.length === 0) {
    await interaction.reply({
      content: "🤖 Chưa có ai đánh bại boss nào! Dùng /dauboss để trở thành huyền thoại.",
      ephemeral: true,
    });
    return;
  }

  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

  let description = "💀 Những chiến binh mạnh nhất!\n\n";
  for (let i = 0; i < top.length; i++) {
    const p = top[i]!;
    description += `${medals[i] || "🔷"} **${p.username}** — ${p.bossKills} kills | ${p.totalDamage.toLocaleString()} dmg\n`;
  }

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("🏆 Bảng Xếp Hạng Sát Boss")
    .setDescription(description)
    .setFooter({ text: "Ai sẽ là Sát Boss vĩ đại nhất?" });

  await interaction.reply({ embeds: [embed] });
}
