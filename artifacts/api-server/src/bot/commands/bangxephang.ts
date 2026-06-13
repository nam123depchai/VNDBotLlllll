import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db, discordUsersTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { formatVND } from "../utils/currency.js";

const MEDALS = ["🥇", "🥈", "🥉"];

export const data = new SlashCommandBuilder()
  .setName("bangxephang")
  .setDescription("Xem bảng xếp hạng giàu nhất server");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const topUsers = await db
    .select()
    .from(discordUsersTable)
    .orderBy(desc(discordUsersTable.balance))
    .limit(10);

  if (topUsers.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xf5c518)
      .setTitle("🏆 Bảng Xếp Hạng")
      .setDescription("Chưa có ai trong bảng xếp hạng. Hãy `/lamviec` để bắt đầu!");
    await interaction.reply({ embeds: [embed] });
    return;
  }

  const rows = topUsers.map((u, i) => {
    const medal = MEDALS[i] ?? `**${i + 1}.**`;
    const isMe = u.discordId === interaction.user.id;
    return `${medal} ${isMe ? "**➡ " : ""}${u.username}${isMe ? " (bạn)**" : ""} — ${formatVND(u.balance)}`;
  });

  const myRank = topUsers.findIndex((u) => u.discordId === interaction.user.id);
  const footerText = myRank >= 0
    ? `Bạn đang ở hạng #${myRank + 1}`
    : "Bạn chưa có trong top 10";

  const embed = new EmbedBuilder()
    .setColor(0xf5c518)
    .setTitle("🏆 Bảng Xếp Hạng — Top 10 Giàu Nhất")
    .setDescription(rows.join("\n"))
    .setFooter({ text: footerText })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
