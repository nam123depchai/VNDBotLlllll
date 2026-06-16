import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getOrCreateUser, updateBalance, addXp } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";

// ID tài khoản của Bot để chuyển tiền phí/tiền phạt vào làm quỹ từ thiện
// Bot ID lấy động từ client thay vì hardcode

export const data = new SlashCommandBuilder()
  .setName("chuyentien")
  .setDescription("Chuyển tiền cho người khác (Ngân hàng công khai hoặc Chợ đen lậu)")
  .addUserOption((option) =>
    option.setName("nguoi_nhan").setDescription("Người nhận tiền").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("sotien").setDescription("Số tiền chuyển (hoặc 'all')").setRequired(true)
  )
  // 🌟 Thêm lựa chọn kênh chuyển tiền
  .addStringOption((option) =>
    option.setName("kenh_chuyen")
      .setDescription("Chọn phương thức chuyển tiền")
      .setRequired(true)
      .addChoices(
        { name: "🏦 Ngân Hàng Bird (Miễn phí < 50M, > 50M phí 3%)", value: "nganhang" },
        { name: "🥷 Dịch Vụ Đen (Phí 1%, 5% nguy cơ mất trắng)", value: "choden" }
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  // Xin thêm thời gian từ Discord (Chống lỗi không phản hồi)
  await interaction.deferReply();

  try {
    const receiver = interaction.options.getUser("nguoi_nhan", true);
    const amountInput = interaction.options.getString("sotien", true);
    const channel = interaction.options.getString("kenh_chuyen", true);

    if (receiver.id === interaction.user.id) {
      const embed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle("❌ Không hợp lệ")
        .setDescription("Bạn không thể tự chuyển tiền cho chính mình!");
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (receiver.bot) {
      const embed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle("❌ Không hợp lệ")
        .setDescription("Bạn không thể chuyển tiền cho bot!");
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const sender = await getOrCreateUser(interaction.user.id, interaction.user.username);

    if (sender.balance <= 0) {
      const embed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle("❌ Không đủ tiền")
        .setDescription(`Số dư của bạn chỉ là **${formatVND(sender.balance)}** — không thể chuyển tiền!`);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    let amount: number;
    const trimmed = amountInput.trim().toLowerCase();
    if (trimmed === "all") {
      amount = sender.balance;
    } else {
      const num = parseInt(trimmed.replace(/[.,_]/g, ""), 10);
      if (isNaN(num) || num <= 0) {
        const embed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle("❌ Số tiền không hợp lệ")
          .setDescription("Nhập số tiền hợp lệ (VD: `100000`, `500000`) hoặc gõ `all`.");
        await interaction.editReply({ embeds: [embed] });
        return;
      }
      amount = num;
    }

    if (amount < 1_000) {
      const embed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle("❌ Chuyển quá ít")
        .setDescription("Số tiền chuyển tối thiểu là **1.000₫**.");
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // 🌟 LOGIC TÍNH PHÍ VÀ RỦI RO CHI TIẾT
    let fee = 0;
    let isScammed = false; // Biến kiểm tra xem có bị Chợ Đen nuốt tiền không
    let note = "";

    if (channel === "nganhang") {
      // Ngân hàng Bird: Dưới hoặc bằng 50M miễn phí, trên 50M tính phí 3% toàn bộ số tiền chuyển
      if (amount > 50_000_000) {
        fee = Math.floor(amount * 0.03);
        note = `⚠️ Số tiền vượt quá 50M, Ngân Hàng Bird thu **3% phí dịch vụ** (${formatVND(fee)}) để làm từ thiện.`;
      } else {
        note = "🏦 Giao dịch thông qua Ngân Hàng Bird hoàn toàn miễn phí!";
      }
    } else if (channel === "choden") {
      // Dịch Vụ Đen: Luôn tốn 1% phí
      fee = Math.floor(amount * 0.01);
      
      // Tỷ lệ 5% mất trắng (Quay số từ 1 đến 100, nếu nhỏ hơn hoặc bằng 5 là dính)
      const rate = Math.random() * 100;
      if (rate <= 5) {
        isScammed = true;
      }
      note = "🥷 Giao dịch qua Dịch Vụ Đen chịu **1% phí ẩn** và đối mặt với rủi ro bị công an triệt phá.";
    }

    const totalCost = amount + fee;

    // Kiểm tra xem người gửi có đủ tiền chi trả cả (Tiền chuyển + Phí) không
    if (totalCost > sender.balance) {
      const embed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle("❌ Không đủ tiền chi trả phí")
        .setDescription(`Tổng số tiền cần trả là **${formatVND(totalCost)}** (Trong đó bao gồm Tiền gốc: ${formatVND(amount)} và Phí: ${formatVND(fee)}).\nSố dư hiện tại của bạn: **${formatVND(sender.balance)}**.`);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const receiverUser = await getOrCreateUser(receiver.id, receiver.username);

    // Trừ tiền người gửi (Mất cả gốc lẫn phí)
    const newSenderBalance = sender.balance - totalCost;
    await updateBalance(interaction.user.id, newSenderBalance);

    // Nếu có phí giao dịch, chuyển thẳng số tiền phí đó vào ví tài khoản của Bot (Quỹ từ thiện)
    if (fee > 0) {
      const botId = interaction.client.user.id;
      const botUser = await getOrCreateUser(botId, interaction.client.user.username);
      await updateBalance(botId, botUser.balance + fee);
    }

    // Tạo Embed kết quả giao dịch
    const embed = new EmbedBuilder().setTimestamp();

    if (isScammed) {
      // TRƯỜNG HỢP BỊ MẤT TRẮNG (CHỢ ĐEN CƯỚP)
      // Người nhận KHÔNG nhận được tiền, tiền chuyển khoản mất tích (Bay vào ví Bot hoặc biến mất hoàn toàn, ở đây cho vào ví bot làm từ thiện luôn)
      const botId = interaction.client.user.id;
      const botUser = await getOrCreateUser(botId, interaction.client.user.username);
      await updateBalance(interaction.client.user.id, botUser.balance + amount);

      embed
        .setColor(0xff0000)
        .setTitle("🚨 PHI VỤ ĐỔ BỂ — BỊ CƯỚP TRẮNG!")
        .setDescription(`Khách hàng <@${interaction.user.id}> sử dụng Dịch Vụ Đen để chuyển tiền cho <@${receiver.id}> nhưng đi đêm lắm có ngày gặp ma! Đường dây Chợ Đen đã bị cảnh sát Bird triệt phá hoặc ôm tiền bỏ trốn!`)
        .addFields(
          { name: "👤 Kẻ rửa tiền", value: `<@${interaction.user.id}>`, inline: true },
          { name: "👤 Người đợi tiền", value: `<@${receiver.id}>`, inline: true },
          { name: "💸 Số tiền bốc hơi", value: `**${formatVND(amount)}** (Tổn thất thêm ${formatVND(fee)} phí đen)`, inline: false },
          { name: "🏦 Số dư còn lại của bạn", value: `**${formatVND(newSenderBalance)}**`, inline: false }
        )
        .setFooter({ text: "Một phút huy hoàng rồi dắt nhau ra tòa... ⚖️" });

    } else {
      // TRƯỜNG HỢP GIAO DỊCH THÀNH CÔNG (Ngân hàng hoặc Chợ đen trót lọt)
      const newReceiverBalance = receiverUser.balance + amount;
      await updateBalance(receiver.id, newReceiverBalance);
      await addXp(interaction.user.id, 10); // Thêm XP cho người gửi

      embed
        .setColor(channel === "nganhang" ? 0x00cc66 : 0x333333)
        .setTitle(channel === "nganhang" ? "🏦 Chuyển Khoản Ngân Hàng Thành Công" : "🥷 Giao Dịch Chợ Đen Trót Lọt")
        .setDescription(`Đã giải ngân thành công **${formatVND(amount)}** tới tài khoản của <@${receiver.id}>!`)
        .addFields(
          { name: "👤 Người gửi", value: `<@${interaction.user.id}>`, inline: true },
          { name: "👤 Người nhận", value: `<@${receiver.id}>`, inline: true },
          { name: "💰 Tiền thực nhận", value: `**${formatVND(amount)}**`, inline: true },
          { name: "🧾 Chi phí khấu trừ", value: `**${formatVND(fee)}**`, inline: true },
          { name: "📢 Lưu ý từ hệ thống", value: note, inline: false },
          { name: "🏦 Số dư mới của bạn", value: `**${formatVND(newSenderBalance)}**`, inline: false }
        )
        .setFooter({ text: "Giao dịch hoàn tất! Cảm ơn đã sử dụng dịch vụ." });
    }

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error("❌ Lỗi xảy ra trong lệnh chuyentien:", error);
    await interaction.editReply({
      content: "❌ Hệ thống lưu chuyển tiền tệ đang bận hoặc gặp lỗi kết nối cơ sở dữ liệu!",
    });
  }
}
