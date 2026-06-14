import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { db, fishInventoryTable, userFishingGearTable, discordUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getOrCreateUser, addXp } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";
import { unlockAchievement } from "./thanhtich.js";

// ============================================================
// FISH DATABASE — Real Vietnamese fish + Fantasy fish
// ============================================================

type FishEntry = {
  name: string;
  emoji: string;
  value: number;
  weight: number;
  xp: number;
  type: "real" | "fantasy";
  desc?: string;
};

type FishRarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic" | "trash";

const FISH_DB: Record<FishRarity, FishEntry[]> = {
  // ───── Trash ─────
  trash: [
    { name: "Rác Thải",       emoji: "🗑️", value: 0,   weight: 8, xp: 0, type: "real" },
    { name: "Giày Cũ",        emoji: "👟", value: 0,   weight: 5, xp: 0, type: "real" },
    { name: "Chai Nhựa",      emoji: "🍶", value: 0,   weight: 4, xp: 0, type: "real" },
    { name: "Tất Rách",       emoji: "🧦", value: 0,   weight: 3, xp: 0, type: "real" },
    { name: "Xương Cá Khô",   emoji: "🦴", value: 0,   weight: 2, xp: 0, type: "real" },
  ],

  // ───── Common — Cá đồng thường (rod 0+) ─────
  common: [
    { name: "Cá Rô Phi",     emoji: "🐟", value: 80_000,  weight: 30, xp: 8,  type: "real", desc: "Cá đồng bình dân" },
    { name: "Cá Diếc",       emoji: "🐟", value: 60_000,  weight: 28, xp: 6,  type: "real", desc: "Cá nhỏ ao làng" },
    { name: "Cá Sặc",        emoji: "🐠", value: 50_000,  weight: 25, xp: 5,  type: "real", desc: "Cá tép nhỏ" },
    { name: "Tôm Đồng",      emoji: "🦐", value: 120_000, weight: 18, xp: 10, type: "real", desc: "Tươi ngon" },
    { name: "Ốc Bưu",        emoji: "🐚", value: 30_000,  weight: 20, xp: 3,  type: "real", desc: "Ốc đồng" },
    { name: "Cua Đồng",      emoji: "🦀", value: 150_000, weight: 15, xp: 12, type: "real", desc: "Nấu canh ngon" },
  ],

  // ───── Uncommon — Cá sông lớn (rod 1+) ─────
  uncommon: [
    { name: "Cá Lóc",        emoji: "🐟", value: 500_000,   weight: 15, xp: 40,  type: "real", desc: "Cá thần sông Mê Kông" },
    { name: "Cá Trê",        emoji: "🐡", value: 400_000,   weight: 16, xp: 35,  type: "real", desc: "Râu dài sắc bén" },
    { name: "Cá Chép",       emoji: "🐠", value: 600_000,   weight: 14, xp: 45,  type: "real", desc: "Biểu tượng may mắn" },
    { name: "Cá Điêu Hồng",  emoji: "🐡", value: 700_000,   weight: 12, xp: 50,  type: "real", desc: "Cá đỏ thịt ngon" },
    { name: "Cá Tra",        emoji: "🐟", value: 450_000,   weight: 15, xp: 38,  type: "real", desc: "Đặc sản miền Tây" },
    { name: "Cá Vược",       emoji: "🐠", value: 800_000,   weight: 10, xp: 55,  type: "real", desc: "Cá biển thịt trắng" },
    { name: "Cá Trắm Cỏ",   emoji: "🐟", value: 550_000,   weight: 13, xp: 42,  type: "real", desc: "Cá đại dương" },
  ],

  // ───── Rare — Cá biển quý (rod 2+) ─────
  rare: [
    { name: "Cá Hồi",        emoji: "🐠", value: 3_000_000,  weight: 8, xp: 120, type: "real", desc: "Từ Na Uy về" },
    { name: "Cá Ngừ",        emoji: "🐡", value: 5_000_000,  weight: 6, xp: 150, type: "real", desc: "Thịt đỏ tươi" },
    { name: "Cá Thu",        emoji: "🐟", value: 2_500_000,  weight: 9, xp: 100, type: "real", desc: "Biển miền Trung" },
    { name: "Cá Mú",         emoji: "🐡", value: 4_000_000,  weight: 7, xp: 130, type: "real", desc: "Đặc sản nhà hàng" },
    { name: "Mực Khổng Lồ",  emoji: "🦑", value: 6_000_000,  weight: 5, xp: 160, type: "real", desc: "Hiếm gặp" },
    { name: "Tôm Hùm",       emoji: "🦞", value: 8_000_000,  weight: 4, xp: 180, type: "real", desc: "Vua của cua tôm" },
    { name: "Cá Chình Nhật", emoji: "🐍", value: 4_500_000,  weight: 5, xp: 140, type: "real", desc: "Nhập khẩu Nhật Bản" },
  ],

  // ───── Epic — Cá khổng lồ đại dương (rod 3+) ─────
  epic: [
    { name: "Cá Kiếm Biển",      emoji: "⚔️", value: 20_000_000, weight: 4, xp: 300, type: "real",    desc: "Tốc độ 130 km/h" },
    { name: "Cá Ngừ Vây Xanh",   emoji: "🐠", value: 35_000_000, weight: 3, xp: 400, type: "real",    desc: "Đắt nhất thế giới" },
    { name: "Cá Cờ Biển",        emoji: "🎏", value: 25_000_000, weight: 3, xp: 350, type: "real",    desc: "Săn mồi nhanh nhất" },
    { name: "Cá Chình Điện",     emoji: "⚡", value: 15_000_000, weight: 5, xp: 250, type: "real",    desc: "600 volt điện" },
    { name: "Cá Mập Búa",        emoji: "🦈", value: 30_000_000, weight: 3, xp: 380, type: "real",    desc: "Đầu kỳ lạ" },
    // Fantasy bắt đầu xuất hiện ở epic
    { name: "Cá Lửa Hỏa Sơn",   emoji: "🔥", value: 40_000_000, weight: 2, xp: 450, type: "fantasy", desc: "Sinh ra từ dung nham" },
    { name: "Cá Băng Nguyên Thủy",emoji: "❄️", value: 38_000_000, weight: 2, xp: 430, type: "fantasy", desc: "Sống ở cực Nam" },
  ],

  // ───── Legendary — Cá thần thoại (rod 3+, bait tốt) ─────
  legendary: [
    { name: "Cá Sét Thần",       emoji: "⚡", value: 120_000_000, weight: 1.5, xp: 800,  type: "fantasy", desc: "Điều khiển sấm sét" },
    { name: "Cá Nguyệt Hằng",    emoji: "🌙", value: 150_000_000, weight: 1.2, xp: 900,  type: "fantasy", desc: "Xuất hiện đêm trăng rằm" },
    { name: "Cá Nhật Thần",      emoji: "☀️", value: 180_000_000, weight: 1.0, xp: 1000, type: "fantasy", desc: "Rực sáng như mặt trời" },
    { name: "Cá Rồng Đỏ",        emoji: "🐲", value: 200_000_000, weight: 0.8, xp: 1200, type: "fantasy", desc: "Con của Long Vương" },
    { name: "Cá Kim Cương",      emoji: "💎", value: 250_000_000, weight: 0.6, xp: 1500, type: "fantasy", desc: "Vảy cứng như kim cương" },
  ],

  // ───── Mythic — Siêu huyền thoại (rod 4+, mồi vàng) ─────
  mythic: [
    { name: "Cá Rồng Cổ Đại",   emoji: "🐉", value: 500_000_000,   weight: 0.4, xp: 2000, type: "fantasy", desc: "Cai trị đại dương từ 10.000 năm trước" },
    { name: "Cá Thần Vương",     emoji: "👑", value: 1_000_000_000, weight: 0.2, xp: 3000, type: "fantasy", desc: "Chúa tể của mọi sinh vật biển" },
    { name: "Cá Vũ Trụ",        emoji: "🌌", value: 2_000_000_000, weight: 0.1, xp: 5000, type: "fantasy", desc: "Xuất hiện 1 lần trong 1000 năm" },
  ],
};

