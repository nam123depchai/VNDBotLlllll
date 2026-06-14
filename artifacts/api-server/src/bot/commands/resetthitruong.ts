import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { db, stocksTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const INITIAL_STOCKS = [
  { symbol: "VND", price: 50_000 },
  { symbol: "FPT", price: 120_000 },
  { symbol: "VCB", price: 85_000 },
  { symbol: "HPG", price: 35_000 },
  { symbol: "MWG", price: 200_000 },
  { symbol: "BTC", price: 2_500_000_000 },
  { symbol: "ETH", price: 150_000_000 },
  { symbol: "DOGE", price: 500_000 },
  { symbol: "SHIB", price: 50_000 },
  { symbol: "SOL", price: 8_000_000 },
];

export const data = new SlashCommandBuilder()
  .setName("resetthitruong")
  .setDescription("⚠️ ADMIN: Reset giá thị trường về giá trị ban đầu (chỉ khi lạm phát quá cao)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "❌ Bạn không có quyền Administrator!",
      ephemeral: true,
    });
    return;
  }

  for (const s of INITIAL_STOCKS) {
    const stock = await db
      .select()
      .from(stocksTable)
      .where(eq(stocksTable.symbol, s.symbol))
      .limit(1);

    if (stock.length > 0) {
      await db
        .update(stocksTable)
        .set({
          price: s.price,
          prevPrice: s.price,
          updatedAt: new Date(),
        })
        .where(eq(stocksTable.id, stock[0]!.id));
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("🚨 RESET THỊ TRƯỜNG")
    .setDescription(
      "Giá chứng khoán và crypto đã được reset về giá trị ban đầu!\n\n" +
      "⚠️ Chỉ sử dụng khi lạm phát quá cao.\n" +
      "📊 Các nhà đầu tư sẽ được thông báo."
    )
    .setFooter({ text: `Reset bởi ${interaction.user.username}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
