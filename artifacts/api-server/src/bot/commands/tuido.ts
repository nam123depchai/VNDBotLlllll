import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db, fishInventoryTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { formatVND } from "../utils/currency.js";

export const data = new SlashCommandBuilder()
  .setName("tuido")
  .setDescription("Xem túi đồ / kho cá của bạn")
  .addUserOption((option) =>
    option.setName("user").setDescription("Xem túi đồ người khác").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const targetUser = interaction.options.getUser("user") || interaction.user;

  const fish = await db
    .select()
    .from(fishInventoryTable)
    .where(eq(fishInventoryTable.discordId, targetUser.id));

  if (fish.length === 0) {
    await interaction.reply({
      content: `🧹 ${targetUser.username} chưa có gì trong túi đồ. Dùng /cauca để bắt cá!`,
      ephemeral: true,
    });
    return;
  }

  let totalValue = 0;
  let lines = "";

  for (const f of fish) {
    totalValue += f.value * f.quantity;
    lines += `${f.emoji} **${f.fishName}** x${f.quantity} — ${formatVND(f.value * f.quantity)}\n`;
  }

  const embed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle(`🎢 Túi đồ — ${targetUser.username}`)
    .setDescription(lines + `\n**Tổng giá trị:** ${formatVND(totalValue)}`)
    .setFooter({ text: "Cá có thể bán để kiếm tiền!" });

  await interaction.reply({ embeds: [embed] });
}
