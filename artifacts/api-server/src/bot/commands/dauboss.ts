import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { db, bossLeaderboardTable, discordUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getOrCreateUser, addXp } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";

const ENTRY_FEE = 100_000;
const BOSS_HP = 500;

const BOSS_NAMES = [
  "Rồng Lửa", "Quái Vật Băng", "Thần Rừng", "Ma Vương", "Titan Sấm",
  "Hydra Ba Đầu", "Rồng Vàng", "Quỷ Lăng", "Tướng Quân Xương", "Thần Biển"
];

export const data = new SlashCommandBuilder()
  .setName("dauboss")
  .setDescription("Chiến đấu với Boss để kiếm tiền!");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await getOrCreateUser(interaction.user.id, interaction.user.username);

  if (user.balance < ENTRY_FEE) {
    await interaction.reply({
      content: `❌ Cần ${formatVND(ENTRY_FEE)} để vào đấu! Bạn chỉ có ${formatVND(user.balance)}.`,
      ephemeral: true,
    });
    return;
  }

  // Deduct entry fee
  await db
    .update(discordUsersTable)
    .set({ balance: user.balance - ENTRY_FEE, updatedAt: new Date() })
    .where(eq(discordUsersTable.discordId, interaction.user.id));

  const bossName = BOSS_NAMES[Math.floor(Math.random() * BOSS_NAMES.length)]!;
  let bossHp = BOSS_HP;
  let totalDamage = 0;
  let hits = 0;
  let log = "";

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle(`⚔️ Đấu Boss: ${bossName}`)
    .setDescription(
      `**HP Boss:** ${bossHp}/${BOSS_HP}\n` +
      `**Phí vào:** ${formatVND(ENTRY_FEE)}\n\n` +
      `Nhấn ĐÁNH để tấn công!`
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("boss_hit").setLabel("ĐÁNH!").setStyle(ButtonStyle.Danger).setEmoji("⚔️"),
    new ButtonBuilder().setCustomId("boss_run").setLabel("Bỏ chạy").setStyle(ButtonStyle.Secondary)
  );

  const reply = await interaction.reply({ embeds: [embed], components: [row] });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
  });

  collector.on("collect", async (i) => {
    if (i.user.id !== interaction.user.id) {
      await i.reply({ content: "Không phải trận đấu của bạn!", ephemeral: true });
      return;
    }

    if (i.customId === "boss_run") {
      await i.update({
        content: `💨 Bạn đã bỏ chạy! Mất ${formatVND(ENTRY_FEE)}.`,
        embeds: [],
        components: [],
      });
      return;
    }

    // Hit
    const isCrit = Math.random() < 0.15;
    const isSuperCrit = Math.random() < 0.05;
    const multiplier = isSuperCrit ? 3 : isCrit ? 2 : 1;
    const damage = Math.floor((Math.random() * 50 + 10) * multiplier);
    bossHp -= damage;
    totalDamage += damage;
    hits++;

    const critText = isSuperCrit ? " 🔥🔥 SUPER CRIT!!" : isCrit ? " 🔥 CRIT!" : "";
    log += `Hit ${hits}: ${damage} dmg${critText}\n`;

    if (bossHp <= 0) {
      // Win
      const reward = Math.floor(500_000 + Math.random() * 4_500_000);
      const updated = await getOrCreateUser(interaction.user.id, interaction.user.username);
      await db
        .update(discordUsersTable)
        .set({ balance: updated.balance + reward, updatedAt: new Date() })
        .where(eq(discordUsersTable.discordId, interaction.user.id));

      await addXp(interaction.user.id, 100);

      // Update leaderboard
      const lb = await db
        .select()
        .from(bossLeaderboardTable)
        .where(eq(bossLeaderboardTable.discordId, interaction.user.id))
        .limit(1);

      if (lb.length > 0) {
        await db
          .update(bossLeaderboardTable)
          .set({
            bossKills: lb[0]!.bossKills + 1,
            totalDamage: lb[0]!.totalDamage + totalDamage,
            highestDamage: Math.max(lb[0]!.highestDamage, totalDamage),
            updatedAt: new Date(),
          })
          .where(eq(bossLeaderboardTable.id, lb[0]!.id));
      } else {
        await db.insert(bossLeaderboardTable).values({
          discordId: interaction.user.id,
          username: interaction.user.username,
          bossKills: 1,
          totalDamage,
          highestDamage: totalDamage,
        });
      }

      const winEmbed = new EmbedBuilder()
        .setColor(0x00ff88)
        .setTitle(`🎉 ${bossName} ĐÃ BỊ HẠ!`)
        .setDescription(
          `**Tổng damage:** ${totalDamage.toLocaleString()}\n` +
          `**Số hit:** ${hits}\n` +
          `**Phần thưởng:** ${formatVND(reward)} 🎊\n\n` +
          `Số dư mới: ${formatVND(updated.balance + reward)}`
        )
        .setFooter({ text: "Boss mạnh quá, nhưng bạn còn mạnh hơn! 💪" });

      await i.update({ content: "", embeds: [winEmbed], components: [] });
      return;
    }

    // Continue
    const hpBar = "💚".repeat(Math.ceil(bossHp / 50)) + "💀".repeat(Math.ceil((BOSS_HP - bossHp) / 50));
    const updatedEmbed = new EmbedBuilder()
      .setColor(0xffaa00)
      .setTitle(`⚔️ Đấu Boss: ${bossName}`)
      .setDescription(
        `**HP Boss:** ${bossHp}/${BOSS_HP}\n${hpBar}\n\n` +
        `**Log tấn công:**\n${log.slice(-5)}\n` +
        `**Tổng damage:** ${totalDamage}`
      );

    await i.update({ embeds: [updatedEmbed], components: [row] });
  });

  collector.on("end", async () => {
    if (bossHp > 0) {
      await reply.edit({
        content: "⏰ Hết giờ! Boss còn sống. Bạn mất phí vào.",
        embeds: [],
        components: [],
      });
    }
  });
}
