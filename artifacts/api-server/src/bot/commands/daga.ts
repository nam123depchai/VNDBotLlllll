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

export const data = new SlashCommandBuilder()
  .setName("daga")
  .setDescription("Thách đấu đá gà — đối thủ phải đồng ý mới chơi, người thắng ấm hết cả 2 phần!")
  .addUserOption((option) =>
    option.setName("doi_thu").setDescription("Người bạn muốn thách đấu").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("sotien").setDescription("Số tiền cược (hoặc 'all')").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  cleanupOldGames();

  const opponent = interaction.options.getUser("doi_thu", true);
  const betInput = interaction.options.getString("sotien", true);

  if (opponent.id === interaction.user.id) {
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xff4444).setTitle("❌ Không hợp lệ").setDescription("Bạn không thể tự thách đấu chính mình!")],
      ephemeral: true,
    });
    return;
  }

  if (opponent.bot) {
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xff4444).setTitle("❌ Không hợp lệ").setDescription("Bạn không thể thách đấu bot!")],
      ephemeral: true,
    });
    return;
  }

  const challenger = await getOrCreateUser(interaction.user.id, interaction.user.username);
  const opponentData = await getOrCreateUser(opponent.id, opponent.username);

  let betAmount: number;
  const trimmed = betInput.trim().toLowerCase();
  if (trimmed === "all") {
    betAmount = Math.min(challenger.balance, opponentData.balance);
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

  if (betAmount < 1_000) {
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xff4444).setTitle("❌ Cược quá ít!").setDescription("Số tiền cược tối thiểu là **1.000₫**.")],
      ephemeral: true,
    });
    return;
  }

  if (betAmount > challenger.balance) {
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xff4444).setTitle("❌ Không đủ tiền!").setDescription(`Bạn chỉ có **${formatVND(challenger.balance)}**. Không thể cược **${formatVND(betAmount)}**.`)],
      ephemeral: true,
    });
    return;
  }

  if (betAmount > opponentData.balance) {
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xff4444).setTitle("❌ Đối thủ không đủ tiền!").setDescription(`<@${opponent.id}> chỉ có **${formatVND(opponentData.balance)}**. Không đủ **${formatVND(betAmount)}**.`)],
      ephemeral: true,
    });
    return;
  }

  const gameKey = `${interaction.user.id}:${opponent.id}`;
  if (activeGames.has(gameKey)) {
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xff4444).setTitle("❌ Đang có thách đấu").setDescription("Bạn đang có lời mời chơi với người này. Vui lòng chờ hoặc hủy lời mời cũ.")],
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("🏆 THÁCH ĐẤU ĐÁ GÀ!")
    .setDescription(`<@${interaction.user.id}> đang thách đấu <@${opponent.id}>!`)
    .addFields(
      { name: "💰 Tiền cược", value: `${formatVND(betAmount)}`, inline: true },
      { name: "🏆 Tổng giải thưởng", value: `${formatVND(betAmount * 2)}`, inline: true },
      { name: "⏰ Thời hạn", value: "60 giây", inline: true }
    )
    .setFooter({ text: "Đối thủ cần bấm Đồng Ý hoặc Từ chối!" });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`daga:accept:${interaction.user.id}:${opponent.id}`).setLabel("✅ Đồng Ý").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`daga:reject:${interaction.user.id}:${opponent.id}`).setLabel("❌ Từ chối").setStyle(ButtonStyle.Danger),
  );

  const reply = await interaction.reply({ content: `<@${opponent.id}>`, embeds: [embed], components: [row] });

  activeGames.set(gameKey, {
    type: "daga",
    challengerId: interaction.user.id,
    opponentId: opponent.id,
    betAmount,
    challengerData: challenger,
    opponentData,
    messageId: reply.id,
    channelId: interaction.channelId,
    createdAt: Date.now(),
  });

  const collector = interaction.channel?.createMessageComponentCollector({
    filter: (i) =>
      (i.customId === `daga:accept:${interaction.user.id}:${opponent.id}` ||
        i.customId === `daga:reject:${interaction.user.id}:${opponent.id}`) &&
      i.user.id === opponent.id,
    time: 60_000,
    max: 1,
  });

  collector?.once("collect", async (btn: ButtonInteraction) => {
    activeGames.delete(gameKey);
    collector.stop();

    if (btn.customId.startsWith("daga:reject")) {
      const rejectEmbed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle("❌ BỊ TỪ CHỐI")
        .setDescription(`<@${opponent.id}> đã từ chối thách đấu. Trận đấu bị hủy!`)
        .setFooter({ text: "Lần sau nhé! 😉" });
      await interaction.editReply({ content: `<@${interaction.user.id}>`, embeds: [rejectEmbed], components: [] });
      return;
    }

    // Chấp nhận → chơi
    const challengerRoll = Math.floor(Math.random() * 100) + 1;
    const opponentRoll = Math.floor(Math.random() * 100) + 1;
    const isWin = challengerRoll > opponentRoll;
    const isDraw = challengerRoll === opponentRoll;

    let newChallengerBalance: number;
    let newOpponentBalance: number;
    let resultTitle: string;
    let color: number;
    let footer: string;

    const pool = betAmount * 2;

    if (isDraw) {
      newChallengerBalance = challenger.balance;
      newOpponentBalance = opponentData.balance;
      resultTitle = "⚠️ HÒA!";
      color = 0xf5c518;
      footer = "Hòa! Cả hai đều xuất sắc! 🎉";
    } else if (isWin) {
      newChallengerBalance = challenger.balance + betAmount;
      newOpponentBalance = opponentData.balance - betAmount;
      resultTitle = "🎉 CHALLENGER THẮNG!";
      color = 0x00cc66;
      footer = `Người thắng ấm hết ${formatVND(pool)}! 🏆`;
    } else {
      newChallengerBalance = challenger.balance - betAmount;
      newOpponentBalance = opponentData.balance + betAmount;
      resultTitle = "🎉 OPPONENT THẮNG!";
      color = 0x00cc66;
      footer = `Người thắng ấm hết ${formatVND(pool)}! 🏆`;
    }

    await updateBalance(interaction.user.id, newChallengerBalance);
    await updateBalance(opponent.id, newOpponentBalance);
    await incrementQuestProgress(interaction.user.id, "gamble");
    await incrementQuestProgress(opponent.id, "gamble");
    if (isWin) {
      await incrementQuestProgress(interaction.user.id, "win");
    } else if (!isDraw) {
      await incrementQuestProgress(opponent.id, "win");
    }

    const resultEmbed = new EmbedBuilder()
      .setColor(color)
      .setTitle(resultTitle)
      .setDescription(`💰 Tổng giải: **${formatVND(pool)}**`)
      .addFields(
        { name: "👤 Challenger", value: `<@${interaction.user.id}> Quay: **${challengerRoll}**`, inline: true },
        { name: "👤 Opponent", value: `<@${opponent.id}> Quay: **${opponentRoll}**`, inline: true },
        { name: "🏦 Số dư mới", value: `<@${interaction.user.id}>: ${formatVND(newChallengerBalance)}\n<@${opponent.id}>: ${formatVND(newOpponentBalance)}`, inline: false }
      )
      .setFooter({ text: footer })
      .setTimestamp();

    await interaction.editReply({ content: `<@${interaction.user.id}> <@${opponent.id}>`, embeds: [resultEmbed], components: [] });
  });

  collector?.once("end", async (_collected, reason) => {
    if (reason === "time") {
      activeGames.delete(gameKey);
      const timeoutEmbed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle("⏰ HẾT THời GIAN")
        .setDescription(`<@${opponent.id}> không phản hồi. Trận đấu bị hủy!`)
        .setFooter({ text: "Lợi mời hết hạn sau 60 giây!" });
      await interaction.editReply({ content: `<@${interaction.user.id}>`, embeds: [timeoutEmbed], components: [] });
    }
  });
}
