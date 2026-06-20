import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
} from "discord.js";
import { db, investmentFundTable, fundContributionsTable, fundHoldingsTable, stocksTable, discordUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getOrCreateUser } from "../utils/db-helpers.js";
import { getOrCreateFund, calcFundNAV, calcSharePrice } from "../utils/fund-helpers.js";
import { formatVND } from "../utils/currency.js";

export const data = new SlashCommandBuilder()
  .setName("quydautu")
  .setDescription("🏦 Quỹ đầu tư chung server — góp tiền, hệ thống tự đầu tư, chia lãi theo %");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const fund = await getOrCreateFund();
  const { nav, cashPool, investedValue } = await calcFundNAV();
  const sharePrice = await calcSharePrice();

  const myContrib = await db.select().from(fundContributionsTable)
    .where(eq(fundContributionsTable.discordId, interaction.user.id)).limit(1);
  const myShares = myContrib[0]?.shares ?? 0;
  const myValue = myShares * sharePrice;
  const myContributed = myContrib[0]?.totalContributed ?? 0;
  const myPnl = myValue - myContributed;

  const holdings = await db.select().from(fundHoldingsTable);
  let holdingsDesc = "";
  for (const h of holdings) {
    if (h.quantity <= 0) continue;
    const stock = await db.select().from(stocksTable).where(eq(stocksTable.id, h.stockId)).limit(1);
    if (!stock[0]) continue;
    const curVal = h.quantity * stock[0].price;
    const pnl = curVal - h.quantity * h.avgBuyPrice;
    holdingsDesc += `${stock[0].emoji} **${stock[0].symbol}** x${h.quantity.toLocaleString()} — ${formatVND(curVal)} (${pnl >= 0 ? "+" : ""}${formatVND(pnl)})\n`;
  }
  if (!holdingsDesc) holdingsDesc = "_Quỹ chưa đầu tư vào đâu, đang giữ tiền mặt._";

  const embed = new EmbedBuilder()
    .setColor(0x1db954)
    .setTitle("🏦 QUỸ ĐẦU TƯ CHUNG SERVER")
    .setDescription(
      `💰 **Tổng NAV:** ${formatVND(nav)}\n` +
      `💵 Tiền mặt: ${formatVND(cashPool)} | 📊 Đang đầu tư: ${formatVND(investedValue)}\n` +
      `📈 Giá 1 share: **${formatVND(Math.round(sharePrice))}**\n\n` +
      `**📋 Danh mục quỹ đang nắm giữ:**\n${holdingsDesc}`
    )
    .addFields(
      { name: "🎯 Phần của bạn", value: myShares > 0 ? `${myShares.toLocaleString()} shares — ${formatVND(Math.round(myValue))}` : "Chưa góp", inline: true },
      { name: `${myPnl >= 0 ? "📈" : "📉"} Lãi/Lỗ của bạn`, value: myShares > 0 ? `${myPnl >= 0 ? "+" : ""}${formatVND(Math.round(myPnl))}` : "—", inline: true },
    )
    .setFooter({ text: "Hệ thống tự động đầu tư vào các mã trong /thitruong mỗi 30 phút" })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("fund_deposit").setLabel("💰 Góp tiền").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("fund_withdraw").setLabel("💸 Rút tiền").setStyle(ButtonStyle.Danger),
  );

  const msg = await interaction.editReply({ embeds: [embed], components: [row] });

  const collector = msg.createMessageComponentCollector({ time: 120_000 });

  collector.on("collect", async (i) => {
    if (i.customId === "fund_deposit") {
      const modal = new ModalBuilder().setCustomId("fund_deposit_modal").setTitle("Góp tiền vào quỹ");
      const input = new TextInputBuilder()
        .setCustomId("amount").setLabel("Số tiền muốn góp (₫)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("VD: 1000000");
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
      await i.showModal(modal);

      try {
        const submitted = await i.awaitModalSubmit({ time: 60_000 });
        const raw = submitted.fields.getTextInputValue("amount");
        const amount = parseInt(raw.replace(/[.,\s₫]/g, ""), 10);

        if (!Number.isFinite(amount) || amount < 10_000) {
          await submitted.reply({ content: "❌ Số tiền góp tối thiểu 10.000₫!", ephemeral: true });
          return;
        }

        const user = await getOrCreateUser(i.user.id, i.user.username);
        if (user.balance < amount) {
          await submitted.reply({ content: `❌ Không đủ tiền! Số dư: ${formatVND(user.balance)}`, ephemeral: true });
          return;
        }

        const curSharePrice = await calcSharePrice();
        const newShares = Math.floor((amount / curSharePrice) * 1000) / 1000; // giữ 3 số lẻ cho share nhỏ

        await db.update(discordUsersTable)
          .set({ balance: user.balance - amount, updatedAt: new Date() })
          .where(eq(discordUsersTable.discordId, i.user.id));

        const freshFund = await getOrCreateFund();
        await db.update(investmentFundTable)
          .set({ totalPool: freshFund.totalPool + amount, totalShares: freshFund.totalShares + newShares, updatedAt: new Date() })
          .where(eq(investmentFundTable.id, freshFund.id));

        const existingContrib = await db.select().from(fundContributionsTable).where(eq(fundContributionsTable.discordId, i.user.id)).limit(1);
        if (existingContrib.length > 0) {
          await db.update(fundContributionsTable).set({
            shares: existingContrib[0]!.shares + newShares,
            totalContributed: existingContrib[0]!.totalContributed + amount,
            updatedAt: new Date(),
          }).where(eq(fundContributionsTable.id, existingContrib[0]!.id));
        } else {
          await db.insert(fundContributionsTable).values({ discordId: i.user.id, shares: newShares, totalContributed: amount });
        }

        await submitted.reply({ content: `✅ Đã góp **${formatVND(amount)}** vào quỹ! Nhận **${newShares.toFixed(3)}** shares.` });
      } catch {
        // Hết thời gian nhập modal, bỏ qua im lặng
      }
      return;
    }

    if (i.customId === "fund_withdraw") {
      const modal = new ModalBuilder().setCustomId("fund_withdraw_modal").setTitle("Rút tiền khỏi quỹ");
      const input = new TextInputBuilder()
        .setCustomId("percent").setLabel("Phần trăm muốn rút (1-100)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("VD: 50 (rút 50% phần của bạn)");
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
      await i.showModal(modal);

      try {
        const submitted = await i.awaitModalSubmit({ time: 60_000 });
        const raw = submitted.fields.getTextInputValue("percent");
        const percent = parseFloat(raw);

        if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
          await submitted.reply({ content: "❌ Phần trăm phải từ 1 đến 100!", ephemeral: true });
          return;
        }

        const myContribRow = await db.select().from(fundContributionsTable).where(eq(fundContributionsTable.discordId, i.user.id)).limit(1);
        if (!myContribRow[0] || myContribRow[0].shares <= 0) {
          await submitted.reply({ content: "❌ Bạn chưa góp vào quỹ!", ephemeral: true });
          return;
        }

        const myRow = myContribRow[0];
        const sharesToSell = myRow.shares * (percent / 100);
        const curSharePrice = await calcSharePrice();
        const cashOut = Math.round(sharesToSell * curSharePrice);

        const freshFund = await getOrCreateFund();
        if (freshFund.totalPool < cashOut) {
          await submitted.reply({
            content: `❌ Quỹ không đủ tiền mặt để rút ngay (đang đầu tư hết)! Thử rút % nhỏ hơn hoặc đợi quỹ bán vị thế.`,
            ephemeral: true,
          });
          return;
        }

        await db.update(investmentFundTable)
          .set({ totalPool: freshFund.totalPool - cashOut, totalShares: freshFund.totalShares - sharesToSell, updatedAt: new Date() })
          .where(eq(investmentFundTable.id, freshFund.id));

        await db.update(fundContributionsTable)
          .set({ shares: myRow.shares - sharesToSell, updatedAt: new Date() })
          .where(eq(fundContributionsTable.id, myRow.id));

        const user = await getOrCreateUser(i.user.id, i.user.username);
        await db.update(discordUsersTable)
          .set({ balance: user.balance + cashOut, updatedAt: new Date() })
          .where(eq(discordUsersTable.discordId, i.user.id));

        await submitted.reply({ content: `✅ Đã rút **${formatVND(cashOut)}** (${percent}% phần của bạn)!` });
      } catch {
        // Hết thời gian nhập modal
      }
      return;
    }
  });

  collector.on("end", () => interaction.editReply({ components: [] }).catch(() => {}));
}