// ============================================================
// COOLDOWN
// ============================================================

const BASE_COOLDOWN_MS = 20_000; // 20 giây
const MIN_COOLDOWN_MS  = 5_000;  // 5 giây tối thiểu
const FLOAT_REDUCTION  = [0, 3_000, 8_000, 15_000]; // 0 / -3s / -8s / -15s theo float level

function getCooldownMs(floatLevel: number): number {
  const reduction = FLOAT_REDUCTION[floatLevel] ?? 0;
  return Math.max(BASE_COOLDOWN_MS - reduction, MIN_COOLDOWN_MS);
}

// ============================================================
// FISHING LOGIC
// ============================================================

type BaitType = "none" | "basic" | "premium" | "legendary";

function selectBait(g: { bait: number; premiumBait: number; legendaryBait: number }): BaitType {
  if (g.legendaryBait > 0) return "legendary";
  if (g.premiumBait > 0) return "premium";
  if (g.bait > 0) return "basic";
  return "none";
}

function getAvailablePool(rodLevel: number): { fish: FishEntry; rarity: FishRarity }[] {
  const pool: { fish: FishEntry; rarity: FishRarity }[] = [];

  const add = (rarity: FishRarity) => {
    for (const f of FISH_DB[rarity]) pool.push({ fish: f, rarity });
  };

  add("trash");
  add("common");
  if (rodLevel >= 1) add("uncommon");
  if (rodLevel >= 2) add("rare");
  if (rodLevel >= 3) { add("epic"); add("legendary"); }
  if (rodLevel >= 4) add("mythic");

  return pool;
}

