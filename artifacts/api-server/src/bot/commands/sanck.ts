import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db, stocksTable } from "@workspace/db";
import { formatVND, formatVNDShort } from "../utils/currency.js";

export const data = new SlashCommandBuilder()
  .setName("sanck")
  .setDescription("Xem sàn chứng khoán và crypto");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const stocks = await db.select().from(stocksTable);

  if (stocks.length === 0) {
    await interaction.reply({
      content: "📉 Sàn đang bảo trì... vui lòng thử lại sau!",
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("📈 Sàn Chứng Khoán & Crypto")
    .setDescription("Giá cập nhật mỗi 5 phút. Mua thấp, bán cao!")
    .setTimestamp();

  const stockLines = stocks.map(s => {
    const change = s.price - s.prevPrice;
    const pct = s.prevPrice > 0 ? ((change / s.prevPrice) * 100).toFixed(2) : "0.00";
    const arrow = change >= 0 ? "📈" : "📉";
    const color = change >= 0 ? "🟢" : "🔴";
    return `${arrow} ${color} **${s.symbol}** — ${formatVNDShort(s.price)} (${change >= 0 ? "+" : ""}${pct}%)`;
  });

  embed.addFields({
    name: "📊 Danh sách",
    value: stockLines.join("\n"),
  });

  embed.setFooter({ text: "Dùng /muack để mua, /banck để bán, /dautu để xem danh mục" });

  await interaction.reply({ embeds: [embed] });
}
