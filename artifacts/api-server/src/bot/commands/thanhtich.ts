import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db, achievementsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getOrCreateUser } from "../utils/db-helpers.js";

const ALL_ACHIEVEMENTS = [
  { key: "first_work", title: "Người lao động", description: "Đi làm lần đầu tiên", emoji: "💼" },
  { key: "rich_1m", title: "Triệu phú", description: "Đạt 1 triệu đồng", emoji: "💰" },
  { key: "rich_10m", title: "Chục triệu phú", description: "Đạt 10 triệu đồng", emoji: "💎" },
  { key: "rich_100m", title: "Trăm triệu phú", description: "Đạt 100 triệu đồng", emoji: "👑" },
  { key: "rich_1b", title: "Tỷ phú", description: "Đạt 1 tỷ đồng", emoji: "🌟" },
  { key: "gambler", title: "Con bạc", description: "Chơi Tài Xỉu 50 lần", emoji: "🎲" },
  { key: "high_roller", title: "High Roller", description: "Cược 1 triệu trong 1 lần", emoji: "🔥" },
  { key: "jackpot_winner", title: "Jackpot Winner", description: "Trúng hũ Tài Xỉu", emoji: "🎰" },
  { key: "daily_streak_7", title: "Chăm chỉ", description: "Daily streak 7 ngày", emoji: "📅" },
  { key: "daily_streak_30", title: "Siêng năng", description: "Daily streak 30 ngày", emoji: "🏆" },
  { key: "boss_killer", title: "Sát Boss", description: "Đánh bại 10 con boss", emoji: "⚔️" },
  { key: "fisher", title: "Ngư dân", description: "Bắt 50 con cá", emoji: "🎣" },
  { key: "trader", title: "Nhà đầu tư", description: "Giao dịch chứng khoán 10 lần", emoji: "📈" },
  { key: "level_10", title: "Veteran", description: "Đạt level 10", emoji: "🎖️" },
  { key: "level_50", title: "Legend", description: "Đạt level 50", emoji: "🏅" },
  { key: "level_100", title: "God", description: "Đạt level 100", emoji: "👑" },
];

export async function checkAchievement(discordId: string, key: string): Promise<boolean> {
  const existing = await db
    .select()
    .from(achievementsTable)
    .where(eq(achievementsTable.discordId, discordId))
    .where(eq(achievementsTable.achievementKey, key));

  if (existing.length > 0 && existing[0]!.unlocked) return true;
  if (existing.length === 0) {
    const def = ALL_ACHIEVEMENTS.find(a => a.key === key);
    if (def) {
      await db.insert(achievementsTable).values({
        discordId,
        achievementKey: key,
        title: def.title,
        description: def.description,
        unlocked: false,
      });
    }
  }
  return false;
}

export async function unlockAchievement(discordId: string, key: string): Promise<boolean> {
  const existing = await db
    .select()
    .from(achievementsTable)
    .where(eq(achievementsTable.discordId, discordId))
    .where(eq(achievementsTable.achievementKey, key));

  if (existing.length > 0 && existing[0]!.unlocked) return false;

  const def = ALL_ACHIEVEMENTS.find(a => a.key === key);
  if (!def) return false;

  if (existing.length === 0) {
    await db.insert(achievementsTable).values({
      discordId,
      achievementKey: key,
      title: def.title,
      description: def.description,
      unlocked: true,
      unlockedAt: new Date(),
    });
  } else {
    await db
      .update(achievementsTable)
      .set({ unlocked: true, unlockedAt: new Date() })
      .where(eq(achievementsTable.id, existing[0]!.id));
  }
  return true;
}

export const data = new SlashCommandBuilder()
  .setName("thanhtich")
  .setDescription("Xem danh sách thành tích của bạn")
  .addUserOption((option) =>
    option.setName("user").setDescription("Xem thành tích người khác").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const targetUser = interaction.options.getUser("user") || interaction.user;
  const user = await getOrCreateUser(targetUser.id, targetUser.username);

  // Ensure all achievements exist
  for (const def of ALL_ACHIEVEMENTS) {
    await checkAchievement(targetUser.id, def.key);
  }

  const unlocked = await db
    .select()
    .from(achievementsTable)
    .where(eq(achievementsTable.discordId, targetUser.id))
    .where(eq(achievementsTable.unlocked, true));

  const unlockedKeys = new Set(unlocked.map(a => a.achievementKey));

  let unlockedText = "";
  let lockedText = "";

  for (const def of ALL_ACHIEVEMENTS) {
    if (unlockedKeys.has(def.key)) {
      unlockedText += `${def.emoji} **${def.title}** — ${def.description}\n`;
    } else {
      lockedText += `🔒 ${def.title} — ${def.description}\n`;
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0xffaa00)
    .setTitle(`🏅 Thành tích của ${targetUser.username}`)
    .setDescription(
      `**Đã mở khóa:** ${unlocked.length}/${ALL_ACHIEVEMENTS.length}\n\n` +
      (unlockedText || "Chưa có thành tích nào...") +
      "\n**Chưa mở khóa:**\n" +
      (lockedText || "Tất cả đã mở khóa!")
    )
    .setThumbnail(targetUser.displayAvatarURL())
    .setFooter({ text: `Level ${user.level} | ${user.totalXp.toLocaleString()} XP` });

  await interaction.reply({ embeds: [embed] });
}
