import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getOrCreateUser } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";

const DEPOSIT_RATE = 0.02; // 2% / ngày
const LOAN_RATE = 0.05;    // 5% / ngày

export const data = new SlashCommandBuilder()
  .setName("nganhang")
  .setDescription("Xem thông tin ngân hàng — số dƱ, lãi suất, nợ");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await getOrCreateUser(interaction.user.id, interaction.user.username);

  const now = Date.now();
  let interest = 0;
  if (user.bankBalance > 0 && user.bankDepositTime) {
    const days = Math.floor((now - new Date(user.bankDepositTime).getTime()) / (24 * 3600 * 1000));
    interest = Math.floor(user.bankBalance * DEPOSIT_RATE * days);
  }

  let loanInterest = 0;
  if (user.loanAmount > 0 && user.loanTime) {
    const days = Math.floor((now - new Date(user.loanTime).getTime()) / (24 * 3600 * 1000));
    loanInterest = Math.floor(user.loanAmount * LOAN_RATE * days);
  }

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("🏦 NGÂN HÀNG THƯƠNG MẠI")
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      { name: "💵 Số dư trong ví", value: formatVND(user.balance), inline: true },
      { name: "🏧 Số dư ngân hàng", value: formatVND(user.bankBalance), inline: true },
      { name: "📈 Tổng tài sản", value: formatVND(user.balance + user.bankBalance), inline: true },
      { name: "💰 Lãi suất gửi", value: `${(DEPOSIT_RATE * 100).toFixed(0)}%/ngày`, inline: true },
      { name: "📈 Lãi tích lũy", value: interest > 0 ? `+${formatVND(interest)}` : "0₫", inline: true },
      { name: "💸 Số nợ", value: user.loanAmount > 0 ? `${formatVND(user.loanAmount)} + ${formatVND(loanInterest)} lãi` : "0₫", inline: true },
      { name: "📉 Lãi suất vay", value: `${(LOAN_RATE * 100).toFixed(0)}%/ngày`, inline: true }
    )
    .setFooter({ text: "Dùng /gui, /rut, /vay, /trano để giao dịch!" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
