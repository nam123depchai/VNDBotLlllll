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
import { getOrCreateUser } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";

const ROD_PRICE = 500_000;

const FISH_TYPES = [
  { name: "Cá Rẻ", emoji: "🐟", value: 50_000, weight: 40, xp: 10 },
  { name: "Cá Trung", emoji: "🐠", value: 200_000, weight: 30, xp: 25 },
  { name: "Cá Quý", emoji: "🐡", value: 1_000_000, weight: 15, xp: 50 },
  { name: "Cá Huyền Thoại", emoji: "🦈", value: 10_000_000, weight: 10, xp: 100 },
  { name: "Cá Vàng", emoji: "🐋", value: 50_000_000, weight: 4, xp: 250 },
  { name: "Rác", emoji: "🗑️", value: 0, weight: 1, xp: 0 },
];

const COOLDOWN_MS = 30 * 1000;
const fishingCooldowns = new Map<string, number>();

export const data = new SlashCommandBuilder()
  .setName("cauca")
  .setDescription("Câu cá kiếm tiền! Cần mua cần câu trước.");

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
        `💰 Giá cần câu: ${formatVND(ROD_PRICE)}\n` +
        `Số dư: ${formatVND(user.balance)}`
      );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("buy_rod")
        .setLabel("Mua cần câu")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🎣"),
      new ButtonBuilder()
        .setCustomId("cancel_fish")
        .setLabel("Thôi")
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
        await i.update({ content: "Đã hủy.", embeds: [], components: [] });
        return;
      }

      if (i.customId === "buy_rod") {
        const updated = await getOrCreateUser(interaction.user.id, interaction.user.username);
        if (updated.balance < ROD_PRICE) {
          await i.update({
            content: `❌ Không đủ tiền! Cần ${formatVND(ROD_PRICE)}.`,
            embeds: [],
            components: [],
          });
          return;
        }

        await db
          .update(discordUsersTable)
          .set({ balance: updated.balance - ROD_PRICE, updatedAt: new Date() })
          .where(eq(discordUsersTable.discordId, interaction.user.id));

        await db.insert(userFishingGearTable).values({
          discordId: interaction.user.id,
          hasRod: true,
          rodLevel: 1,
        });

        await i.update({
          content: "🎣 Đã mua cần câu! Dùng /cauca để bắt đầu câu.",
          embeds: [],
          components: [],
        });
      }
    });

    return;
  }

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

  fishingCooldowns.set(interaction.user.id, Date.now());

  // Fishing animation
  await interaction.reply("🎣 Đang thả câu... 🌊");

  await new Promise((r) => setTimeout(r, 2000));

  // Random catch
  const roll = Math.random() * 100;
  let cumulative = 0;
  let caught = FISH_TYPES[0]!;
  for (const fish of FISH_TYPES) {
    cumulative += fish.weight;
    if (roll <= cumulative) {
      caught = fish;
      break;
    }
  }

  if (caught.name === "Rác") {
    const embed = new EmbedBuilder()
      .setColor(0x888888)
      .setTitle("🗑️ Cứt câu!")
      .setDescription("Bạn câu được... một túi rác. Không sao, lần sau may mắn hơn!")
      .setFooter({ text: "Nước ô nhiễm quá 😂" });

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

  // Update total caught
  await db
    .update(userFishingGearTable)
    .set({ totalFishCaught: (gear[0]?.totalFishCaught || 0) + 1 })
    .where(eq(userFishingGearTable.discordId, interaction.user.id));

  const embed = new EmbedBuilder()
    .setColor(0x00ff88)
    .setTitle(`${caught.emoji} Bắt được ${caught.name}!`)
    .setDescription(
      `Giá trị: ${formatVND(caught.value)}\n` +
      `XP: +${caught.xp}\n\n` +
      `Câu được từ kho để bán hoặc giữ làm kỷ niệm!`
    )
    .setFooter({ text: "Dùng /tuido để xem kho cá" });

  await interaction.editReply({ content: "", embeds: [embed] });
}
