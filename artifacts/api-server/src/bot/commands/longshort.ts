import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Client,
  EmbedBuilder,
} from "discord.js";
import { db, stocksTable, derivativesPositionsTable } from "@workspace/db";
import { eq, and, lte } from "drizzle-orm";
import { getOrCreateUser, updateBalance } from "../utils/db-helpers.js";
import { formatVND, parseBetAmount } from "../utils/currency.js";

// ═══════════════════════════════════════════════════════════
// SETTLEMENT — chạy định kỳ (gọi từ stock-init interval)
// ═══════════════════════════════════════════════════════════
export async function settleExpiredPositions(client: Client): Promise<void> {
  const now = new Date();
  const pending = await db.select().from(derivativesPositionsTable)
    .where(and(eq(derivativesPositionsTable.isSettled, false), lte(derivativesPositionsTable.settleAt, now)));

  for (const pos of pending) {
    try {
      const stockRows = await db.select().from(stocksTable).where(eq(stocksTable.symbol, pos.symbol)).limit(1);
      if (!stockRows[0]) continue;

      const endPrice  = stockRows[0].price;
      const isDraw    = pos.startPrice === endPrice;
      const isWin     = !isDraw && (
        (pos.positionType === "long"  && endPrice > pos.startPrice) ||
        (pos.positionType === "short" && endPrice < pos.startPrice)
      );

      const botId   = client.user!.id;
      const botName = client.user!.username;

      const resultEmbed = new EmbedBuilder().setTimestamp();
      const priceDiff   = `${formatVND(pos.startPrice)} ➡️ ${formatVND(endPrice)}`;
      const posEmoji    = pos.positionType === "long" ? "🟢 LONG" : "🔴 SHORT";

      if (isDraw) {
        const u = await getOrCreateUser(pos.discordId, "user");
        await updateBalance(pos.discordId, u.balance + pos.betAmount);
        resultEmbed.setColor(0xffaa00).setTitle(`🟡 HÒA VỐN — ${pos.symbol}`)
          .setDescription(`<@${pos.discordId}> hú hồn! Giá không đổi, hoàn lại tiền cọc.`)
          .addFields({ name:"💰 Hoàn trả", value:formatVND(pos.betAmount) });
      } else if (isWin) {
        const tax      = Math.floor(pos.betAmount * 0.1);
        const profit   = pos.betAmount - tax;
        const payout   = pos.betAmount + profit;
        const u        = await getOrCreateUser(pos.discordId, "user");
        await updateBalance(pos.discordId, u.balance + payout);
        const bot      = await getOrCreateUser(botId, botName);
        await updateBalance(botId, bot.balance + tax);
        resultEmbed.setColor(0x00cc66).setTitle(`🎉 THẮNG — ${pos.symbol}`)
          .setDescription(`Chúc mừng cá mập <@${pos.discordId}> đã đoán đúng!`)
          .addFields(
            { name:"🎮 Vị thế", value:posEmoji, inline:true },
            { name:"📊 Giá", value:priceDiff, inline:true },
            { name:"💰 Lãi thu về", value:`+${formatVND(profit)} (sau 10% thuế)`, inline:false },
          ).setFooter({ text:"Đúng là thiên tài đầu tư phái sinh! 😎" });
      } else {
        const bot = await getOrCreateUser(botId, botName);
        await updateBalance(botId, bot.balance + pos.betAmount);
        resultEmbed.setColor(0xff3344).setTitle(`💸 CHÁY TÀI KHOẢN — ${pos.symbol}`)
          .setDescription(`Đội lái của sàn úp bô thành công <@${pos.discordId}>! 🏴‍☠️`)
          .addFields(
            { name:"🎮 Vị thế", value:posEmoji, inline:true },
            { name:"📊 Giá", value:priceDiff, inline:true },
            { name:"📉 Thiệt hại", value:`-${formatVND(pos.betAmount)}`, inline:false },
          ).setFooter({ text:"Ra bờ sông hóng gió tí đi... 🌊" });
      }

      // Đánh dấu đã settle
      await db.update(derivativesPositionsTable)
        .set({ isSettled: true })
        .where(eq(derivativesPositionsTable.id, pos.id));

      // Gửi kết quả vào channel gốc
      const channel = await client.channels.fetch(pos.channelId).catch(() => null);
      if (channel && 'send' in channel) {
        await channel.send({
          content: `<@${pos.discordId}> Phiên phái sinh **${pos.symbol}** đã chốt!`,
          embeds: [resultEmbed],
        });
      }
    } catch (err) {
      console.error("Lỗi settle position:", err);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// SLASH COMMAND
// ═══════════════════════════════════════════════════════════
export const data = new SlashCommandBuilder()
  .setName("longshort")
  .setDescription("📈 Đặt lệnh phái sinh Crypto/Chứng khoán (chốt sau 5 phút)")
  .addStringOption((o) => o.setName("ma").setDescription("Mã (VD: BTC, ETH, VND...)").setRequired(true))
  .addStringOption((o) => o.setName("lenh").setDescription("Xu hướng").setRequired(true)
    .addChoices({ name:"🟢 Long (dự đoán TĂNG)", value:"long" }, { name:"🔴 Short (dự đoán GIẢM)", value:"short" }))
  .addStringOption((o) => o.setName("sotien").setDescription("Số tiền vào lệnh (hoặc 'all')").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const symbol      = interaction.options.getString("ma", true).toUpperCase().trim();
  const posType     = interaction.options.getString("lenh", true);
  const amountInput = interaction.options.getString("sotien", true);

  await interaction.deferReply();

  const stockRows = await db.select().from(stocksTable).where(eq(stocksTable.symbol, symbol)).limit(1);
  if (!stockRows[0]) {
    await interaction.editReply({ content:`❌ Không tìm thấy mã **${symbol}** trên sàn!` });
    return;
  }

  const stock      = stockRows[0];
  const startPrice = stock.price;
  const user       = await getOrCreateUser(interaction.user.id, interaction.user.username);
  const bet        = parseBetAmount(amountInput, user.balance);

  if (!bet || bet <= 0) { await interaction.editReply({ content:"❌ Số tiền không hợp lệ!" }); return; }
  if (bet < 10_000)     { await interaction.editReply({ content:"❌ Tối thiểu **10.000₫**!" }); return; }
  if (bet > user.balance) {
    await interaction.editReply({ content:`❌ Không đủ tiền! Số dư: **${formatVND(user.balance)}**` });
    return;
  }

  // Trừ tiền cọc + lưu position vào DB (không dùng setTimeout)
  await updateBalance(interaction.user.id, user.balance - bet);

  const settleAt = new Date(Date.now() + 5 * 60_000);
  await db.insert(derivativesPositionsTable).values({
    discordId:    interaction.user.id,
    channelId:    interaction.channelId,
    symbol,
    positionType: posType,
    betAmount:    bet,
    startPrice,
    settleAt,
  });

  const posEmoji   = posType === "long" ? "🟢 LONG" : "🔴 SHORT";
  const endEpoch   = Math.floor(settleAt.getTime() / 1000);

  const embed = new EmbedBuilder()
    .setColor(posType === "long" ? 0x00ff66 : 0xff3344)
    .setTitle(`📈 VỊ THẾ ĐÃ MỞ — ${symbol}`)
    .setDescription(`Thương vụ của <@${interaction.user.id}> đã lên sàn!`)
    .addFields(
      { name:"🎮 Vị thế",          value:`**${posEmoji}**`,          inline:true },
      { name:"💰 Tiền cọc",         value:`**${formatVND(bet)}**`,    inline:true },
      { name:"📊 Giá mở lệnh",      value:`**${formatVND(startPrice)}**`, inline:true },
      { name:"⏳ Chốt nến",         value:`<t:${endEpoch}:R> (<t:${endEpoch}:T>)` },
    )
    .setFooter({ text:"Vị thế lưu vào DB — bot restart vẫn chốt được!" })
    .setTimestamp();

  await interaction.editReply({ embeds:[embed] });
}
