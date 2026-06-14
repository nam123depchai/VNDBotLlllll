import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getOrCreateUser, updateBalance } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";

interface Card { suit: string; rank: string; value: number; }

const SUITS = ["♠", "♥", "♣", "♦"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      let val = parseInt(r);
      if (isNaN(val)) val = r === "A" ? 11 : 10;
      deck.push({ suit: s, rank: r, value: val });
    }
  }
  return deck;
}

function draw(deck: Card[]): Card {
  return deck.splice(Math.floor(Math.random() * deck.length), 1)[0]!;
}

function handValue(hand: Card[]): number {
  let val = 0;
  let aces = 0;
  for (const c of hand) {
    val += c.value;
    if (c.rank === "A") aces++;
  }
  while (val > 21 && aces > 0) { val -= 10; aces--; }
  return val;
}

function handDisplay(hand: Card[]): string {
  return hand.map((c) => `${c.suit}${c.rank}`).join(" ") + ` = **${handValue(hand)}**`;
}

export const data = new SlashCommandBuilder()
  .setName("blackjack")
  .setDescription("Chơi Xì Dách (Blackjack) với bot — lại gần 21, đừng vượt quá!")
  .addStringOption((option) =>
    option.setName("sotien").setDescription("Số tiền cược (hoặc 'all')").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const betInput = interaction.options.getString("sotien", true);
  const user = await getOrCreateUser(interaction.user.id, interaction.user.username);

  if (user.balance <= 0) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444).setTitle("❌ Không đủ tiền!")
      .setDescription("Hãy dùng `/lamviec` hoặc `/daily` để kiếm tiền trước nhé!");
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  let betAmount: number;
  const trimmed = betInput.trim().toLowerCase();
  if (trimmed === "all") {
    betAmount = user.balance;
  } else {
    const num = parseInt(trimmed.replace(/[.,_]/g, ""), 10);
    if (isNaN(num) || num <= 0) {
      const embed = new EmbedBuilder()
        .setColor(0xff4444).setTitle("❌ Số tiền không hợp lệ!")
        .setDescription("Nhập số tiền hợp lệ (VD: `10000`) hoặc gõ `all`.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }
    betAmount = num;
  }

  if (betAmount > user.balance) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444).setTitle("❌ Không đủ tiền!")
      .setDescription(`Số dư: **${formatVND(user.balance)}**. Không thể cược **${formatVND(betAmount)}**.`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (betAmount < 1_000) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444).setTitle("❌ Cược quá ít!")
      .setDescription("Số tiền cược tối thiểu là **1.000₫**.");
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const deck = createDeck();
  const playerHand: Card[] = [draw(deck), draw(deck)];
  const dealerHand: Card[] = [draw(deck), draw(deck)];

  let pVal = handValue(playerHand);
  let dVal = handValue(dealerHand);

  const isPlayerBJ = pVal === 21;
  const isDealerBJ = dVal === 21;

  let newBalance = user.balance;
  let resultTitle = "";
  let resultDesc = "";
  let color = 0x00cc66;
  let footer = "";

  if (isPlayerBJ && isDealerBJ) {
    resultTitle = "🎉 Cả hai đều Blackjack!";
    resultDesc = "Hòa! Không ai thắng, không ai thua.";
    color = 0xf5c518;
    footer = "Hòa là thắng! 🎉";
  } else if (isPlayerBJ) {
    const win = Math.floor(betAmount * 1.5);
    newBalance = user.balance + win;
    resultTitle = "🎉 BLACKJACK!";
    resultDesc = `Bạn có Blackjack! Thắng **${formatVND(win)}**!`;
    color = 0xffd700;
    footer = "Xuất sắc! 🏆";
  } else if (isDealerBJ) {
    newBalance = user.balance - betAmount;
    resultTitle = "😢 Thua!";
    resultDesc = `Bot có Blackjack! Bạn thua **${formatVND(betAmount)}**.`;
    color = 0xff4444;
    footer = "Xui rồi! 🥲";
  } else {
    // Bot draws until 17
    while (dVal < 17) {
      dealerHand.push(draw(deck));
      dVal = handValue(dealerHand);
    }

    if (dVal > 21 || (pVal <= 21 && pVal > dVal)) {
      const win = betAmount;
      newBalance = user.balance + win;
      resultTitle = "🎉 BẠN THẮNG!";
      resultDesc = `Bạn **${pVal}** vs Bot **${dVal}**. Thắng **${formatVND(win)}**!`;
      color = 0x00cc66;
      footer = "Hay quá! 👍";
    } else if (pVal === dVal) {
      newBalance = user.balance;
      resultTitle = "⚠️ Hòa!";
      resultDesc = `Bạn **${pVal}** vs Bot **${dVal}**. Hòa!`;
      color = 0xf5c518;
      footer = "Hòa là thắng! 🎉";
    } else {
      newBalance = user.balance - betAmount;
      resultTitle = "😢 BẠN THUA!";
      resultDesc = `Bạn **${pVal}** vs Bot **${dVal}**. Thua **${formatVND(betAmount)}**.`;
      color = 0xff4444;
      footer = "Thử lại! 💪";
    }
  }

  await updateBalance(interaction.user.id, newBalance);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(resultTitle)
    .setDescription(`💰 Cược: **${formatVND(betAmount)}**\n${resultDesc}`)
    .addFields(
      { name: "👤 Bạn", value: handDisplay(playerHand), inline: false },
      { name: "🤖 Bot", value: handDisplay(dealerHand), inline: false },
      { name: "🏦 Số dư mới", value: `**${formatVND(newBalance)}**`, inline: true }
    )
    .setFooter({ text: footer })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
