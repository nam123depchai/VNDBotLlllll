import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { formatVND } from "../utils/currency.js";
import { db, jackpotTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const MAX_JACKPOT = 1_000_000_000;

export const data = new SlashCommandBuilder()
  .setName("hutixi")
  .setDescription("Xem nổ hũ Tài Xỉu hiện tại — ai trúng 3 xúc xắc giống nhau thì ăn cả!");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const rows = await db.select().from(jackpotTable).where(eq(jackpotTable.id, 1));

  let jackpot = rows[0];
  if (!jackpot) {
    await db.insert(jackpotTable).values({ id: 1, amount: 0, maxAmount: MAX_JACKPOT, updatedAt: new Date() });
    jackpot = { id: 1, amount: 0, maxAmount: MAX_JACKPOT, updatedAt: new Date() };
  }

  const progress = Math.floor((jackpot.amount / MAX_JACKPOT) * 100);
  const barLen = 20;
  const filled = Math.floor((progress / 100) * barLen);
  const bar = "🎰".repeat(filled) + "⬜".repeat(barLen - filled);

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("🎰 NỔ HŨ TÀI XỈU")
    .setDescription(`**Hũ hiện tại: ${formatVND(jackpot.amount)} / ${formatVND(MAX_JACKPOT)}**`)
    .addFields(
      { name: "📊 Tiến độ", value: `${bar} ${progress}%`, inline: false },
      { name: "🎲 Điều kiện trúng", value: "Quay được **3 xúc xắc giống nhau** (1-1-1, 2-2-2, 3-3-3, 4-4-4, 5-5-5, 6-6-6)", inline: false },
      { name: "💰 Cách tích lũy", value: "Mỗi lần cược **Tài Xỉu**, 5% số tiền cược được đóng góp vào hũ", inline: false }
    )
    .setFooter({ text: "Chơi /taixiu để thử vận may! 🎉" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