function rollFish(rodLevel: number, baitType: BaitType): { fish: FishEntry; rarity: FishRarity } {
  const pool = getAvailablePool(rodLevel);

  let totalWeight = 0;
  const weighted = pool.map((p) => {
    let w = p.fish.weight;

    // Bait bonuses
    if (baitType === "basic"     && ["uncommon"].includes(p.rarity))               w *= 2.5;
    if (baitType === "premium"   && ["rare", "uncommon"].includes(p.rarity))       w *= 2.5;
    if (baitType === "premium"   && ["epic"].includes(p.rarity))                   w *= 1.5;
    if (baitType === "legendary" && ["legendary", "mythic"].includes(p.rarity))    w *= 3.0;
    if (baitType === "legendary" && ["epic"].includes(p.rarity))                   w *= 2.0;
    if (baitType !== "none"      && ["trash"].includes(p.rarity))                  w *= 0.3; // giảm rác khi có mồi

    // Rod-level bonuses
    if (rodLevel >= 2 && ["rare", "epic"].includes(p.rarity))     w *= 1.3;
    if (rodLevel >= 3 && ["epic", "legendary"].includes(p.rarity)) w *= 1.5;
    if (rodLevel >= 4 && p.rarity === "mythic")                    w *= 2.0;

    totalWeight += w;
    return { ...p, w };
  });

  const roll = Math.random() * totalWeight;
  let cumulative = 0;
  for (const p of weighted) {
    cumulative += p.w;
    if (roll <= cumulative) return { fish: p.fish, rarity: p.rarity };
  }
  return { fish: weighted[0]!.fish, rarity: weighted[0]!.rarity };
}

// ============================================================
// COLORS & LABELS
// ============================================================

const RARITY_COLOR: Record<FishRarity, number> = {
  trash:     0x666666,
  common:    0x99aabb,
  uncommon:  0x00cc55,
  rare:      0x0099ff,
  epic:      0xaa00ff,
  legendary: 0xffaa00,
  mythic:    0xff2266,
};

const RARITY_LABEL: Record<FishRarity, string> = {
  trash:     "Rác",
  common:    "Thường",
  uncommon:  "Không phổ biến",
  rare:      "Hiếm",
  epic:      "Sử thi",
  legendary: "Huyền thoại",
  mythic:    "✨ THẦN THÁNH ✨",
};

const BAIT_LABEL: Record<BaitType, string> = {
  none:      "",
  basic:     "🪱 Mồi Giun",
  premium:   "🦐 Mồi Tôm",
  legendary: "✨ Mồi Vàng",
};

// ============================================================
// CORE FISHING FUNCTION (reusable for slash + button)
// ============================================================

