import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { db, bossPetTable, discordUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getOrCreateUser } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";

const FEED_COST = 200_000;
const FEED_EXP = 35;
const EXP_PER_LEVEL = 100; // exp cần để lên 1 cấp
const MAX_LEVEL = 20;

const PET_EMOJI: Record<string, string> = {
  cho: "🐶", meo: "🐱", rong: "🐲", phoenix: "🔥", ho: "🐯",
};

export const data = new SlashCommandBuilder()
  .setName("pet")
  .setDescription("🐾 Xem và nuôi pet đấu boss của bạn (chỉ dùng cho /dauboss)");

function buildEmbed(pet: typeof bossPetTable.$inferSelect, balance: number): EmbedBuilder {
  const emoji = PET_EMOJI[pet.petType] ?? "🐾";
  const expNeeded = EXP_PER_LEVEL;
  const atTop = pet.level >= MAX_LEVEL;

  return new EmbedBuilder()
    .setColor(0xff66cc)
    .setTitle(`${emoji} ${pet.name} — Lv.${pet.level}${atTop ? " (MAX)" : ""}`)
    .setDescription(
      `**EXP:** ${pet.exp}/${atTop ? "MAX" : expNeeded}\n\n` +
      `**Chỉ số khi đấu boss:**\n` +
      `⚔️ Tăng sát thương: +${pet.atkBonus}%\n` +
      `🛡️ Giảm dmg nhận: +${pet.defBonus}%\n` +
      `🔥 Tăng tỉ lệ Crit: +${pet.critBonus}%\n\n` +
      `💰 Số dư: ${formatVND(balance)}\n` +
      `🍖 Cho ăn: ${formatVND(FEED_COST)} → +${FEED_EXP} EXP`
    )
    .setFooter({ text: "Pet càng lên cấp, chỉ số càng mạnh khi /dauboss" });
}

function buildRow(petLevel: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("pet_feed")
      .setLabel("Cho Ăn")
      .setStyle(ButtonStyle.Success)
      .setEmoji("🍖")
      .setDisabled(petLevel >= MAX_LEVEL),
    new ButtonBuilder().setCustomId("pet_release").setLabel("Thả Pet").setStyle(ButtonStyle.Danger).setEmoji("👋"),
  );
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const user = await getOrCreateUser(userId, interaction.user.username);

  const petRows = await db.select().from(bossPetTable).where(eq(bossPetTable.discordId, userId)).limit(1);
  const pet = petRows[0];

  if (!pet) {
    await interaction.reply({
      content: "❌ Bạn chưa có pet nào! Dùng `/shopdauboss` để mua pet đầu tiên.",
      ephemeral: true,
    });
    return;
  }

  const reply = await interaction.reply({
    embeds: [buildEmbed(pet, user.balance)],
    components: [buildRow(pet.level)],
  });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
  });

  collector.on("collect", async (i) => {
    if (i.user.id !== userId) {
      await i.reply({ content: "Không phải pet của bạn!", ephemeral: true });
      return;
    }

    if (i.customId === "pet_release") {
      await db.delete(bossPetTable).where(eq(bossPetTable.discordId, userId));
      collector.stop();
      await i.update({
        content: `👋 Bạn đã thả **${pet.name}** đi. Tạm biệt!`,
        embeds: [],
        components: [],
      });
      return;
    }

    // pet_feed
    const latestUser = await getOrCreateUser(userId, interaction.user.username);
    if (latestUser.balance < FEED_COST) {
      await i.reply({ content: `❌ Cần ${formatVND(FEED_COST)} để cho pet ăn! Bạn chỉ có ${formatVND(latestUser.balance)}.`, ephemeral: true });
      return;
    }

    const latestPetRows = await db.select().from(bossPetTable).where(eq(bossPetTable.discordId, userId)).limit(1);
    const latestPet = latestPetRows[0];
    if (!latestPet || latestPet.level >= MAX_LEVEL) {
      await i.reply({ content: "Pet đã đạt cấp tối đa!", ephemeral: true });
      return;
    }

    await db.update(discordUsersTable)
      .set({ balance: latestUser.balance - FEED_COST, updatedAt: new Date() })
      .where(eq(discordUsersTable.discordId, userId));

    let newExp = latestPet.exp + FEED_EXP;
    let newLevel = latestPet.level;
    let newAtk = latestPet.atkBonus;
    let newDef = latestPet.defBonus;
    let newCrit = latestPet.critBonus;
    let leveledUp = false;

    while (newExp >= EXP_PER_LEVEL && newLevel < MAX_LEVEL) {
      newExp -= EXP_PER_LEVEL;
      newLevel++;
      leveledUp = true;
      // Mỗi cấp tăng nhẹ chỉ số nếu pet có hệ đó (>0)
      if (newAtk > 0) newAtk += 1;
      if (newDef > 0) newDef += 1;
      if (newCrit > 0) newCrit += 1;
    }
    if (newLevel >= MAX_LEVEL) newExp = 0;

    await db.update(bossPetTable)
      .set({ exp: newExp, level: newLevel, atkBonus: newAtk, defBonus: newDef, critBonus: newCrit, updatedAt: new Date() })
      .where(eq(bossPetTable.discordId, userId));

    const updatedPet = { ...latestPet, exp: newExp, level: newLevel, atkBonus: newAtk, defBonus: newDef, critBonus: newCrit };
    const refreshedUser = await getOrCreateUser(userId, interaction.user.username);

    await i.update({
      content: leveledUp ? `🎉 **${latestPet.name}** đã lên cấp ${newLevel}!` : "",
      embeds: [buildEmbed(updatedPet, refreshedUser.balance)],
      components: [buildRow(newLevel)],
    });
  });

  collector.on("end", () => {
    interaction.editReply({ components: [] }).catch(() => {});
  });
}
