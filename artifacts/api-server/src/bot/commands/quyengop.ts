import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getOrCreateUser, updateBalance } from "../utils/db-helpers.js";
import { formatVND, parseBetAmount } from "../utils/currency.js";

export const data = new SlashCommandBuilder()
  .setName("quyengop")
  .setDescription("Quyên góp tiền vào Quỹ Từ Thiện để nuôi béo Bird Bot")
  .addStringOption((option) =>
    option
      .setName("sotien")
      .setDescription("Số tiền muốn quyên góp (hoặc gõ 'all' để hiến tế tất cả)")
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const amountInput = interaction.options.getString("sotien", true);

  // Defer reply để tránh bot bị quá hạn 3s phản hồi của Discord
  await interaction.deferReply();

  const user = await getOrCreateUser(interaction.user.id, interaction.user.username);

  // Kiểm tra xem người dùng có tiền không
  if (user.balance <= 0) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle("❌ Quyên góp thất bại!")
      .setDescription("Bản thân còn đang chờ phát chẩn tế thì quyên góp cái gì hả bạn? 😂")
      .setFooter({ text: "Lo đi làm việc hoặc câu cá kiếm tiền trước đi nha!" });
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Xử lý số tiền nhập vào (hỗ trợ cả gõ số hoặc gõ 'all')
  const donateAmount = parseBetAmount(amountInput, user.balance);

  if (donateAmount === null || donateAmount <= 0) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle("❌ Số tiền không hợp lệ!")
      .setDescription("Vui lòng nhập một số tiền hợp lệ lớn hơn 0 hoặc gõ `all`.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Kiểm tra xem có đủ tiền để quyên góp không
  if (donateAmount > user.balance) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle("❌ Không đủ tiền mặt!")
      .setDescription(`Ví của bạn chỉ còn **${formatVND(user.balance)}**. Không thể quyên góp vượt quá số dư.`);
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Quy định số tiền quyên góp tối thiểu (Tránh spam 1đ, 2đ làm rác bot)
  if (donateAmount < 1_000) {
    const embed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle("❌ Số tiền quá nhỏ!")
      .setDescription("Thành phố chỉ nhận quyên góp tối thiểu từ **1.000₫** trở lên.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const newBalance = user.balance - donateAmount;

  try {
    // 1. Khấu trừ tiền của người quyên góp
    await updateBalance(interaction.user.id, newBalance);

    // 🌟 2. LẤY TÀI KHOẢN BOT & CỘNG TIỀN VÀO VÍ CỦA BOT
    const botId = interaction.client.user.id;         // Lấy Discord ID của con bot
    const botName = interaction.client.user.username; // Lấy tên của bot (Bird Bot)
    
    // Lấy hoặc khởi tạo tài khoản của Bot trong Database
    const botUser = await getOrCreateUser(botId, botName);
    
    // Tiến hành cộng dồn số tiền quyên góp vào ví tiền của Bot
    await updateBalance(botId, botUser.balance + donateAmount);

    // 3. Xuất Embed bằng khen "Tấm Lòng Vàng"
    const embed = new EmbedBuilder()
      .setColor(0x00ffcc)
      .setTitle("📜 BẰNG KHEN TẤM LÒNG VÀNG 📜")
      .setDescription(
        `Thành phố xin chân thành ghi nhận sự đóng góp quý báu của công dân <@${interaction.user.id}> vào quỹ cứu trợ xã hội!`
      )
      .addFields(
        { name: "👤 Nhà hảo tâm", value: `${interaction.user.username}`, inline: true },
        { name: "💰 Số tiền hiến tế", value: `**+${formatVND(donateAmount)}**`, inline: true },
        { name: "🏦 Số dư còn lại", value: `**${formatVND(newBalance)}**`, inline: true }
      )
      .setFooter({ text: "Phúc sinh phú quý, gia đình an khang! 🌟" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error("❌ Lỗi khi xử lý quyên góp:", error);
    await interaction.editReply({
      content: "❌ Hệ thống gặp sự cố khi chuyển tiền vào quỹ. Vui lòng thử lại sau!",
    });
  }
}
