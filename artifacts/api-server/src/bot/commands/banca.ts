import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { db, fishInventoryTable, discordUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getOrCreateUser } from "../utils/db-helpers";
import { formatVND } from "../utils/currency";

export const data = new SlashCommandBuilder()
  .setName("banca")
  .setDescription("Bán cá trong túi đồ để kiếm tiền");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const fish = await db
    .select()
    .from(fishInventoryTable)
    .where(eq(fishInventoryTable.discordId, interaction.user.id));

  if (fish.length === 0) {
    await interaction.reply({
      content: "🧹 Bạn không có cá để bán! Dùng /cauca để bắt cá.",
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xffaa00)
    .setTitle("🐟 Bán Cá")
    .setDescription("Chọn cá để bán hoặc bán tất cả.");

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let row = new ActionRowBuilder<ButtonBuilder>();
  let totalValue = 0;

  for (const f of fish) {
    totalValue += f.value * f.quantity;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`sell_all_${f.id}`)
        .setLabel(`${f.fishName} x${f.quantity}`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji(f.emoji)
    );
    if (row.components.length === 3) {
      rows.push(row);
      row = new ActionRowBuilder<ButtonBuilder>();
    }
  }
  if (row.components.length > 0) rows.push(row);

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("sell_all_fish")
        .setLabel(`Bán tất cả (${formatVND(totalValue)})`)
        .setStyle(ButtonStyle.Danger)
        .setEmoji("💰")
    )
  );

  const reply = await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
  });

  collector.on("collect", async (i) => {
    if (i.user.id !== interaction.user.id) {
      await i.reply({ content: "Không phải của bạn!", ephemeral: true });
      return;
    }

    const user = await getOrCreateUser(interaction.user.id, interaction.user.username);

    if (i.customId === "sell_all_fish") {
      // Sell all
      let earned = 0;
      for (const f of fish) {
        earned += f.value * f.quantity;
      }
      await db.delete(fishInventoryTable).where(eq(fishInventoryTable.discordId, interaction.user.id));
      await db
        .update(discordUsersTable)
        .set({ balance: user.balance + earned, updatedAt: new Date() })
        .where(eq(discordUsersTable.discordId, interaction.user.id));

      await i.update({
        content: `💰 Đã bán tất cả cá! +${formatVND(earned)}`,
        embeds: [],
        components: [],
      });
      return;
    }

    const fishId = parseInt(i.customId.replace("sell_all_", ""), 10);
    const target = fish.find((f) => f.id === fishId);
    if (!target) return;

    const earned = target.value * target.quantity;
    await db.delete(fishInventoryTable).where(eq(fishInventoryTable.id, fishId));
    await db
      .update(discordUsersTable)
      .set({ balance: user.balance + earned, updatedAt: new Date() })
      .where(eq(discordUsersTable.discordId, interaction.user.id));

    await i.update({
      content: `💰 Đã bán ${target.emoji} **${target.fishName}** x${target.quantity}! +${formatVND(earned)}`,
      embeds: [],
      components: [],
    });
  });
}
