import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getOrCreateUser } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";
import { db, questsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const QUEST_TEMPLATES = [
  { type: "work", desc: "Đi làm {target} lần", target: 3, reward: 100_000 },
  { type: "gamble", desc: "Chơi bất kỳ game nào {target} lần", target: 5, reward: 150_000 },
  { type: "win", desc: "Thắng bất kỳ game nào {target} lần", target: 3, reward: 200_000 },
  { type: "earn", desc: "Kiếm tổng cộng {target} từ làm việc", target: 500_000, reward: 100_000 },
  { type: "bank", desc: "Gửi tiền vào ngân hàng {target} lần", target: 2, reward: 80_000 },
];

export const data = new SlashCommandBuilder()
  .setName("nhiemvu")
  .setDescription("Xem và nhận nhiệm vụ hàng ngày — hoàn thành để nhận thưởng!");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await getOrCreateUser(interaction.user.id, interaction.user.username);

  // Kiểm tra nhiệm vụ cũ
  const existingQuests = await db
    .select()
    .from(questsTable)
    .where(
      eq(questsTable.discordId, interaction.user.id)
    );

  const activeQuests = existingQuests.filter((q) => !q.completed);
  const completedQuests = existingQuests.filter((q) => q.completed);

  // Nếu chưa có hoặc đã hoàn thành hết — tạo mới
  if (activeQuests.length === 0 && completedQuests.length === 0) {
    const newQuests = QUEST_TEMPLATES.map((q) => ({
      discordId: interaction.user.id,
      questType: q.type,
      description: q.desc.replace("{target}", q.target.toLocaleString("vi-VN")),
      target: q.target,
      progress: 0,
      completed: false,
      reward: q.reward,
    }));

    await db.insert(questsTable).values(newQuests);

    const questsList = newQuests.map((q, i) => {
      const emoji = ["1️⃣", "2️⃣", "3️⃣"][i] ?? `${i + 1}.`;
      return `${emoji} ${q.description} — **${formatVND(q.reward)}**`;
    }).join("\n");

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle("📋 Nhiệm Vụ Mới!")
      .setDescription(`Bạn đã nhận **${newQuests.length}** nhiệm vụ mới!\n\n${questsList}`)
      .setFooter({ text: "Hoàn thành nhiệm vụ để nhận thưởng! 🎉" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    return;
  }

  // Hiển thị nhiệm vụ hiện tại
  const rows = activeQuests.map((q, i) => {
    const emoji = q.completed ? "✅" : "⏳";
    const progress = Math.min(q.progress, q.target);
    const bar = Array.from({ length: 10 }, (_, j) => j < Math.floor((progress / q.target) * 10) ? "🟡" : "⬜").join("");
    return `${emoji} ${q.description}\n   ${bar} ${progress}/${q.target} — **${formatVND(q.reward)}**`;
  }).join("\n\n");

  const completedCount = activeQuests.filter((q) => q.completed).length;
  const totalReward = activeQuests.filter((q) => q.completed).reduce((sum, q) => sum + q.reward, 0);

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("📋 Nhiệm Vụ Của Bạn")
    .setDescription(rows)
    .addFields(
      { name: "✅ Hoàn thành", value: `${completedCount}/${existingQuests.length}`, inline: true },
      { name: "💰 Thưởng sẵn sàng", value: totalReward > 0 ? formatVND(totalReward) : "0₫", inline: true }
    )
    .setFooter({ text: completedCount === existingQuests.length ? "Nhận thưởng bằng /nhiemvu-nhan! 🎉" : "Cố lên! 💪" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