async function doFishing(userId: string, username: string): Promise<{
  embed: EmbedBuilder;
  isTrash: boolean;
  cooldownMs: number;
  baitType: BaitType;
  baitLeft: number;
} | { onCooldown: true; remainingMs: number }> {
  const user = await getOrCreateUser(userId, username);

  const gearRows = await db.select().from(userFishingGearTable)
    .where(eq(userFishingGearTable.discordId, userId)).limit(1);

  if (gearRows.length === 0 || !gearRows[0]!.hasRod) {
    throw new Error("NO_ROD");
  }

  const g = gearRows[0]!;
  const cooldownMs = getCooldownMs(g.floatLevel);
  const now = Date.now();
  const lastFish = g.lastFishTime ?? 0;

  if (now - lastFish < cooldownMs) {
    return { onCooldown: true, remainingMs: cooldownMs - (now - lastFish) };
  }

  const baitType = selectBait(g);

  // Update lastFishTime + consume bait
  const baitUpdates: Partial<typeof g> = { lastFishTime: now };
  if (baitType === "basic")     baitUpdates.bait          = Math.max(0, g.bait - 1);
  if (baitType === "premium")   baitUpdates.premiumBait   = Math.max(0, g.premiumBait - 1);
  if (baitType === "legendary") baitUpdates.legendaryBait = Math.max(0, g.legendaryBait - 1);

  await db.update(userFishingGearTable)
    .set({ ...baitUpdates, updatedAt: new Date() })
    .where(eq(userFishingGearTable.id, g.id));

  // Roll
  const result = rollFish(g.rodLevel, baitType);
  const caught = result.fish;
  const isTrash = result.rarity === "trash";

  if (!isTrash) {
    // Add to inventory
    const existing = await db.select().from(fishInventoryTable)
      .where(eq(fishInventoryTable.discordId, userId))
      .where(eq(fishInventoryTable.fishName, caught.name));

    if (existing.length > 0) {
      await db.update(fishInventoryTable)
        .set({ quantity: existing[0]!.quantity + 1 })
        .where(eq(fishInventoryTable.id, existing[0]!.id));
    } else {
      await db.insert(fishInventoryTable).values({
        discordId: userId,
        fishName: caught.name,
        emoji: caught.emoji,
        value: caught.value,
        rarity: result.rarity,
        quantity: 1,
      });
    }

    await db.update(userFishingGearTable)
      .set({ totalFishCaught: g.totalFishCaught + 1 })
      .where(eq(userFishingGearTable.id, g.id));

    await addXp(userId, caught.xp);

    if (g.totalFishCaught + 1 >= 50)  await unlockAchievement(userId, "fisher");
    if (g.totalFishCaught + 1 >= 200) await unlockAchievement(userId, "fishing_master");
  }

  // Calc remaining bait after consumption
  const baitLeft =
    baitType === "basic"     ? Math.max(0, g.bait - 1) :
    baitType === "premium"   ? Math.max(0, g.premiumBait - 1) :
    baitType === "legendary" ? Math.max(0, g.legendaryBait - 1) :
    0;

  // Build embed
  let embed: EmbedBuilder;
  const typeTag = caught.type === "fantasy" ? "🌌 Giả Tưởng" : "🌊 Thật";

  if (isTrash) {
    embed = new EmbedBuilder()
      .setColor(RARITY_COLOR.trash)
      .setTitle(`${caught.emoji} Câu được rác!`)
      .setDescription(
        `Bạn câu được... **${caught.name}** 😂\n` +
        `Không sao, lần sau cố lên!\n\n` +
        (baitType !== "none" ? `> ${BAIT_LABEL[baitType]} đã dùng\n` : "") +
        `\n💡 Mua mồi câu tốt hơn ở **/shopcauca** để giảm rác!`
      )
      .setFooter({ text: `⏱️ Hồi: ${cooldownMs / 1000}s | Câu xong bấm nút bên dưới` });
  } else {
    const cdSecs = cooldownMs / 1000;
    embed = new EmbedBuilder()
      .setColor(RARITY_COLOR[result.rarity])
      .setTitle(`${caught.emoji}  ${caught.name}`)
      .setDescription(
        `**${typeTag}** · ${RARITY_LABEL[result.rarity]}\n` +
        (caught.desc ? `*${caught.desc}*\n` : "") +
        `\n` +
        `💰 **Giá trị:** ${formatVND(caught.value)}\n` +
        `✨ **XP:** +${caught.xp}\n` +
        (baitType !== "none" ? `🎯 **Mồi dùng:** ${BAIT_LABEL[baitType]} (còn ${baitLeft})\n` : "") +
        `\n` +
        `📦 Dùng **/banca** để bán cá`
      )
      .addFields(
        { name: "Cần câu", value: `Level ${g.rodLevel}`, inline: true },
        { name: "Tổng cá câu", value: `${g.totalFishCaught + 1}`, inline: true },
        { name: "Hồi chiêu", value: `${cdSecs}s`, inline: true },
      )
      .setFooter({ text: "Bấm 🎣 để câu lại ngay!" });
  }

  return { embed, isTrash, cooldownMs, baitType, baitLeft };
}

