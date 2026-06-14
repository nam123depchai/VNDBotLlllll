import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db, discordUsersTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { formatVNDShort } from "../utils/currency.js";

export const data = new SlashCommandBuilder()
  .setName("chonglamphat")
  .setDescription("Xem phuong an chong lam phat - va thuc thi cac bien phap kinh te");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const allUsers = await db
    .select({
      totalUsers: sql<number>`COUNT(*)`,
      totalBalance: sql<number>`COALESCE(SUM(${discordUsersTable.balance}), 0)`,
      totalBank: sql<number>`COALESCE(SUM(${discordUsersTable.bankBalance}), 0)`,
      totalLoan: sql<number>`COALESCE(SUM(${discordUsersTable.loanAmount}), 0)`,
    })
    .from(discordUsersTable);

  const stats = allUsers[0]!;
  const totalMoney = stats.totalBalance + stats.totalBank;
  const inflationRate = Math.min(99, Math.max(0.5, (totalMoney / Math.max(1, stats.totalUsers * 5_000_000)) * 100));
  const isHyper = inflationRate > 50;
  const isHigh = inflationRate > 20;
  const isStable = inflationRate < 10;

  const richest = await db
    .select({
      top10Percent: sql<number>`SUM(${discordUsersTable.balance} + ${discordUsersTable.bankBalance})`,
    })
    .from(discordUsersTable)
    .orderBy(sql`${discordUsersTable.balance} + ${discordUsersTable.bankBalance} DESC`)
    .limit(Math.ceil(stats.totalUsers * 0.1));
  const top10Share = richest[0]?.top10Percent ?? 0;
  const top10Percent = totalMoney > 0 ? Math.round((top10Share / totalMoney) * 100) : 0;

  const embed = new EmbedBuilder()
    .setColor(isHyper ? 0xff0000 : isHigh ? 0xff6600 : isStable ? 0x00cc66 : 0x0099ff)
    .setTitle("PHUONG AN CHONG LAM PHAT")
    .setDescription(`Muc lam phat: **${inflationRate.toFixed(2)}%** | Top 10% giau nhat: **${top10Percent}%** tai san`)
    .addFields(
      {
        name: "Hat Thue Thu Nhap",
        value: "Tu dong thu 5% tu /lamviec va 10% tu loi nhuan game",
        inline: false,
      },
      {
        name: "Bank Lai Suat",
        value: isHyper ? "Tang lai suat gui len 5%" : "Lai suat gui: 2% / vay: 5%",
        inline: false,
      },
      {
        name: "Gioi Han Cuoc",
        value: isHyper ? "Giam cuoc toi da xuong 500.000d" : "Cuoc toi da: 500 trieu (tuy so du)",
        inline: false,
      },
      {
        name: "Tro Cap Nguoi Ngheo",
        value: "Phat 50.000d moi ngay cho nguoi duoi 100.000d",
        inline: false,
      },
      {
        name: "Goi Y Ca Nhan",
        value: isHyper
          ? "Lam phat cao - gui tien vao ngan hang ngay!"
          : isHigh
          ? "Lam phat dang tang - dau tu hoac gui ngan hang"
          : "Kinh te on dinh - tiep tuc lam giau!",
        inline: false,
      }
    )
    .setFooter({ text: `Tong tien: ${formatVNDShort(totalMoney)} | Dung /nganhang de gui tiet kiem` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
