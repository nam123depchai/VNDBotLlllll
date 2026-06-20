import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db, userCoinsTable, coinCreationCounterTable, discordUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getOrCreateUser } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";

const BASE_COST = 100_000_000; // 100 triệu cho lần tạo đầu tiên
const COST_MULTIPLIER = 3;

const COIN_EMOJIS = ["🪙", "💰", "🔶", "🔷", "💎", "🌕", "⭐", "🔥", "🌟", "✨"];

function calcCreationCost(coinsAlreadyCreated: number): number {
  // Lần 1: BASE_COST, lần 2: x3, lần 3: x3 nữa, v.v.
  return BASE_COST * Math.pow(COST_MULTIPLIER, coinsAlreadyCreated);
}

function randomVolatility(): number {
  // Random giống các coin khác trong hệ thống (0.10 - 0.35)
  return Math.round((0.10 + Math.random() * 0.25) * 100) / 100;
}

function randomTrend(): number {
  // Trend ngẫu nhiên nhẹ, có thể âm hoặc dương
  return Math.round((Math.random() * 0.1 - 0.03) * 100) / 100;
}

export const data = new SlashCommandBuilder()
  .setName("taocoin")
  .setDescription("🪙 Tạo đồng coin riêng của bạn! Phí tăng x3 mỗi lần tạo thêm")
  .addStringOption((o) =>
    o.setName("ma").setDescription("Mã coin (3-6 ký tự, VD: MEOW)").setRequired(true).setMaxLength(6).setMinLength(2)
  )
  .addStringOption((o) =>
    o.setName("ten").setDescription("Tên đầy đủ của coin").setRequired(true).setMaxLength(40)
  )
  .addStringOption((o) =>
    o.setName("gia-khoi-diem").setDescription("Giá khởi điểm 1 coin (₫)").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("mo-ta").setDescription("Mô tả ngắn về coin của bạn").setRequired(false).setMaxLength(200)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const symbol = interaction.options.getString("ma", true).toUpperCase().trim();
  const name = interaction.options.getString("ten", true).trim();
  const priceInput = interaction.options.getString("gia-khoi-diem", true);
  const description = interaction.options.getString("mo-ta") ?? null;

  await interaction.deferReply();

  // Validate mã coin (chỉ chữ + số)
  if (!/^[A-Z0-9]+$/.test(symbol)) {
    await interaction.editReply({ content: "❌ Mã coin chỉ được chứa chữ cái và số!" });
    return;
  }

  // Validate giá khởi điểm
  const startPrice = parseInt(priceInput.replace(/[.,\s₫]/g, ""), 10);
  if (!Number.isFinite(startPrice) || startPrice < 100 || startPrice > 1_000_000_000) {
    await interaction.editReply({ content: "❌ Giá khởi điểm phải từ 100₫ đến 1.000.000.000₫!" });
    return;
  }

  // Check trùng mã với coin user khác hoặc coin hệ thống
  const existingUserCoin = await db.select().from(userCoinsTable).where(eq(userCoinsTable.symbol, symbol)).limit(1);
  if (existingUserCoin.length > 0) {
    await interaction.editReply({ content: `❌ Mã **${symbol}** đã được người khác sử dụng!` });
    return;
  }

  const user = await getOrCreateUser(userId, interaction.user.username);

  // Lấy số lần đã tạo coin trước đó để tính phí
  const counterRows = await db.select().from(coinCreationCounterTable).where(eq(coinCreationCounterTable.discordId, userId)).limit(1);
  const coinsCreated = counterRows[0]?.coinsCreated ?? 0;
  const cost = calcCreationCost(coinsCreated);

  if (user.balance < cost) {
    const nextCost = formatVND(cost);
    await interaction.editReply({
      content:
        `❌ Không đủ tiền để tạo coin!\n\n` +
        `💰 Số dư: **${formatVND(user.balance)}**\n` +
        `💸 Phí tạo coin lần ${coinsCreated + 1}: **${nextCost}**\n\n` +
        (coinsCreated > 0 ? `*(Phí tăng x3 sau mỗi lần tạo — bạn đã tạo ${coinsCreated} coin)*` : ""),
    });
    return;
  }

  // Trừ tiền + tạo coin
  await db.update(discordUsersTable)
    .set({ balance: user.balance - cost, updatedAt: new Date() })
    .where(eq(discordUsersTable.discordId, userId));

  const emoji = COIN_EMOJIS[Math.floor(Math.random() * COIN_EMOJIS.length)]!;

  await db.insert(userCoinsTable).values({
    symbol,
    name,
    emoji,
    price: startPrice,
    prevPrice: startPrice,
    volatility: randomVolatility(),
    trend: randomTrend(),
    creatorId: userId,
    creationCost: cost,
    description,
  });

  // Update counter
  if (counterRows.length > 0) {
    await db.update(coinCreationCounterTable)
      .set({ coinsCreated: coinsCreated + 1 })
      .where(eq(coinCreationCounterTable.discordId, userId));
  } else {
    await db.insert(coinCreationCounterTable).values({ discordId: userId, coinsCreated: 1 });
  }

  const nextCost = calcCreationCost(coinsCreated + 1);

  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle(`🎉 Đã tạo coin mới: ${emoji} ${symbol}`)
    .setDescription(
      `**${name}**\n` +
      (description ? `*${description}*\n\n` : "\n") +
      `💵 Giá khởi điểm: **${formatVND(startPrice)}**\n` +
      `👤 Người tạo: <@${userId}>\n` +
      `💸 Phí đã trả: **${formatVND(cost)}**`
    )
    .addFields(
      { name: "📊 Mua/Bán", value: `Dùng \`/muacoin\` và \`/bancoin\` với mã **${symbol}**`, inline: false },
      { name: "💰 Số dư còn lại", value: formatVND(user.balance - cost), inline: true },
      { name: "🔜 Phí tạo coin lần tới", value: formatVND(nextCost), inline: true },
    )
    .setFooter({ text: "Giá coin sẽ biến động tự nhiên theo thị trường như coin thường" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
