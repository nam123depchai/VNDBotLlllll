import { type Client, ChannelType, EmbedBuilder } from "discord.js";
import { db, discordUsersTable } from "@workspace/db";
import { eq, not, asc } from "drizzle-orm";
import { getOrCreateUser } from "./db-helpers.js";
import { formatVND } from "./currency.js";
import { logger } from "../../lib/logger.js"; // Import logger chuẩn của dự án bạn

const TAX_BOT_ID = "1504802232632082502";
// ⚠️ HÃY THAY ID NÀY THÀNH ID CHANNEL CHAT TRONG SERVER CỦA BẠN ĐỂ BOT TRANH THỦ TAG NGƯỜI NGHÈO
const ANNOUNCEMENT_CHANNEL_ID = "1504840442359972082"; 

export async function runCharity(client: Client): Promise<void> {
  try {
    logger.info("=== [HỆ THỐNG TỪ THIỆN] Đang kiểm tra ngân khố... ===");

    // 1. Lấy số dư hiện tại của Bot Thuế
    const botUser = await getOrCreateUser(TAX_BOT_ID, "Bot Thuế");
    const totalTaxFunds = botUser.balance || 0;

    // Nếu ngân khố quá ít (dưới 1,000đ), không bõ công chia, đợi chu kỳ sau
    if (totalTaxFunds < 1000) {
      logger.info(`[Từ thiện] Ngân khố quá ít (${formatVND(totalTaxFunds)}), bỏ qua lượt này.`);
      return;
    }

    // 2. Lấy danh sách 4 người nghèo nhất server (Loại trừ tài khoản con Bot Thuế ra)
    const poorestUsers = await db
      .select()
      .from(discordUsersTable)
      .where(not(eq(discordUsersTable.discordId, TAX_BOT_ID)))
      .orderBy(asc(discordUsersTable.balance))
      .limit(4);

    if (poorestUsers.length === 0) {
      logger.info("[Từ thiện] Không tìm thấy người chơi nào hợp lệ để phát chấn tế.");
      return;
    }

    // 3. Tính toán số tiền chia đều
    const activeRecipients = poorestUsers.length; // Đề phòng server mới tạo có ít hơn 4 người chơi
    const shareAmount = Math.floor(totalTaxFunds / activeRecipients);

    if (shareAmount <= 0) return;

    const totalDistributed = shareAmount * activeRecipients;
    const remainFunds = totalTaxFunds - totalDistributed; // Tiền lẻ dư ra sẽ giữ lại trong kho

    // 4. Chạy Transaction cập nhật Database bảo mật, tránh trùng lặp dữ liệu
    await db.transaction(async (tx) => {
      // Khấu trừ tiền của Bot Thuế
      await tx
        .update(discordUsersTable)
        .set({ balance: remainFunds, updatedAt: new Date() })
        .where(eq(discordUsersTable.discordId, TAX_BOT_ID));

      // Phát tiền cho từng người nghèo
      for (const recipient of poorestUsers) {
        await tx
          .update(discordUsersTable)
          .set({ balance: (recipient.balance || 0) + shareAmount, updatedAt: new Date() })
          .where(eq(discordUsersTable.discordId, recipient.discordId));
      }
    });

    logger.info(`[Từ thiện] Đã phát chấn tế thành công ${formatVND(totalDistributed)} cho ${activeRecipients} người.`);

    // 5. Gửi thông báo bằng Embed siêu đẹp lên server Discord
    try {
      const channel = await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);
      if (channel && channel.type === ChannelType.GuildText) {
        
        // Tạo danh sách tag các "vị đại gia nghèo"
        const userListMentions = poorestUsers
          .map((u, index) => `${index + 1}. <@${u.discordId}> (Nhận được: **${formatVND(shareAmount)}**)`)
          .join("\n");

        const embed = new EmbedBuilder()
          .setColor(0x00ffff)
          .setTitle("🏛️ QUỸ TỪ THIỆN THÀNH PHỐ PHÁT CHẤN TẾ 🏛️")
          .setDescription(
            `Quỹ cứu trợ xã hội trích từ **10% thuế** Tài Xỉu & Bán Cá đã chính thức giải ngân!\n\n` +
            `💰 **Tổng ngân khố phát ra:** ${formatVND(totalDistributed)}\n` +
            `🎁 **Mỗi người nhận được:** ${formatVND(shareAmount)}\n\n` +
            `**📜 Danh sách các công dân may mắn nhận trợ cấp đợt này:**\n${userListMentions}`
          )
          .setFooter({ text: "Hãy chăm chỉ làm việc, câu cá, bớt sa đọa vào tệ nạn lại nhé! 😂" })
          .setTimestamp();

        await channel.send({ embeds: [embed] });
      }
    } catch (msgError) {
      logger.error({ err: msgError }, "[Từ thiện] Không thể gửi tin nhắn thông báo lên Discord");
    }

  } catch (error) {
    logger.error({ err: error }, "❌ Lỗi xảy ra trong hệ thống từ thiện");
  }
}

