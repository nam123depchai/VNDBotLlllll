import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db, userCoinsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { formatVND } from "../utils/currency.js";

function pctChange(current: number, prev: number): string {
  if (prev === 0) return "0.00%";
  const pct = ((current - prev) / prev) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

export const data = new SlashCommandBuilder()
  .setName("chocoin")
  .setDescription("🏪 Xem danh sách coin do người dùng tự tạo");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const coins = await db.select().from(userCoinsTable)
    .where(eq(userCoinsTable.isActive, true))
    .orderBy(desc(userCoinsTable.createdAt))
    .limit(20);

  if (coins.length === 0) {
    await interaction.editReply({
      content: "📭 Chưa có ai tạo coin riêng nào! Dùng **/taocoin** để là người đầu tiên.",
    });
    return;
  }

  let desc_text = "";
  for (const c of coins) {
    const up = c.price >= c.prevPrice;
    const icon = up ? "🟢" : "🔴";
    desc_text += `${icon} ${c.emoji} **${c.symbol}** — ${c.name}\n`;
    desc_text += `> 💵 ${formatVND(c.price)} (${pctChange(c.price, c.prevPrice)}) • 👤 <@${c.creatorId}>\n`;
  }

  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("🏪 Chợ Coin Tự Tạo")
    .setDescription(desc_text)
    .setFooter({ text: "/muacoin <mã> <số lượng> để mua • /taocoin để tạo coin của riêng bạn" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
