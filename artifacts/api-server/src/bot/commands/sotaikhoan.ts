import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getOrCreateUser } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";

export const data = new SlashCommandBuilder()
  .setName("sotaikhoan")
  .setDescription("Xem số dư tài khoản của bạn")
  .addUserOption((option) =>
    option.setName("nguoi_dung").setDescription("Xem số dư của người dùng khác (bỏ trống để xem của bạn)").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const targetUser = interaction.options.getUser("nguoi_dung") ?? interaction.user;
  const user = await getOrCreateUser(targetUser.id, targetUser.username);

  const isSelf = targetUser.id === interaction.user.id;

  const embed = new EmbedBuilder()
    .setColor(0xf5c518)
    .setTitle("💰 Số Dư Tài Khoản")
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields(
      { name: "👤 Người dùng", value: `<@${targetUser.id}>`, inline: true },
      { name: "💵 Số dư", value: `**${formatVND(user.balance)}**`, inline: true }
    )
    .setFooter({ text: isSelf ? "Đây là số dư của bạn" : `Số dư của ${targetUser.username}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
