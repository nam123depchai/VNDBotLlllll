import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { db, fishInventoryTable, userFishingGearTable, discordUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getOrCreateUser, addXp } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";
import { unlockAchievement } from "./thanhtich.js";

// ====== FISH DATABASE ======
// Rod level unlocks more fish. Bait increases rare fish chance.
const FISH_DATABASE = {
  // Common fish (rod level 0+)
  common: [
    { name: "Cá Rẻ", emoji: "🐟", value: 50_000, weight: 35, xp: 10 },
    { name: "Cá Trung", emoji: "🐠", value: 200_000, weight: 25, xp: 25 },
    { name: "Cá Mực", emoji: "🦁", value: 300_000, weight: 20, xp: 30 },
    { name: "Cá Trắng", emoji: "◯", value: 80_000, weight: 15, xp: 15 },
  ],
  // Uncommon (rod level 1+)
  uncommon: [
    { name: "Cá Quý", emoji: "🐡", value: 1_000_000, weight: 12, xp: 50 },
    { name: "Cá Hồng", emoji: "🎭", value: 800_000, weight: 10, xp: 45 },
    { name: "Cá Kiếm", emoji: "⚔️", value: 1_500_000, weight: 8, xp: 60 },
  ],
  // Rare (rod level 2+)
  rare: [
    { name: "Cá Huyền Thoại", emoji: "🦈", value: 10_000_000, weight: 5, xp: 100 },
    { name: "Cá Rồng", emoji: "🐉", value: 25_000_000, weight: 3, xp: 200 },
    { name: "Cá Vàng", emoji: "🐋", value: 50_000_000, weight: 2, xp: 250 },
  ],
  // Legendary (rod level 3+)
  legendary: [
    { name: "Cá Thần", emoji: "👑", value: 100_000_000, weight: 1, xp: 500 },
    { name: "Cá Vũ Trụ", emoji: "🌌", value: 500_000_000, weight: 0.5, xp: 1000 },
  ],
  // Trash
  trash: [
    { name: "Rác", emoji: "🗑️", value: 0, weight: 8, xp: 0 },
    { name: "Giày Cũ", emoji: "🩾", value: 0, weight: 5, xp: 0 },
    { name: "Chai Nhựa", emoji: "🣩", value: 0, weight: 3, xp: 0 },
  ],
};

type FishRarity = "common" | "uncommon" | "rare" | "legendary" | "trash";

function getAvailableFish(rodLevel: number): { fish: typeof FISH_DATABASE.common[0]; rarity: FishRarity }[] {
  const result: { fish: typeof FISH_DATABASE.common[0]; rarity: FishRarity }[] = [];

  // Trash always available
  for (const f of FISH_DATABASE.trash) {
    result.push({ fish: f, rarity: "trash" });
  }

  // Common always available
  for (const f of FISH_DATABASE.common) {
    result.push({ fish: f, rarity: "common" });
  }

  if (rodLevel >= 1) {
    for (const f of FISH_DATABASE.uncommon) {
      result.push({ fish: f, rarity: "uncommon" });
    }
  }

  if (rodLevel >= 2) {
    for (const f of FISH_DATABASE.rare) {
      result.push({ fish: f, rarity: "rare" });
    }
  }

  if (rodLevel >= 3) {
    for (const f of FISH_DATABASE.legendary) {
      result.push({ fish: f, rarity: "legendary" });
    }
  }

  return result;
}

function rollFish(rodLevel: number, hasBait: boolean): { fish: typeof FISH_DATABASE.common[0]; rarity: FishRarity } {
  const pool = getAvailableFish(rodLevel);

  // Calculate total weight
  let totalWeight = 0;
  const weighted = pool.map((p) => {
    let weight = p.fish.weight;
    // Bait boosts rare fish
    if (hasBait && ["rare", "legendary", "uncommon"].includes(p.rarity)) {
      weight *= 2;
    }
    // Rod level boosts higher rarity
    if (rodLevel >= 2 && ["rare", "legendary"].includes(p.rarity)) {
      weight *= 1.5;
    }
    if (rodLevel >= 3 && p.rarity === "legendary") {
      weight *= 2;
    }
    totalWeight += weight;
    return { ...p, weight };
  });

  const roll = Math.random() * totalWeight;
  let cumulative = 0;

  for (const p of weighted) {
    cumulative += p.weight;
    if (roll <= cumulative) {
      return { fish: p.fish, rarity: p.rarity };
    }
  }

  return weighted[0]!;
}

const COOLDOWN_MS = 30 * 1000;
const fishingCooldowns = new Map<string, number>();

