import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getOrCreateUser, updateBalance, updateWorkTime } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";

const COOLDOWN_MS = 60 * 60 * 1000;
const MIN_EARN = 100;
const MAX_EARN = 500;

const WORK_MESSAGES = [
  { job: "Bán bánh mì", emoji: "🥖" },
  { job: "Chạy xe ôm", emoji: "🛵" },
  { job: "Lập trình thuê", emoji: "💻" },
  { job: "Bán cà phê", emoji: "☕" },
  { job: "Làm bảo vệ", emoji: "🛡️" },
  { job: "Chơi nhạc đường phố", emoji: "🎸" },
  { job: "Giao đồ ăn", emoji: "🍜" },
  { job: "Dạy kèm online", emoji: "📚" },
  { job: "Buôn bán vỉa hè", emoji: "🛒" },
  { job: "Làm thợ xây", emoji: "🧱" },
];

export const data = new SlashCommandBuilder()
  .setName("lamviec")
  .setDescription("Đi làm để kiếm tiền (cooldown 1 giờ)");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await getOrCreateUser(interaction.user.id, interaction.user.username);

  if (user.lastWorkTime) {
    const elapsed = Date.now() - new Date(user.lastWorkTime).getTime();
    if (elapsed < COOLDOWN_MS) {
      const remaining = COOLDOWN_MS - elapsed;
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);

      const embed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle("⏰ Chưa đến giờ làm!")
        .setDescription(`Bạn đang mệt rồi! Nghỉ ngơi thêm **${mins} phút ${secs} giây** nữa nhé.`)
        .addFields({ name: "💵 Số dư hiện tại", value: formatVND(user.balance) })
        .setFooter({ text: "Làm việc chăm chỉ nhưng cũng phải nghỉ ngơi 😄" });

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }
  }

  const earned = Math.floor(Math.random() * (MAX_EARN - MIN_EARN + 1)) + MIN_EARN;
  const newBalance = user.balance + earned;
  const workEntry = WORK_MESSAGES[Math.floor(Math.random() * WORK_MESSAGES.length)]!;

  await updateBalance(interaction.user.id, newBalance);
  await updateWorkTime(interaction.user.id);

  const embed = new EmbedBuilder()
    .setColor(0x00cc66)
    .setTitle(`${workEntry.emoji} Đi Làm Thành Công!`)
    .setDescription(`Bạn đã **${workEntry.job}** và kiếm được tiền!`)
    .addFields(
      { name: "💰 Kiếm được", value: `**+${formatVND(earned)}**`, inline: true },
      { name: "🏦 Số dư mới", value: `**${formatVND(newBalance)}**`, inline: true }
    )
    .setFooter({ text: "Quay lại sau 1 giờ để làm tiếp nhé! 💪" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
