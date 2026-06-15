import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db, stocksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getOrCreateUser, updateBalance } from "../utils/db-helpers.js";
import { formatVND, parseBetAmount } from "../utils/currency.js";

export const data = new SlashCommandBuilder()
  .setName("longshort")
  .setDescription("Đặt lệnh phái sinh Crypto/Chứng khoán (Chốt nến sau 5 phút)")
  .addStringOption((option) =>
    option
      .setName("ma")
      .setDescription("Mã muốn đặt cược (VD: BTC, ETH, VND...)")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("lenh")
      .setDescription("Chọn xu hướng thị trường")
      .setRequired(true)
      .addChoices(
        { name: "🟢 Long (Dự đoán TĂNG)", value: "long" },
        { name: "🔴 Short (Dự đoán GIẢM)", value: "short" }
      )
  )
  .addStringOption((option) =>
    option
      .setName("sotien")
      .setDescription("Số tiền vào lệnh (hoặc gõ 'all')")
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const symbol = interaction.options.getString("ma", true).toUpperCase().trim();
  const positionType = interaction.options.getString("lenh", true);
  const amountInput = interaction.options.getString("sotien", true);

  await interaction.deferReply();

  // 1. Kiểm tra xem mã chứng khoán/crypto có tồn tại không
  const stockResult = await db
    .select()
    .from(stocksTable)
    .where(eq(stocksTable.symbol, symbol))
    .limit(1);

  if (stockResult.length === 0) {
    await interaction.editReply({
      content: `❌ Không tìm thấy mã **${symbol}** trên sàn giao dịch!`,
    });
    return;
  }

  const stock = stockResult[0]!;
  const startPrice = stock.price; // Khóa giá vào lệnh ban đầu

  // 2. Kiểm tra ví tiền người chơi
  const user = await getOrCreateUser(interaction.user.id, interaction.user.username);
  const betAmount = parseBetAmount(amountInput, user.balance);

  if (betAmount === null || betAmount <= 0) {
    await interaction.editReply({ content: "❌ Số tiền đặt cược không hợp lệ!" });
    return;
  }

  if (betAmount > user.balance) {
    await interaction.editReply({
      content: `❌ Bạn không đủ tiền mặt! Số dư hiện tại: **${formatVND(user.balance)}**`,
    });
    return;
  }

  if (betAmount < 10_000) {
    await interaction.editReply({ content: "❌ Số tiền vào lệnh tối thiểu phải từ **10.000₫**!" });
    return;
  }

  // 3. Khấu trừ tiền cọc ngay khi mở lệnh để tránh gian lận
  await updateBalance(interaction.user.id, user.balance - betAmount);

  // Thời gian chờ chốt nến (5 phút để đồng bộ với chu kỳ update giá toàn sàn)
  const durationMs = 5 * 60 * 1000;
  const endTimestamp = Math.floor((Date.now() + durationMs) / 1000);

  // Gửi Embed thông báo mở vị thế thành công
  const positionEmoji = positionType === "long" ? "🟢 LONG" : "🔴 SHORT";
  const embed = new EmbedBuilder()
    .setColor(positionType === "long" ? 0x00ff66 : 0xff3344)
    .setTitle(`📈 VỊ THẾ PHÁI SINH ĐÃ MỞ — ${symbol}`)
    .setDescription(
      `Thương vụ mạo hiểm của công dân <@${interaction.user.id}> đã chính thức lên sàn!`
    )
    .addFields(
      { name: "🎮 Vị thế", value: `**${positionEmoji}**`, inline: true },
      { name: "💰 Tiền đặt cọc", value: `**${formatVND(betAmount)}**`, inline: true },
      { name: "📊 Giá mở lệnh", value: `**${formatVND(startPrice)}**`, inline: true },
      { name: "⏳ Thời gian chốt nến", value: `Chốt vị thế <t:${endTimestamp}:R> (<t:${endTimestamp}:T>)` }
    )
    .setFooter({ text: "Vui lòng giữ vững tâm lý, sàn đang chạy nến..." })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });

  // 4. Chờ 5 phút sau để quét giá mới và phân định thắng thua
  setTimeout(async () => {
    try {
      // Lấy giá mới nhất từ Database
      const latestStockResult = await db
        .select()
        .from(stocksTable)
        .where(eq(stocksTable.symbol, symbol))
        .limit(1);

      const latestStock = latestStockResult[0]!;
      const endPrice = latestStock.price;

      // Lấy thông tin mới nhất của Bot để cộng thuế/tiền thua
      const botId = interaction.client.user.id;
      const botName = interaction.client.user.username;

      let isWin = false;
      let isDraw = startPrice === endPrice;

      if (!isDraw) {
        if (positionType === "long" && endPrice > startPrice) isWin = true;
        if (positionType === "short" && endPrice < startPrice) isWin = true;
      }

      const resultEmbed = new EmbedBuilder().setTimestamp();
      const priceDiffText = `${formatVND(startPrice)} ➡️ ${formatVND(endPrice)}`;

      if (isDraw) {
        // HÒA VỐN: Hoàn lại tiền cược
        const currentUser = await getOrCreateUser(interaction.user.id, interaction.user.username);
        await updateBalance(interaction.user.id, currentUser.balance + betAmount);

        resultEmbed
          .setColor(0xffaa00)
          .setTitle(`🟡 LỆNH PHÁI SINH HÒA VỐN — ${symbol}`)
          .setDescription(`<@${interaction.user.id}> hú hồn! Giá không thay đổi, sàn hoàn lại tiền cọc.`)
          .addFields(
            { name: "📊 Biến động giá", value: priceDiffText },
            { name: "💰 Tiền hoàn trả", value: `**${formatVND(betAmount)}**` }
          );
      } else if (isWin) {
        // THẮNG: Trích 10% làm thuế cho Bot, trả 90% lãi cho người chơi
        const taxAmount = Math.floor(betAmount * 0.1);
        const winAmount = betAmount - taxAmount; // Tiền lãi thuần
        const totalPayout = betAmount + winAmount; // Hoàn cọc + Lãi

        // Cộng tiền cho người chơi
        const currentUser = await getOrCreateUser(interaction.user.id, interaction.user.username);
        await updateBalance(interaction.user.id, currentUser.balance + totalPayout);

        // Nộp thuế vào ví của Bot
        const botUser = await getOrCreateUser(botId, botName);
        await updateBalance(botId, botUser.balance + taxAmount);

        resultEmbed
          .setColor(0x00cc66)
          .setTitle(`🎉 LỆNH PHÁI SINH CHIẾN THẮNG — ${symbol}`)
          .setDescription(`Chúc mừng cá mập <@${interaction.user.id}> đã đoán đúng sóng thị trường!`)
          .addFields(
            { name: "🎮 Vị thế gốc", value: `**${positionEmoji}**`, inline: true },
            { name: "📊 Biến động giá", value: priceDiffText, inline: true },
            { name: "💰 Tiền lãi thu về", value: `**+${formatVND(winAmount)}** (Đã trừ 10% thuế)`, inline: false },
            { name: "🏦 Thuế nộp Quỹ", value: `**${formatVND(taxAmount)}** gửi vào ví <@${botId}>`, inline: true }
          )
          .setFooter({ text: "Đúng là thiên tài đầu tư phái sinh! 😎" });
      } else {
        // THUA: Cháy tài khoản, tiền cược bay thẳng vào ví Bot
        const botUser = await getOrCreateUser(botId, botName);
        await updateBalance(botId, botUser.balance + betAmount);

        resultEmbed
          .setColor(0xff3344)
          .setTitle(`💸 LỆNH PHÁI SINH CHÁY TÀI KHOẢN — ${symbol}`)
          .setDescription(`Rất tiếc! Đội lái của sàn đã úp bô thành công công dân <@${interaction.user.id}>.`)
          .addFields(
            { name: "🎮 Vị thế gốc", value: `**${positionEmoji}**`, inline: true },
            { name: "📊 Biến động giá", value: priceDiffText, inline: true },
            { name: "📉 Thiệt hại", value: `**-${formatVND(betAmount)}** (Bị thanh lý vị thế)`, inline: false },
            { name: "🏦 Ngân khố Bot", value: `Quỹ từ thiện <@${botId}> được tài trợ thêm **+${formatVND(betAmount)}**`, inline: true }
          )
          .setFooter({ text: "Ra bờ sông hóng gió tí cho mát đi bạn... 🌊" });
      }

      // Tag tên người chơi và gửi kết quả chốt phiên
      await interaction.followUp({
        content: `<@${interaction.user.id}> Phiên phái sinh mã **${symbol}** của bạn đã có kết quả chốt nến!`,
        embeds: [resultEmbed],
      });

    } catch (error) {
      console.error("❌ Lỗi khi chốt phiên phái sinh:", error);
    }
  }, durationMs);
}

