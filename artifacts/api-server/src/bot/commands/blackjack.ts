import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
} from "discord.js";
import { getOrCreateUser, updateBalance } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";
import { activeGames, cleanupOldGames } from "../utils/game-state.js";
import { incrementQuestProgress } from "../utils/quests.js";

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
  let val = 0; let aces = 0;
  for (const c of hand) { val += c.value; if (c.rank === "A") aces++; }
  while (val > 21 && aces > 0) { val -= 10; aces--; }
  return val;
}

function handDisplay(hand: Card[]): string {
  return hand.map((c) => `${c.suit}${c.rank}`).join(" ") + ` = **${handValue(hand)}**`;
}

function hiddenDealer(hand: Card[]): string {
  return hand.slice(0, -1).map((c) => `${c.suit}${c.rank}`).join(" ") + " 🂠 + ?";
}

function createPlayerButtons(gameKey: string, canHit: boolean): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`bj:hit:${gameKey}`)
      .setLabel("🎲 Rút thêm (Hit)")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!canHit),
    new ButtonBuilder()
      .setCustomId(`bj:stand:${gameKey}`)
      .setLabel("🚫 Dừng (Stand)")
      .setStyle(ButtonStyle.Success),
  );
  return row;
}

export const data = new SlashCommandBuilder()
  .setName("blackjack")
  .setDescription("Chơi Xì Dách (Blackjack) — rút thêm hoặc dừng, rút tối đa 5 lần!")
  .addStringOption((option) =>
    option.setName("sotien").setDescription("Số tiền cược (hoặc 'all')").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  cleanupOldGames();

  const betInput = interaction.options.getString("sotien", true);
  const player = await getOrCreateUser(interaction.user.id, interaction.user.username);

  if (player.balance <= 0) {
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xff4444).setTitle("❌ Không đủ tiền!").setDescription("Hãy dùng `/lamviec` hoặc `/daily` để kiếm tiền trước nhé!")],
      ephemeral: true,
    });
    return;
  }

  let betAmount: number;
  const trimmed = betInput.trim().toLowerCase();
  if (trimmed === "all") {
    betAmount = player.balance;
  } else {
    const num = parseInt(trimmed.replace(/[.,_]/g, ""), 10);
    if (isNaN(num) || num <= 0) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xff4444).setTitle("❌ Số tiền không hợp lệ!").setDescription("Nhập số tiền hợp lệ (VD: `10000`) hoặc gõ `all`.")],
        ephemeral: true,
      });
      return;
    }
    betAmount = num;
  }

  if (betAmount > player.balance) {
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xff4444).setTitle("❌ Không đủ tiền!").setDescription(`Số dư: **${formatVND(player.balance)}**. Không thể cược **${formatVND(betAmount)}**.`)],
      ephemeral: true,
    });
    return;
  }

  if (betAmount < 1_000) {
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xff4444).setTitle("❌ Cược quá ít!").setDescription("Số tiền cược tối thiểu là **1.000₫**.")],
      ephemeral: true,
    });
    return;
  }

  const gameKey = `bj:${interaction.user.id}`;
  if (activeGames.has(gameKey)) {
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xff4444).setTitle("❌ Đang chơi").setDescription("Bạn đang có ván Blackjack. Vui lòng hoàn thành ván cũ trước!")],
      ephemeral: true,
    });
    return;
  }

  const deck = createDeck();
  const playerHand: Card[] = [draw(deck), draw(deck)];
  const dealerHand: Card[] = [draw(deck), draw(deck)];

  let pVal = handValue(playerHand);
  const isPlayerBJ = pVal === 21;
  const isDealerBJ = handValue(dealerHand) === 21;

  if (isPlayerBJ && isDealerBJ) {
    const embed = new EmbedBuilder()
      .setColor(0xf5c518).setTitle("🎉 Cả hai đều Blackjack!")
      .setDescription("Hòa! Không ai thắng, không ai thua.")
      .addFields(
        { name: "👤 Bạn", value: handDisplay(playerHand), inline: false },
        { name: "🤖 Bot", value: handDisplay(dealerHand), inline: false },
        { name: "🏦 Số dư", value: formatVND(player.balance), inline: true }
      );
    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (isPlayerBJ) {
    const win = Math.floor(betAmount * 1.5);
    const newBalance = player.balance + win;
    await updateBalance(interaction.user.id, newBalance);
    const embed = new EmbedBuilder()
      .setColor(0xffd700).setTitle("🎉 BLACKJACK!")
      .setDescription(`Bạn có Blackjack! Thắng **${formatVND(win)}**!`)
      .addFields(
        { name: "👤 Bạn", value: handDisplay(playerHand), inline: false },
        { name: "🤖 Bot", value: handDisplay(dealerHand), inline: false },
        { name: "🏦 Số dư mới", value: formatVND(newBalance), inline: true }
      );
    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (isDealerBJ) {
    const newBalance = player.balance - betAmount;
    await updateBalance(interaction.user.id, newBalance);
    const embed = new EmbedBuilder()
      .setColor(0xff4444).setTitle("😢 Thua!")
      .setDescription(`Bot có Blackjack! Bạn thua **${formatVND(betAmount)}**.`)
      .addFields(
        { name: "👤 Bạn", value: handDisplay(playerHand), inline: false },
        { name: "🤖 Bot", value: handDisplay(dealerHand), inline: false },
        { name: "🏦 Số dư mới", value: formatVND(newBalance), inline: true }
      );
    await interaction.reply({ embeds: [embed] });
    return;
  }

  // Trò chơi tương tác
  const hitsCount = 0;
  const maxHits = 5;

  activeGames.set(gameKey, {
    type: "blackjack",
    playerId: interaction.user.id,
    betAmount,
    playerData: player,
    deck,
    playerHand,
    dealerHand,
    hitsCount,
    maxHits,
    messageId: "",
    channelId: interaction.channelId,
    createdAt: Date.now(),
  });

  const initialEmbed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("🃏 XÌ DÁCH — Bạn đại đấu Bot!")
    .setDescription(`💰 Cược: **${formatVND(betAmount)}**`)
    .addFields(
      { name: "👤 Bạn", value: handDisplay(playerHand), inline: false },
      { name: "🤖 Bot (ẩn 1 lá)", value: hiddenDealer(dealerHand), inline: false },
      { name: "⏰ Lượt", value: "Rút thêm (0/5) hoặc Dừng", inline: false }
    )
    .setFooter({ text: "Bấm Rút thêm hoặc Dừng! Bạn có 60 giây." });

  const reply = await interaction.reply({
    embeds: [initialEmbed],
    components: [createPlayerButtons(gameKey, true)],
  });

  const game = activeGames.get(gameKey);
  if (game) {
    game.messageId = reply.id;
  }

  const collector = interaction.channel?.createMessageComponentCollector({
    filter: (i) =>
      (i.customId === `bj:hit:${gameKey}` || i.customId === `bj:stand:${gameKey}`) &&
      i.user.id === interaction.user.id,
    time: 60_000,
  });

  collector?.on("collect", async (btn: ButtonInteraction) => {
    const g = activeGames.get(gameKey);
    if (!g || g.type !== "blackjack") { collector.stop(); return; }

    if (btn.customId === `bj:hit:${gameKey}`) {
      g.playerHand.push(draw(g.deck));
      g.hitsCount++;
      const pValNow = handValue(g.playerHand);
      const canHit = g.hitsCount < g.maxHits && pValNow < 21;

      if (pValNow > 21) {
        // Bust! Player thua
        activeGames.delete(gameKey);
        collector.stop();
        const newBalance = g.playerData.balance - g.betAmount;
        await updateBalance(interaction.user.id, newBalance);

        const bustEmbed = new EmbedBuilder()
          .setColor(0xff4444).setTitle("😢 BUST! Quá 21!")
          .setDescription(`💰 Cược: **${formatVND(g.betAmount)}** — Bạn thua!`)
          .addFields(
            { name: "👤 Bạn", value: handDisplay(g.playerHand), inline: false },
            { name: "🤖 Bot", value: handDisplay(g.dealerHand), inline: false },
            { name: "🏦 Số dư mới", value: `**${formatVND(newBalance)}**`, inline: true }
          )
          .setFooter({ text: "Xui quá! Thử lại! 🥲" });
        await interaction.editReply({ embeds: [bustEmbed], components: [] });
        return;
      }

      const hitEmbed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle("🃏 XÌ DÁCH — Rút thêm!")
        .setDescription(`💰 Cược: **${formatVND(g.betAmount)}**`)
        .addFields(
          { name: "👤 Bạn", value: handDisplay(g.playerHand), inline: false },
          { name: "🤖 Bot (ẩn 1 lá)", value: hiddenDealer(g.dealerHand), inline: false },
          { name: "⏰ Lượt", value: `Rút thêm (${g.hitsCount}/${g.maxHits})`, inline: false }
        )
        .setFooter({ text: canHit ? "Bấm Rút thêm hoặc Dừng!" : "Đã rút tối đa! Chỉ còn Dừng!" });

      await btn.update({ embeds: [hitEmbed], components: [createPlayerButtons(gameKey, canHit)] });
    } else if (btn.customId === `bj:stand:${gameKey}`) {
      // Dừng → reveal dealer
      activeGames.delete(gameKey);
      collector.stop();

      let dVal = handValue(g.dealerHand);
      while (dVal < 17) {
        g.dealerHand.push(draw(g.deck));
        dVal = handValue(g.dealerHand);
      }

      const pValNow = handValue(g.playerHand);
      const isWin = (dVal > 21) || (pValNow <= 21 && pValNow > dVal);
      const isDraw = pValNow === dVal && pValNow <= 21;

      let newBalance: number;
      let color: number;
      let title: string;
      let desc: string;
      let footer: string;

      if (isDraw) {
        newBalance = g.playerData.balance;
        color = 0xf5c518;
        title = "⚠️ HÒA!";
        desc = `Bạn **${pValNow}** vs Bot **${dVal}**. Hòa!`;
        footer = "Hòa là thắng! 🎉";
      } else if (isWin) {
        newBalance = g.playerData.balance + g.betAmount;
        color = 0x00cc66;
        title = "🎉 BẠN THẮNG!";
        desc = `Bạn **${pValNow}** vs Bot **${dVal}**. Thắng **${formatVND(g.betAmount)}**!`;
        footer = "Hay quá! 👍";
      } else {
        newBalance = g.playerData.balance - g.betAmount;
        color = 0xff4444;
        title = "😢 BẠN THUA!";
        desc = `Bạn **${pValNow}** vs Bot **${dVal}**. Thua **${formatVND(g.betAmount)}**.`;
        footer = "Thử lại! 💪";
      }

      await updateBalance(interaction.user.id, newBalance);
      await incrementQuestProgress(interaction.user.id, "gamble");
      if (isWin) await incrementQuestProgress(interaction.user.id, "win");

      const resultEmbed = new EmbedBuilder()
        .setColor(color).setTitle(title)
        .setDescription(`💰 Cược: **${formatVND(g.betAmount)}**\n${desc}`)
        .addFields(
          { name: "👤 Bạn", value: handDisplay(g.playerHand), inline: false },
          { name: "🤖 Bot", value: handDisplay(g.dealerHand), inline: false },
          { name: "🏦 Số dư mới", value: `**${formatVND(newBalance)}**`, inline: true }
        )
        .setFooter({ text: footer });

      await btn.update({ embeds: [resultEmbed], components: [] });
    }
  });

  collector?.once("end", async (_collected, reason) => {
    if (reason === "time") {
      const g = activeGames.get(gameKey);
      if (g && g.type === "blackjack") {
        activeGames.delete(gameKey);
        const newBalance = g.playerData.balance - g.betAmount;
        await updateBalance(interaction.user.id, newBalance);
        const timeoutEmbed = new EmbedBuilder()
          .setColor(0xff4444).setTitle("⏰ HẾT THời GIAN")
          .setDescription(`Bạn không phản hồi trong 60 giây. Bạn thua **${formatVND(g.betAmount)}**!`)
          .addFields(
            { name: "👤 Bạn", value: handDisplay(g.playerHand), inline: false },
            { name: "🤖 Bot", value: handDisplay(g.dealerHand), inline: false },
            { name: "🏦 Số dư mới", value: `**${formatVND(newBalance)}**`, inline: true }
          )
          .setFooter({ text: "Không phản hồi = tự động thua! 😢" });
        await interaction.editReply({ embeds: [timeoutEmbed], components: [] });
      }
    }
  });
}
