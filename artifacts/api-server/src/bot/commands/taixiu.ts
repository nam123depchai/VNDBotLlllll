import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getOrCreateUser, updateBalance, addXp } from "../utils/db-helpers.js";
import { formatVND, parseBetAmount } from "../utils/currency.js";
import { incrementQuestProgress } from "../utils/quests.js";
import { db, jackpotTable, discordUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { unlockAchievement } from "./thanhtich.js";

const JACKPOT_CONTRIBUTION_RATE = 0.50;
const MAX_JACKPOT = 1_000_000_000;

function rollDice(): number[] {
  return [
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
  ];
}

function getDiceEmoji(n: number): string {
  return ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][n - 1]!;
}

function isTriple(dice: number[]): boolean {
  return dice[0] === dice[1] && dice[1] === dice[2];
}

async function getOrCreateJackpot() {
  const rows = await db.select().from(jackpotTable).where(eq(jackpotTable.id, 1));
  if (rows.length === 0) {
    await db.insert(jackpotTable).values({ id: 1, amount: 0, maxAmount: MAX_JACKPOT, updatedAt: new Date() });
    return { id: 1, amount: 0, maxAmount: MAX_JACKPOT, updatedAt: new Date() };
  }
  return rows[0]!;
}

async function addToJackpot(betAmount: number) {
  const contribution = Math.floor(betAmount * JACKPOT_CONTRIBUTION_RATE);
  const jp = await getOrCreateJackpot();
  const newAmount = Math.min(jp.amount + contribution, MAX_JACKPOT);
  await db
    .update(jackpotTable)
    .set({ amount: newAmount, updatedAt: new Date() })
    .where(eq(jackpotTable.id, 1));
  return newAmount;
}

async function hitJackpot(winnerId: string) {
  const jp = await getOrCreateJackpot();
  const amount = jp.amount;
  // Reset về 0 sau khi nổ
  await db
    .update(jackpotTable)
    .set({ amount: 0, updatedAt: new Date() })
    .where(eq(jackpotTable.id, 1));
  return amount;
}

export const data = new SlashCommandBuilder()
  .setName("taixiu")
  .setDescription("Chơi Tài Xỉu — T là Tài (11-17), X là Xỉu (4-10)")
  .addStringOption((option) =>
    option.setName("cuoc").setDescription("Tài (T) hoặc Xỉu (X)").setRequired(true)
      .addChoices(
        { name: "🔴 Tài (T) — 11 đến 17", value: "T" },
        { name: "🔵 Xỉu (X) — 4 đến 10", value: "X" }
      )
  )
  .addStringOption((option) =>
    option.setName("sotien").setDescription("Số tiền cược (hoặc gõ 'all' để cược tất cả)").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const choice = interaction.options.getString("cuoc", true) as "T" | "X";
  const betInput = interaction.options.getString("sotien", true);

  const user = await getOrCreateUser(interaction.user.id, interaction.user.username);

  if (user.balance <= 0) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle("❌ Không đủ tiền!")
      .setDescription("Bạn không có tiền để cược. Hãy dùng `/lamviec` để kiếm tiền trước nhé!")
      .setFooter({ text: "Nghèo mà vẫn muốn đánh 😂" });
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const betAmount = parseBetAmount(betInput, user.balance);

  if (betAmount === null) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle("❌ Số tiền không hợp lệ!")
      .setDescription("Nhập số tiền hợp lệ (VD: `1000`, `500`) hoặc gõ `all` để cược tất cả.");
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (betAmount > user.balance) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle("❌ Không đủ tiền!")
      .setDescription(`Số dư của bạn chỉ còn **${formatVND(user.balance)}**. Không thể cược **${formatVND(betAmount)}**.`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (betAmount < 1_000) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle("❌ Cược quá ít!")
      .setDescription("Số tiền cược tối thiểu là **1.000₫**.");
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const dice = rollDice();
  const total = dice.reduce((a, b) => a + b, 0);
  const result = total >= 11 ? "T" : "X";
  const isWin = result === choice;
  const isTrip = isTriple(dice);

  const winMultiplier = 1.9;
  const winAmount = Math.floor(betAmount * winMultiplier);
  let newBalance = isWin
    ? user.balance + winAmount
    : user.balance - betAmount;

  // Tích vào nổ hũ
  const jackpotAmount = await addToJackpot(betAmount);

  // Nổ hũ! 3 xúc xắc giống nhau
  let jackpotWin = 0;
  if (isTrip) {
    jackpotWin = await hitJackpot(interaction.user.id);
    newBalance += jackpotWin;
    await db
      .update(discordUsersTable)
      .set({ balance: newBalance, updatedAt: new Date() })
      .where(eq(discordUsersTable.discordId, interaction.user.id));
  } else {
    await updateBalance(interaction.user.id, Math.max(0, newBalance));
  }

  await incrementQuestProgress(interaction.user.id, "gamble");
  if (isWin) await incrementQuestProgress(interaction.user.id, "win");
  await addXp(interaction.user.id, isWin ? 30 : 10);
  if (isTrip) await unlockAchievement(interaction.user.id, "jackpot_winner");
  if (betAmount >= 1_000_000) await unlockAchievement(interaction.user.id, "high_roller");

  const diceDisplay = dice.map(getDiceEmoji).join(" ");
  const resultLabel = result === "T" ? "🔴 Tài" : "🔵 Xỉu";
  const choiceLabel = choice === "T" ? "🔴 Tài" : "🔵 Xỉu";

  const embed = new EmbedBuilder()
    .setColor(isTrip ? 0xffd700 : isWin ? 0x00cc66 : 0xff4444)
    .setTitle(isTrip ? "🎉🎉🎉 NỔ HŨ TÀI XỈU! 🎉🎉🎉" : isWin ? "🎉 BẠN THẮNG!" : "😢 BẠN THUA!")
    .setDescription(
      isTrip
        ? `🎰 **3 xúc xắc giống nhau!** ${diceDisplay}\n🎉 **${dice[0]}-${dice[0]}-${dice[0]}** 🎉\n\n💰 Bạn đã **NỔ HŨ** và ăn **${formatVND(jackpotWin)}**!`
        : `🎲 Xúc xắc: ${diceDisplay} = **${total}**`
    )
    .addFields(
      { name: "📊 Kết quả", value: resultLabel, inline: true },
      { name: "🎯 Bạn cược", value: choiceLabel, inline: true },
      {
        name: isWin ? "💰 Thắng" : "💸 Thua",
        value: isWin ? `**+${formatVND(winAmount)}**` : `**-${formatVND(betAmount)}**`,
        inline: true,
      },
      { name: "🎰 Nổ hũ hiện tại", value: `**${formatVND(jackpotAmount)}**`, inline: true }
    );

  if (isTrip) {
    embed.addFields(
      { name: "🏆 Tiền nổ hũ", value: `**+${formatVND(jackpotWin)}**`, inline: true },
      { name: "🏦 Số dư mới", value: `**${formatVND(newBalance)}**`, inline: true }
    );
  } else {
    embed.addFields(
      { name: "🏦 Số dư mới", value: `**${formatVND(Math.max(0, newBalance))}**`, inline: true }
    );
  }

  embed.setFooter({ text: isTrip ? "🎉🎉🎉 TRÚNG LỚN! 🎉🎉🎉" : isWin ? "Hên quá! Chơi tiếp không? 😏" : "Xui rồi... Thử lại lần nữa không? 🥲" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], content: isTrip ? `<@${interaction.user.id}> ĐÃ NỔ HŨ TÀI XỈU! 🎉🎉🎉` : undefined });
}