// ============================================================
// SLASH COMMAND
// ============================================================

export const data = new SlashCommandBuilder()
  .setName("cauca")
  .setDescription("🎣 Câu cá kiếm tiền! Cần cần câu từ /shopcauca");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const username = interaction.user.username;

  // Check rod
  const gearRows = await db.select().from(userFishingGearTable)
    .where(eq(userFishingGearTable.discordId, userId)).limit(1);

  if (gearRows.length === 0 || !gearRows[0]!.hasRod) {
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle("🎣 Câu cá")
      .setDescription(
        `Bạn chưa có cần câu!\n\n` +
        `➡️ Mua cần câu từ **/shopcauca**\n` +
        `💰 Số dư: ${formatVND((await getOrCreateUser(userId, username)).balance)}`
      );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("noro_shop").setLabel("Đến Shop Câu Cá").setStyle(ButtonStyle.Primary).setEmoji("🎣"),
      new ButtonBuilder().setCustomId("noro_cancel").setLabel("Để sau").setStyle(ButtonStyle.Secondary),
    );

    const reply = await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    const col = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30_000 });
    col.on("collect", async (i) => {
      if (i.user.id !== userId) { await i.reply({ content: "Không phải của bạn!", ephemeral: true }); return; }
      if (i.customId === "noro_shop")   await i.update({ content: "Dùng **/shopcauca** để mua cần câu!", embeds: [], components: [] });
      if (i.customId === "noro_cancel") await i.update({ content: "Hẹn gặp lại!", embeds: [], components: [] });
    });
    return;
  }

  // Animate
  await interaction.reply({ content: "🎣 Đang thả câu xuống nước... 🌊", ephemeral: false });
  await new Promise((r) => setTimeout(r, 1800));

  const result = await doFishing(userId, username);

  if ("onCooldown" in result) {
    const secs = Math.ceil(result.remainingMs / 1000);
    await interaction.editReply({ content: `⏰ Cần thêm **${secs}s** nữa để câu lại!` });
    return;
  }

  const quickFishRow = buildQuickFishRow(result.cooldownMs);

  await interaction.editReply({
    content: "",
    embeds: [result.embed],
    components: [quickFishRow],
  });

  // Handle "Câu lại" button
  const msg = await interaction.fetchReply();
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 5 * 60_000, // 5 phút
  });

  collector.on("collect", async (btn) => {
    if (btn.user.id !== userId) {
      await btn.reply({ content: "Không phải của bạn!", ephemeral: true });
      return;
    }
    await handleQuickFish(btn, userId, username);
  });
}

// ============================================================
// QUICK FISH HANDLER (for "Câu lại" button)
// ============================================================

async function handleQuickFish(btn: ButtonInteraction, userId: string, username: string) {
  await btn.deferUpdate();

  // Show animation
  await btn.editReply({ content: "🎣 Đang câu... 🌊", embeds: [], components: [] });
  await new Promise((r) => setTimeout(r, 1500));

  const result = await doFishing(userId, username);

  if ("onCooldown" in result) {
    const secs = Math.ceil(result.remainingMs / 1000);
    // Restore previous message with cooldown note
    await btn.editReply({
      content: `⏰ Chờ **${secs}s** nữa nhé!`,
      embeds: [],
      components: [buildQuickFishRow(getCooldownMs(0))],
    });
    return;
  }

  const quickFishRow = buildQuickFishRow(result.cooldownMs);
  await btn.editReply({ content: "", embeds: [result.embed], components: [quickFishRow] });
}

function buildQuickFishRow(cooldownMs: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("quick_fish")
      .setLabel(`Câu lại  (${cooldownMs / 1000}s hồi)`)
      .setStyle(ButtonStyle.Success)
      .setEmoji("🎣"),
    new ButtonBuilder()
      .setCustomId("open_banca")
      .setLabel("Bán cá")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("💰"),
    new ButtonBuilder()
      .setCustomId("open_shop")
      .setLabel("Shop")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🛒"),
  );
        }
