import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db, discordUsersTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { formatVND } from "../utils/currency.js";

export const data = new SlashCommandBuilder()
  .setName("lamphat")
  .setDescription("💎 Xem mức độ lạm phát trong server — nghềo càng cấn biết!");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  // Tổng hợp số liệu
  const allUsers = await db
    .select({
      totalUsers: sql<number>`COUNT(*)`,
      totalBalance: sql<number>`COALESCE(SUM(${discordUsersTable.balance}), 0)`,
      totalBank: sql<number>`COALESCE(SUM(${discordUsersTable.bankBalance}), 0)`,
      totalLoan: sql<number>`COALESCE(SUM(${discordUsersTable.loanAmount}), 0)`,
      avgBalance: sql<number>`COALESCE(AVG(${discordUsersTable.balance}), 0)`,
      maxBalance: sql<number>`MAX(${discordUsersTable.balance})`,
    })
    .from(discordUsersTable);

  const stats = allUsers[0]!;
  const totalMoney = stats.totalBalance + stats.totalBank;
  const moneySupply = totalMoney + stats.totalLoan;

  // Tính "lạm phát" — càng nhiều tiền trong server, càng cao
  const inflationRate = Math.min(99, Math.max(0.5, (totalMoney / Math.max(1, stats.totalUsers * 5_000_000)) * 100));
  const isHyperInflation = inflationRate > 50;
  const isStable = inflationRate < 10;

  // Lấy top 3 giàu nhất
  const top3 = await db
    .select({
      username: discordUsersTable.username,
      balance: discordUsersTable.balance,
      bankBalance: discordUsersTable.bankBalance,
    })
    .from(discordUsersTable)
    .orderBy(sql`${discordUsersTable.balance} + ${discordUsersTable.bankBalance} DESC`)
    .limit(3);

  const top3Text = top3.map((u, i) => {
    const emoji = ["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`;
    const total = u.balance + u.bankBalance;
    return `${emoji} **${u.username}** — ${formatVND(total)}`;
  }).join("\n");

  const barLen = 20;
  const filled = Math.floor((inflationRate / 100) * barLen);
  const bar = "💎".repeat(filled) + "⬜".repeat(barLen - filled);

  const embed = new EmbedBuilder()
    .setColor(isHyperInflation ? 0xff0000 : isStable ? 0x00cc66 : 0xff8800)
    .setTitle(isHyperInflation ? "🚨 LẠM PHÁT SIÊU CAO! 🚨" : isStable ? "📈 KINH TẾ ỔN ĐỀNH" : "📈 MỨC LẠM PHÁT SERVER")
    .setDescription(`${bar} **${inflationRate.toFixed(2)}%**`)
    .addFields(
      { name: "👥 Tổng người dùng", value: `${stats.totalUsers.toLocaleString("vi-VN")}`, inline: true },
      { name: "💰 Tổng tiền lưu thông", value: formatVND(totalMoney), inline: true },
      { name: "🏦 Tổng ngân hàng", value: formatVND(stats.totalBank), inline: true },
      { name: "💸 Tổng nợ", value: formatVND(stats.totalLoan), inline: true },
      { name: "📊 Tiền trung bình", value: formatVND(Math.floor(stats.avgBalance)), inline: true },
      { name: "📈 Tiền cung", value: formatVND(moneySupply), inline: true },
      { name: "🏆 Top 3 Đại Gia", value: top3Text || "Chưa có ai", inline: false }
    )
    .setFooter({
      text: isHyperInflation
        ? "Tiền mất giá nhanh lắm! Gửi ngân hàng ngay! 🚨"
        : isStable
        ? "Kinh tế tốt, hãy tiếp tục kiếm tiền! 💪"
        : "Lạm phát đang leo thang... Cẩn thận với nợ nhé! 😰",
    })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
