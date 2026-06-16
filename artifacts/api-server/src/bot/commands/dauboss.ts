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
const PLAYER_MAX_HP = 200;

type Rarity = "Thường" | "Hiếm" | "Huyền Thoại";

interface BossTier {
  rarity: Rarity;
  color: number;
  weight: number;
  hp: number;
  atkMin: number;
  atkMax: number;
  rewardMin: number;
  rewardMax: number;
  xp: number;
}

const TIERS: BossTier[] = [
  { rarity: "Thường", color: 0xff0000, weight: 70, hp: 450, atkMin: 8, atkMax: 22, rewardMin: 400_000, rewardMax: 2_000_000, xp: 80 },
  { rarity: "Hiếm", color: 0x8a2be2, weight: 25, hp: 800, atkMin: 14, atkMax: 32, rewardMin: 1_500_000, rewardMax: 6_000_000, xp: 180 },
  { rarity: "Huyền Thoại", color: 0xffd700, weight: 5, hp: 1400, atkMin: 20, atkMax: 45, rewardMin: 5_000_000, rewardMax: 20_000_000, xp: 400 },
];

const BOSS_NAMES: Record<Rarity, string[]> = {
  "Thường": ["Rồng Lửa", "Quái Vật Băng", "Thần Rừng", "Ma Vương", "Tướng Quân Xương"],
  "Hiếm": ["Hydra Ba Đầu", "Rồng Vàng", "Quỷ Lăng", "Thần Biển", "Chúa Tể Bóng Tối"],
  "Huyền Thoại": ["Tử Thần Vô Diện", "Long Vương Tận Thế", "Ác Thần Cổ Đại"],
};

function pickTier(): BossTier {
  const total = TIERS.reduce((s, t) => s + t.weight, 0);
  let roll = Math.random() * total;
  for (const t of TIERS) {
    if (roll < t.weight) return t;
    roll -= t.weight;
  }
  return TIERS[0]!;
}

