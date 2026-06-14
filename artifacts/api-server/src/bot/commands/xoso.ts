import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db, lotteryTicketsTable, discordUsersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getOrCreateUser } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";

const TICKET_PRICE = 10_000;

export const data = new SlashCommandBuilder()
  .setName("xoso")
  .setDescription("Mua vé xổ số — trúng lớn!")
  .addStringOption((option) =>
    option
      .setName("so")
      .setDescription("Số dự đoán (1-3 chữ số)")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("loai")
      .setDescription("Loại vé")
      .setRequired(true)
      .addChoices(
        { name: "🎯 1 số (trúng = 10x)", value: "1" },
        { name: "🎯🎯 2 số (trúng = 100x)", value: "2" },
        { name: "🎯🎯🎯 3 số (trúng = 1000x)", value: "3" }
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const numberInput = interaction.options.getString("so", true).trim();
  const digits = parseInt(interaction.options.getString("loai", true), 10);

  const user = await getOrCreateUser(interaction.user.id, interaction.user.username);

  if (user.balance < TICKET_PRICE) {
    await interaction.reply({
      content: `❌ Cần ${formatVND(TICKET_PRICE)} để mua vé! Bạn chỉ có ${formatVND(user.balance)}.`,
      ephemeral: true,
    });
    return;
  }

  // Validate number
  const num = parseInt(numberInput, 10);
  if (isNaN(num) || num < 0 || num > 999) {
    await interaction.reply({
      content: "❌ Số không hợp lệ! Nhập số từ 0 đến 999.",
      ephemeral: true,
    });
    return;
  }

  const paddedNum = num.toString().padStart(3, "0");
  const selectedDigits = paddedNum.slice(3 - digits);

  // Deduct ticket price
  await db
    .update(discordUsersTable)
    .set({ balance: user.balance - TICKET_PRICE, updatedAt: new Date() })
    .where(eq(discordUsersTable.discordId, interaction.user.id));

  // Draw (random)
  const drawResult = Math.floor(Math.random() * 1000).toString().padStart(3, "0");

  let matched = 0;
  for (let i = 0; i < digits; i++) {
    if (selectedDigits[digits - 1 - i] === drawResult[2 - i]) {
      matched++;
    } else {
      break;
    }
  }

  const multipliers = [0, 10, 100, 1000];
  const prize = matched >= digits ? TICKET_PRICE * multipliers[digits] : 0;

  // Award prize if won
  if (prize > 0) {
    const updated = await getOrCreateUser(interaction.user.id, interaction.user.username);
    await db
      .update(discordUsersTable)
      .set({ balance: updated.balance + prize, updatedAt: new Date() })
      .where(eq(discordUsersTable.discordId, interaction.user.id));
  }

  // Save ticket
  await db.insert(lotteryTicketsTable).values({
    discordId: interaction.user.id,
    numbers: paddedNum,
    digits,
    drawDate: new Date(),
    matched,
    won: prize > 0,
    prize,
  });

  const embed = new EmbedBuilder()
    .setColor(prize > 0 ? 0x00ff88 : 0xff4444)
    .setTitle(prize > 0 ? "🎉 TRÚNG SỐ!!!" : "😢 Không trúng")
    .setDescription(
      `**Kết quả quay:** ${drawResult}\n` +
      `**Số bạn chọn:** ${paddedNum}\n` +
      `**Loại vé:** ${digits} số\n` +
      `**Trùng:** ${matched} số\n\n` +
      (prize > 0
        ? `🎊 **Trúng ${formatVND(prize)}!!!** 🎊\nChúc mừng bạn đã trúng xổ số!`
        : "Không sao, lần sau may mắn hơn!")
    )
    .setFooter({ text: `Vé: ${formatVND(TICKET_PRICE)} | Số dư: ${formatVND(user.balance - TICKET_PRICE + prize)}` });

  await interaction.reply({ embeds: [embed] });
}