export const data = new SlashCommandBuilder()
  .setName("cauca")
  .setDescription("Câu cá kiếm tiền! Cần mua cần câu và mồi từ /shopcauca");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await getOrCreateUser(interaction.user.id, interaction.user.username);

  // Check gear
  const gear = await db
    .select()
    .from(userFishingGearTable)
    .where(eq(userFishingGearTable.discordId, interaction.user.id))
    .limit(1);

  if (gear.length === 0 || !gear[0]!.hasRod) {
    const buyEmbed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle("🎣 Câu cá")
      .setDescription(
        `Bạn chưa có cần câu!\n\n` +
        `Mua cần câu từ **/shopcauca**\n` +
        `Số dư: ${formatVND(user.balance)}`
      );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("goto_shop")
        .setLabel("Đi Shop Câu Cá")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🎣"),
      new ButtonBuilder()
        .setCustomId("cancel_fish")
        .setLabel("Để sau")
        .setStyle(ButtonStyle.Secondary)
    );

    const reply = await interaction.reply({ embeds: [buyEmbed], components: [row], ephemeral: true });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 30_000,
    });

    collector.on("collect", async (i) => {
      if (i.user.id !== interaction.user.id) {
        await i.reply({ content: "Không phải của bạn!", ephemeral: true });
        return;
      }

      if (i.customId === "cancel_fish") {
        await i.update({ content: "Để sau nhé!", embeds: [], components: [] });
        return;
      }

      if (i.customId === "goto_shop") {
        await i.update({
          content: "Dùng lệnh **/shopcauca** để mua cần câu và mồi!",
          embeds: [],
          components: [],
        });
      }
    });

    return;
  }

  const g = gear[0]!;

  // Check cooldown
  const lastFish = fishingCooldowns.get(interaction.user.id);
  if (lastFish && Date.now() - lastFish < COOLDOWN_MS) {
    const remaining = Math.ceil((COOLDOWN_MS - (Date.now() - lastFish)) / 1000);
    await interaction.reply({
      content: `⏰ Đợi ${remaining}s nữa để câu tiếp!`,
      ephemeral: true,
    });
    return;
  }

  // Check bait
  const hasBait = g.bait > 0;

  fishingCooldowns.set(interaction.user.id, Date.now());

  // Use bait if available
  if (hasBait) {
    await db
      .update(userFishingGearTable)
      .set({ bait: g.bait - 1 })
      .where(eq(userFishingGearTable.id, g.id));
  }

  // Fishing animation
  await interaction.reply("🎣 Đang thả câu... 🌊");

  await new Promise((r) => setTimeout(r, 2000));

  // Roll fish
  const result = rollFish(g.rodLevel, hasBait);
  const caught = result.fish;

  if (caught.name === "Rác" || caught.name === "Giày Cũ" || caught.name === "Chai Nhựa") {
    const embed = new EmbedBuilder()
      .setColor(0x888888)
      .setTitle(`${caught.emoji} Cứt câu!`)
      .setDescription(`Bạn câu được... **${caught.name}**. Không sao, lần sau may mắn hơn!`)
      .setFooter({ text: hasBait ? "Mồi câu đã dùng, lần sau nhẹ nhàng hơn!" : "Nước ô nhiễm quá 😂" });

    await interaction.editReply({ content: "", embeds: [embed] });
    return;
  }

  // Add to inventory
  const existing = await db
    .select()
    .from(fishInventoryTable)
    .where(eq(fishInventoryTable.discordId, interaction.user.id))
    .where(eq(fishInventoryTable.fishName, caught.name));

  if (existing.length > 0) {
    await db
      .update(fishInventoryTable)
      .set({ quantity: existing[0]!.quantity + 1 })
      .where(eq(fishInventoryTable.id, existing[0]!.id));
  } else {
    await db.insert(fishInventoryTable).values({
      discordId: interaction.user.id,
      fishName: caught.name,
      emoji: caught.emoji,
      value: caught.value,
      quantity: 1,
    });
  }

  // Update stats
  await db
    .update(userFishingGearTable)
    .set({ totalFishCaught: g.totalFishCaught + 1 })
    .where(eq(userFishingGearTable.id, g.id));

  await addXp(interaction.user.id, caught.xp);
  if (g.totalFishCaught + 1 >= 50) await unlockAchievement(interaction.user.id, "fisher");

  const rarityColor = {
    common: 0x888888,
    uncommon: 0x00aa00,
    rare: 0x0088ff,
    legendary: 0xffd700,
  };

  const rarityText = {
    common: "Phổ thông",
    uncommon: "Hiếm",
    rare: "Cực hiếm",
    legendary: "Huyền thoại",
  };

  const embed = new EmbedBuilder()
    .setColor(rarityColor[result.rarity] ?? 0x00ff88)
    .setTitle(`${caught.emoji} Bắt được ${caught.name}!`)
    .setDescription(
      `🎯 **Độ hiếm:** ${rarityText[result.rarity]}\n` +
      `💰 Giá trị: ${formatVND(caught.value)}\n` +
      `✨ XP: +${caught.xp}\n` +
      `${hasBait ? "🪱 Đã dùng mồi câu!" : ""}\n\n` +
      `Cả từ kho để bán hoặc giữ làm kỷ niệm!`
    )
    .setFooter({ text: `Dùng /banca để bán | Cần level ${g.rodLevel} | Mồi còn: ${hasBait ? g.bait - 1 : g.bait}` });

  await interaction.editReply({ content: "", embeds: [embed] });
}