function hpBarOf(current: number, max: number, segments = 10): string {
  const filled = Math.max(0, Math.round((current / max) * segments));
  return "🟩".repeat(filled) + "🟥".repeat(segments - filled);
}

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

  await db
    .update(discordUsersTable)
    .set({ balance: user.balance - ENTRY_FEE, updatedAt: new Date() })
    .where(eq(discordUsersTable.discordId, interaction.user.id));

  const tier = pickTier();
  const names = BOSS_NAMES[tier.rarity];
  const bossName = names[Math.floor(Math.random() * names.length)]!;

  let bossHp = tier.hp;
  let playerHp = PLAYER_MAX_HP;
  let totalDamage = 0;
  let hits = 0;
  let healCharges = 2;
  let heavyOnCooldown = false;
  let log: string[] = [];
  let ended = false;

  const rarityTag = tier.rarity === "Huyền Thoại" ? "🌟 HUYỀN THOẠI 🌟" : tier.rarity === "Hiếm" ? "💎 HIẾM" : "";

  function buildRow(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("boss_hit").setLabel("Đánh").setStyle(ButtonStyle.Danger).setEmoji("⚔️"),
      new ButtonBuilder()
        .setCustomId("boss_heavy")
        .setLabel(heavyOnCooldown ? "Chiêu Mạnh (hồi chiêu)" : "Chiêu Mạnh")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("💥")
        .setDisabled(heavyOnCooldown),
      new ButtonBuilder()
        .setCustomId("boss_heal")
        .setLabel(`Hồi Máu (${healCharges})`)
        .setStyle(ButtonStyle.Success)
        .setEmoji("❤️")
        .setDisabled(healCharges <= 0),
      new ButtonBuilder().setCustomId("boss_run").setLabel("Bỏ chạy").setStyle(ButtonStyle.Secondary)
    );
  }

  function buildEmbed(title: string, color: number, extra?: string): EmbedBuilder {
    const enraged = bossHp <= tier.hp * 0.25;
    return new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(
        `${rarityTag ? rarityTag + "\n" : ""}` +
        `**Boss HP:** ${Math.max(bossHp, 0)}/${tier.hp}\n${hpBarOf(bossHp, tier.hp)}\n` +
        `**Máu của bạn:** ${Math.max(playerHp, 0)}/${PLAYER_MAX_HP}\n${hpBarOf(playerHp, PLAYER_MAX_HP)}\n` +
        (enraged && bossHp > 0 ? `\n⚠️ **Boss nổi điên! Sát thương tăng mạnh!**\n` : "") +
        `\n**Log:**\n${log.slice(-4).join("\n") || "—"}\n` +
        `**Tổng damage:** ${totalDamage}` +
        (extra ? `\n\n${extra}` : "")
      );
  }

  const reply = await interaction.reply({
    embeds: [buildEmbed(`⚔️ Đấu Boss: ${bossName}`, tier.color, "Chọn hành động!")],
    components: [buildRow()],
  });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 90_000,
  });

  async function finishWin(i: any) {
    ended = true;
    collector.stop();
    const reward = Math.floor(tier.rewardMin + Math.random() * (tier.rewardMax - tier.rewardMin));
    const updated = await getOrCreateUser(interaction.user.id, interaction.user.username);
    await db
      .update(discordUsersTable)
      .set({ balance: updated.balance + reward, updatedAt: new Date() })
      .where(eq(discordUsersTable.discordId, interaction.user.id));

    await addXp(interaction.user.id, tier.xp);

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
      .setTitle(`🎉 ${bossName} ĐÃ BỊ HẠ!${rarityTag ? " " + rarityTag : ""}`)
      .setDescription(
        `**Tổng damage:** ${totalDamage.toLocaleString()}\n` +
        `**Số hit:** ${hits}\n` +
        `**Máu còn lại:** ${Math.max(playerHp, 0)}/${PLAYER_MAX_HP}\n` +
        `**Phần thưởng:** ${formatVND(reward)} 🎊\n\n` +
        `Số dư mới: ${formatVND(updated.balance + reward)}`
      )
      .setFooter({ text: "Boss mạnh quá, nhưng bạn còn mạnh hơn! 💪" });

    await i.update({ content: "", embeds: [winEmbed], components: [] });
  }

  async function finishLose(i: any) {
    ended = true;
    collector.stop();
    const loseEmbed = new EmbedBuilder()
      .setColor(0x444444)
      .setTitle(`💀 Bạn đã bị ${bossName} hạ gục!`)
      .setDescription(
        `**Tổng damage gây ra:** ${totalDamage.toLocaleString()}\n` +
        `Bạn mất ${formatVND(ENTRY_FEE)} phí vào trận. Thử lại lần sau nhé!`
      );
    await i.update({ content: "", embeds: [loseEmbed], components: [] });
  }

  collector.on("collect", async (i) => {
    if (i.user.id !== interaction.user.id) {
      await i.reply({ content: "Không phải trận đấu của bạn!", ephemeral: true });
      return;
    }
    if (ended) return;

    if (i.customId === "boss_run") {
      ended = true;
      collector.stop();
      await i.update({
        content: `💨 Bạn đã bỏ chạy! Mất ${formatVND(ENTRY_FEE)}.`,
        embeds: [],
        components: [],
      });
      return;
    }

    const enraged = bossHp <= tier.hp * 0.25;

    if (i.customId === "boss_heal") {
      if (healCharges <= 0) {
        await i.deferUpdate();
        return;
      }
      healCharges--;
      const healed = Math.floor(40 + Math.random() * 30);
      playerHp = Math.min(PLAYER_MAX_HP, playerHp + healed);
      log.push(`💚 Bạn hồi ${healed} HP`);
    } else {
      const isHeavy = i.customId === "boss_heavy";
      if (isHeavy) {
        if (heavyOnCooldown) {
          await i.deferUpdate();
          return;
        }
        heavyOnCooldown = true;
      }

      const isCrit = Math.random() < (isHeavy ? 0.25 : 0.15);
      const isSuperCrit = Math.random() < 0.05;
      const multiplier = isSuperCrit ? 3 : isCrit ? 2 : 1;
      const base = isHeavy ? Math.random() * 60 + 35 : Math.random() * 50 + 10;
      const damage = Math.floor(base * multiplier);
      bossHp -= damage;
      totalDamage += damage;
      hits++;

      const critText = isSuperCrit ? " 🔥🔥 SUPER CRIT!!" : isCrit ? " 🔥 CRIT!" : "";
      log.push(`${isHeavy ? "💥 Chiêu mạnh" : "⚔️ Đánh"}: ${damage} dmg${critText}`);

      if (bossHp <= 0) {
        await finishWin(i);
        return;
      }

      if (isHeavy) {
        setTimeout(() => { heavyOnCooldown = false; }, 12_000);
      }

      // Boss retaliates
      const bossDmg = Math.floor((tier.atkMin + Math.random() * (tier.atkMax - tier.atkMin)) * (enraged ? 1.6 : 1));
      playerHp -= bossDmg;
      log.push(`👹 ${bossName} phản công: ${bossDmg} dmg${enraged ? " (nổi điên)" : ""}`);

      if (playerHp <= 0) {
        await finishLose(i);
        return;
      }
    }

    await i.update({
      embeds: [buildEmbed(`⚔️ Đấu Boss: ${bossName}`, enraged ? 0xff5500 : tier.color)],
      components: [buildRow()],
    });
  });

  collector.on("end", async () => {
    if (!ended && bossHp > 0) {
      await reply.edit({
        content: "⏰ Hết giờ! Boss còn sống. Bạn mất phí vào.",
        embeds: [],
        components: [],
      });
    }
  });
}
