import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getOrCreateUser, updateBalance } from "../utils/db-helpers.js";
import { formatVND, parseBetAmount } from "../utils/currency.js";
import { db, discordUsersTable } from "@workspace/db"; // 💡 Nhớ import thêm table chứa Quỹ từ thiện của bạn ở đây
import { eq, sql } from "drizzle-orm";

export const data = new SlashCommandBuilder()
  .setName("quyengop")
  .setDescription("Quyên góp tiền vào Quỹ Từ Thiện Thành Phố để phát chẩn tế")
  .addStringOption((option) =>
    option
      .setName("sotien")
      .setDescription("Số tiền muốn quyên góp (hoặc gõ 'all' để hiến tế tất cả)")
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const amountInput = interaction.options.getString("sotien", true);

  // Defer reply để tránh bot bị quá hạn 3s của Discord
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

  // Quy định số tiền quyên góp tối thiểu (Ví dụ: 1.000₫ để tránh spam 1đ)
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
    // 1. Trừ tiền người quyên góp
    await updateBalance(interaction.user.id, newBalance);

    // 2. Cộng tiền vào Quỹ Từ Thiện trong Database
    // ⚠️ BẠN CẦN THAY ĐOẠN ĐƯỜNG DẪN TABLE DƯỚI ĐÂY CHO ĐÚNG VỚI CẤU TRÚC DB CỦA BẠN NHA:
    // Ví dụ nếu bạn lưu quỹ từ thiện ở bảng `charityTable` với row id = 1:
    /*
    await db
      .update(charityTable)
      .set({ amount: sql`${charityTable.amount} + ${donateAmount}` })
      .where(eq(charityTable.id, 1));
    */

    // Tạo Embed bằng khen Tấm Lòng Vàng
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

