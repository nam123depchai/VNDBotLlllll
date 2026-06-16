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
import { db, fishInventoryTable, userFishingGearTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getOrCreateUser, addXp } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";
import { unlockAchievement } from "./thanhtich.js";

// ═══════════════════════════════════════════════════════════
// FISH DATABASE
// ═══════════════════════════════════════════════════════════
type FishEntry = {
  name: string; emoji: string; value: number;
  weight: number; xp: number; type: "real" | "fantasy"; desc?: string;
};
type FishRarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic" | "trash";

const FISH_DB: Record<FishRarity, FishEntry[]> = {
  trash: [
    { name:"Rác Thải",      emoji:"🗑️", value:0, weight:8, xp:0, type:"real" },
    { name:"Giày Cũ",       emoji:"👟", value:0, weight:5, xp:0, type:"real" },
    { name:"Chai Nhựa",     emoji:"🍶", value:0, weight:4, xp:0, type:"real" },
    { name:"Tất Rách",      emoji:"🧦", value:0, weight:3, xp:0, type:"real" },
    { name:"Xương Cá Khô",  emoji:"🦴", value:0, weight:2, xp:0, type:"real" },
  ],
  common: [
    { name:"Cá Rô Phi",  emoji:"🐟", value:80_000,  weight:30, xp:8,  type:"real", desc:"Cá đồng bình dân" },
    { name:"Cá Diếc",    emoji:"🐟", value:60_000,  weight:28, xp:6,  type:"real", desc:"Cá nhỏ ao làng" },
    { name:"Cá Sặc",     emoji:"🐠", value:50_000,  weight:25, xp:5,  type:"real", desc:"Cá tép nhỏ" },
    { name:"Tôm Đồng",   emoji:"🦐", value:120_000, weight:18, xp:10, type:"real", desc:"Tươi ngon" },
    { name:"Ốc Bưu",     emoji:"🐚", value:30_000,  weight:20, xp:3,  type:"real", desc:"Ốc đồng" },
    { name:"Cua Đồng",   emoji:"🦀", value:150_000, weight:15, xp:12, type:"real", desc:"Nấu canh ngon" },
  ],
  uncommon: [
    { name:"Cá Lóc",       emoji:"🐟", value:500_000, weight:15, xp:40, type:"real", desc:"Cá thần sông Mê Kông" },
    { name:"Cá Trê",       emoji:"🐡", value:400_000, weight:16, xp:35, type:"real", desc:"Râu dài sắc bén" },
    { name:"Cá Chép",      emoji:"🐠", value:600_000, weight:14, xp:45, type:"real", desc:"Biểu tượng may mắn" },
    { name:"Cá Điêu Hồng", emoji:"🐡", value:700_000, weight:12, xp:50, type:"real", desc:"Cá đỏ thịt ngon" },
    { name:"Cá Tra",       emoji:"🐟", value:450_000, weight:15, xp:38, type:"real", desc:"Đặc sản miền Tây" },
    { name:"Cá Vược",      emoji:"🐠", value:800_000, weight:10, xp:55, type:"real", desc:"Cá biển thịt trắng" },
    { name:"Cá Trắm Cỏ",  emoji:"🐟", value:550_000, weight:13, xp:42, type:"real", desc:"Cá đại dương" },
  ],
  rare: [
    { name:"Cá Hồi",       emoji:"🐠", value:3_000_000, weight:8, xp:120, type:"real", desc:"Từ Na Uy về" },
    { name:"Cá Ngừ",       emoji:"🐡", value:5_000_000, weight:6, xp:150, type:"real", desc:"Thịt đỏ tươi" },
    { name:"Cá Thu",       emoji:"🐟", value:2_500_000, weight:9, xp:100, type:"real", desc:"Biển miền Trung" },
    { name:"Cá Mú",        emoji:"🐡", value:4_000_000, weight:7, xp:130, type:"real", desc:"Đặc sản nhà hàng" },
    { name:"Mực Khổng Lồ", emoji:"🦑", value:6_000_000, weight:5, xp:160, type:"real", desc:"Hiếm gặp" },
    { name:"Tôm Hùm",      emoji:"🦞", value:8_000_000, weight:4, xp:180, type:"real", desc:"Vua của cua tôm" },
    { name:"Cá Chình Nhật",emoji:"🐍", value:4_500_000, weight:5, xp:140, type:"real", desc:"Nhập khẩu Nhật Bản" },
  ],
  epic: [
    { name:"Cá Kiếm Biển",       emoji:"⚔️", value:20_000_000, weight:4, xp:300, type:"real",    desc:"Tốc độ 130 km/h" },
    { name:"Cá Ngừ Vây Xanh",    emoji:"🐠", value:35_000_000, weight:3, xp:400, type:"real",    desc:"Đắt nhất thế giới" },
    { name:"Cá Cờ Biển",         emoji:"🎏", value:25_000_000, weight:3, xp:350, type:"real",    desc:"Săn mồi nhanh nhất" },
    { name:"Cá Chình Điện",      emoji:"⚡", value:15_000_000, weight:5, xp:250, type:"real",    desc:"600 volt điện" },
    { name:"Cá Mập Búa",         emoji:"🦈", value:30_000_000, weight:3, xp:380, type:"real",    desc:"Đầu kỳ lạ" },
    { name:"Cá Lửa Hỏa Sơn",    emoji:"🔥", value:40_000_000, weight:2, xp:450, type:"fantasy", desc:"Sinh ra từ dung nham" },
    { name:"Cá Băng Nguyên Thủy",emoji:"❄️", value:38_000_000, weight:2, xp:430, type:"fantasy", desc:"Sống ở cực Nam" },
  ],
  legendary: [
    { name:"Cá Sét Thần",    emoji:"⚡", value:120_000_000, weight:1.5, xp:800,  type:"fantasy", desc:"Điều khiển sấm sét" },
    { name:"Cá Nguyệt Hằng", emoji:"🌙", value:150_000_000, weight:1.2, xp:900,  type:"fantasy", desc:"Xuất hiện đêm trăng rằm" },
    { name:"Cá Nhật Thần",   emoji:"☀️", value:180_000_000, weight:1.0, xp:1000, type:"fantasy", desc:"Rực sáng như mặt trời" },
    { name:"Cá Rồng Đỏ",     emoji:"🐲", value:200_000_000, weight:0.8, xp:1200, type:"fantasy", desc:"Con của Long Vương" },
    { name:"Cá Kim Cương",   emoji:"💎", value:250_000_000, weight:0.6, xp:1500, type:"fantasy", desc:"Vảy cứng như kim cương" },
  ],
  mythic: [
    { name:"Cá Rồng Cổ Đại", emoji:"🐉", value:500_000_000,   weight:0.4, xp:2000, type:"fantasy", desc:"Cai trị đại dương 10.000 năm" },
    { name:"Cá Thần Vương",  emoji:"👑", value:1_000_000_000, weight:0.2, xp:3000, type:"fantasy", desc:"Chúa tể mọi sinh vật biển" },
    { name:"Cá Vũ Trụ",      emoji:"🌌", value:2_000_000_000, weight:0.1, xp:5000, type:"fantasy", desc:"Xuất hiện 1 lần trong 1000 năm" },
  ],
};

// ═══════════════════════════════════════════════════════════
// COOLDOWN — dùng schema cooldownLevel (0=20s 1=15s 2=10s 3=5s)
// ═══════════════════════════════════════════════════════════
const COOLDOWNS = [20_000, 15_000, 10_000, 5_000];
function getCooldownMs(level: number) { return COOLDOWNS[level] ?? 20_000; }

// ═══════════════════════════════════════════════════════════
// BAIT — map sang schema thực tế (bait / baitGold / baitDivine)
// ═══════════════════════════════════════════════════════════
type BaitType = "none" | "basic" | "premium" | "legendary";
type BaitPref = "auto" | "none" | "basic" | "premium" | "legendary";

const BAIT_LABEL: Record<BaitType, string> = {
  none: "", basic: "🪱 Mồi Giun", premium: "🦐 Mồi Tôm", legendary: "✨ Mồi Vàng",
};

// ═══════════════════════════════════════════════════════════
// COLORS & LABELS
// ═══════════════════════════════════════════════════════════
const RARITY_COLOR: Record<FishRarity, number> = {
  trash:0x666666, common:0x99aabb, uncommon:0x00cc55, rare:0x0099ff,
  epic:0xaa00ff, legendary:0xffaa00, mythic:0xff2266,
};
const RARITY_LABEL: Record<FishRarity, string> = {
  trash:"Rác", common:"Thường", uncommon:"Không phổ biến", rare:"Hiếm",
  epic:"Sử thi", legendary:"Huyền thoại", mythic:"✨ THẦN THÁNH ✨",
};

// ═══════════════════════════════════════════════════════════
// MODULE-LEVEL STATE
// ═══════════════════════════════════════════════════════════
const fishingCooldowns = new Map<string, number>();  // userId → last fish timestamp
const activeCollectors = new Map<string, { stop: (r?: string) => void }>();
const isFishing        = new Set<string>();
const baitPrefs        = new Map<string, BaitPref>(); // userId → pref

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
type GearRow = typeof userFishingGearTable.$inferSelect;

function resolveBaitType(g: GearRow, pref: BaitPref): BaitType {
  if (pref === "none")      return "none";
  if (pref === "legendary" && g.baitDivine > 0) return "legendary";
  if (pref === "premium"   && g.baitGold   > 0) return "premium";
  if (pref === "basic"     && g.bait       > 0) return "basic";
  if (pref !== "auto")     return "none";
  // auto: ưu tiên tốt nhất có sẵn
  if (g.baitDivine > 0) return "legendary";
  if (g.baitGold   > 0) return "premium";
  if (g.bait       > 0) return "basic";
  return "none";
}

function getPool(rodLevel: number) {
  const pool: { fish: FishEntry; rarity: FishRarity }[] = [];
  const add = (r: FishRarity) => FISH_DB[r].forEach((f) => pool.push({ fish: f, rarity: r }));
  add("trash"); add("common");
  if (rodLevel >= 1) add("uncommon");
  if (rodLevel >= 2) add("rare");
  if (rodLevel >= 3) { add("epic"); add("legendary"); }
  if (rodLevel >= 4) add("mythic");
  return pool;
}

function rollFish(rodLevel: number, baitType: BaitType, luckLevel: number) {
  const pool = getPool(rodLevel);
  let total = 0;
  const weighted = pool.map((p) => {
    let w = p.fish.weight;
    if (baitType === "basic"     && p.rarity === "uncommon")                         w *= 2.5;
    if (baitType === "premium"   && ["rare","uncommon"].includes(p.rarity))           w *= 2.5;
    if (baitType === "premium"   && p.rarity === "epic")                              w *= 1.5;
    if (baitType === "legendary" && ["legendary","mythic"].includes(p.rarity))        w *= 3.0;
    if (baitType === "legendary" && p.rarity === "epic")                              w *= 2.0;
    if (baitType !== "none"      && p.rarity === "trash")                             w *= 0.3;
    if (luckLevel >= 1 && ["epic","legendary","mythic"].includes(p.rarity))           w *= 1.5;
    if (luckLevel >= 2 && ["legendary","mythic"].includes(p.rarity))                  w *= 2.0;
    if (rodLevel >= 2 && ["rare","epic"].includes(p.rarity))      w *= 1.3;
    if (rodLevel >= 3 && ["epic","legendary"].includes(p.rarity)) w *= 1.5;
    if (rodLevel >= 4 && p.rarity === "mythic")                   w *= 2.0;
    total += w;
    return { ...p, w };
  });
  let r = Math.random() * total;
  for (const p of weighted) { r -= p.w; if (r <= 0) return p; }
  return weighted[0]!;
}

async function addToInventory(userId: string, fish: FishEntry, rarity: FishRarity) {
  // Fix: dùng and() thay vì .where().where() chained
  const existing = await db.select().from(fishInventoryTable)
    .where(and(eq(fishInventoryTable.discordId, userId), eq(fishInventoryTable.fishName, fish.name)))
    .limit(1);
  if (existing.length > 0) {
    await db.update(fishInventoryTable)
      .set({ quantity: existing[0]!.quantity + 1 })
      .where(eq(fishInventoryTable.id, existing[0]!.id));
  } else {
    await db.insert(fishInventoryTable).values({
      discordId: userId, fishName: fish.name, emoji: fish.emoji,
      value: fish.value, fishType: fish.type, rarity, quantity: 1,
    });
  }
}

// ═══════════════════════════════════════════════════════════
// CORE FISHING — trả về embed hoặc lỗi
// ═══════════════════════════════════════════════════════════
type FishResult =
  | { ok: true; embed: EmbedBuilder; cooldownMs: number }
  | { ok: false; reason: "NO_ROD" | "COOLDOWN"; remainingMs?: number };

async function doFishing(userId: string, username: string): Promise<FishResult> {
  await getOrCreateUser(userId, username);

  const gearRows = await db.select().from(userFishingGearTable)
    .where(eq(userFishingGearTable.discordId, userId)).limit(1);

  if (gearRows.length === 0 || !gearRows[0]!.hasRod)
    return { ok: false, reason: "NO_ROD" };

  const g = gearRows[0]!;
  const cooldownMs = getCooldownMs(g.cooldownLevel);

  const last = fishingCooldowns.get(userId) ?? 0;
  if (Date.now() - last < cooldownMs)
    return { ok: false, reason: "COOLDOWN", remainingMs: cooldownMs - (Date.now() - last) };

  // Ghi timestamp ngay để tránh race condition
  fishingCooldowns.set(userId, Date.now());

  const pref     = baitPrefs.get(userId) ?? "auto";
  const baitType = resolveBaitType(g, pref);

  // Trừ mồi
  const upd: Partial<GearRow> = { updatedAt: new Date() };
  if (baitType === "legendary") upd.baitDivine = g.baitDivine - 1;
  else if (baitType === "premium") upd.baitGold = g.baitGold - 1;
  else if (baitType === "basic")   upd.bait     = g.bait - 1;
  if (Object.keys(upd).length > 1)
    await db.update(userFishingGearTable).set(upd).where(eq(userFishingGearTable.id, g.id));

  const result = rollFish(g.rodLevel, baitType, g.luckLevel);
  const caught = result.fish;
  const isTrash = result.rarity === "trash";

  let newTotal = g.totalFishCaught;
  if (!isTrash) {
    await addToInventory(userId, caught, result.rarity);
    newTotal++;
    await db.update(userFishingGearTable)
      .set({ totalFishCaught: newTotal, updatedAt: new Date() })
      .where(eq(userFishingGearTable.id, g.id));
    await addXp(userId, caught.xp).catch(() => {});
    if (newTotal >= 50)  await unlockAchievement(userId, "fisher").catch(() => {});
    if (newTotal >= 200) await unlockAchievement(userId, "fishing_master").catch(() => {});
  }

  // Lưới: 25% bắt 2 cá (nếu hasNet)
  let extra: typeof result | null = null;
  if (!isTrash && g.hasNet && Math.random() < 0.25) {
    extra = rollFish(g.rodLevel, baitType, g.luckLevel);
    if (extra.rarity !== "trash") {
      await addToInventory(userId, extra.fish, extra.rarity);
      newTotal++;
      await db.update(userFishingGearTable)
        .set({ totalFishCaught: newTotal, updatedAt: new Date() })
        .where(eq(userFishingGearTable.id, g.id));
      if (extra.fish.xp > 0) await addXp(userId, extra.fish.xp).catch(() => {});
    } else { extra = null; }
  }

  const cdSec = cooldownMs / 1000;
  const baitLeft = baitType === "legendary" ? g.baitDivine - 1
    : baitType === "premium" ? g.baitGold - 1
    : baitType === "basic"   ? g.bait - 1 : 0;

  let embed: EmbedBuilder;
  if (isTrash) {
    embed = new EmbedBuilder()
      .setColor(RARITY_COLOR.trash)
      .setTitle(`${caught.emoji} Câu được rác!`)
      .setDescription(
        `Bạn câu được... **${caught.name}** 😂\nKhông sao, lần sau cố lên!\n\n` +
        (baitType !== "none" ? `> ${BAIT_LABEL[baitType]} đã dùng (còn ${Math.max(0,baitLeft)})\n` : "") +
        `💡 Mua mồi ở **/shopcauca** để giảm rác!`
      )
      .setFooter({ text: `⏱️ Hồi: ${cdSec}s` });
  } else {
    const typeTag = caught.type === "fantasy" ? "🌌 Giả Tưởng" : "🌊 Thật";
    let desc =
      `**${typeTag}** · ${RARITY_LABEL[result.rarity]}\n` +
      (caught.desc ? `*${caught.desc}*\n` : "") +
      `\n💰 **${formatVND(caught.value)}** · ✨ +${caught.xp} XP` +
      (baitType !== "none" ? `\n🎯 ${BAIT_LABEL[baitType]} (còn ${Math.max(0,baitLeft)})` : "");
    if (extra) {
      desc += `\n\n🕸️ **Lưới bắt thêm:** ${extra.fish.emoji} ${extra.fish.name} [${RARITY_LABEL[extra.rarity]}]\n💰 ${formatVND(extra.fish.value)}`;
    }
    embed = new EmbedBuilder()
      .setColor(RARITY_COLOR[result.rarity])
      .setTitle(`${caught.emoji}  ${caught.name}`)
      .setDescription(desc)
      .addFields(
        { name:"Cần câu",   value:`Level ${g.rodLevel}`, inline:true },
        { name:"Tổng cá",   value:`${newTotal}`,          inline:true },
        { name:"Hồi chiêu", value:`${cdSec}s`,            inline:true },
      )
      .setFooter({ text:"📦 /banca để bán cá" });
  }

  return { ok: true, embed, cooldownMs };
}

// ═══════════════════════════════════════════════════════════
// UI BUILDERS
// ═══════════════════════════════════════════════════════════
function buildMainRow(cdSec: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("fish_again").setLabel(`🎣 Câu lại (${cdSec}s)`).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("fish_bait").setLabel("🪱 Đổi mồi").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("fish_sell").setLabel("💰 Bán cá").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("fish_stop").setLabel("❌").setStyle(ButtonStyle.Danger),
  );
}

function buildBaitRow(g: GearRow, userId: string) {
  const cur = baitPrefs.get(userId) ?? "auto";
  const active = ButtonStyle.Success;
  const normal = ButtonStyle.Secondary;
  const btns = [
    new ButtonBuilder().setCustomId("bait_auto").setLabel("🔄 Tự động").setStyle(cur==="auto" ? active : normal),
    new ButtonBuilder().setCustomId("bait_none").setLabel("🚫 Không mồi").setStyle(cur==="none" ? active : normal),
  ];
  if (g.bait > 0)
    btns.push(new ButtonBuilder().setCustomId("bait_basic").setLabel(`🪱 Giun (${g.bait})`).setStyle(cur==="basic" ? active : normal));
  if (g.baitGold > 0)
    btns.push(new ButtonBuilder().setCustomId("bait_premium").setLabel(`🦐 Tôm (${g.baitGold})`).setStyle(cur==="premium" ? active : normal));
  if (g.baitDivine > 0)
    btns.push(new ButtonBuilder().setCustomId("bait_legendary").setLabel(`✨ Vàng (${g.baitDivine})`).setStyle(cur==="legendary" ? active : normal));
  return new ActionRowBuilder<ButtonBuilder>().addComponents(...btns.slice(0, 5));
}

// ═══════════════════════════════════════════════════════════
// SLASH COMMAND
// ═══════════════════════════════════════════════════════════
export const data = new SlashCommandBuilder()
  .setName("cauca")
  .setDescription("🎣 Câu cá kiếm tiền! Cần cần câu từ /shopcauca");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId   = interaction.user.id;
  const username = interaction.user.username;

  // Hủy collector cũ — tránh nhiều collector chạy đồng thời
  activeCollectors.get(userId)?.stop("replaced");
  activeCollectors.delete(userId);

  // Guard: đang câu
  if (isFishing.has(userId)) {
    await interaction.reply({ content:"🎣 Đang câu rồi, đợi xíu!", ephemeral:true });
    return;
  }

  // Kiểm tra cooldown trước khi animate
  const gearRows = await db.select().from(userFishingGearTable)
    .where(eq(userFishingGearTable.discordId, userId)).limit(1);

  if (gearRows.length === 0 || !gearRows[0]!.hasRod) {
    await interaction.reply({
      content:"🎣 Bạn chưa có cần câu! Mua từ **/shopcauca** nhé.",
      ephemeral:true,
    });
    return;
  }

  const g = gearRows[0]!;
  const cdMs = getCooldownMs(g.cooldownLevel);
  const last = fishingCooldowns.get(userId) ?? 0;
  if (Date.now() - last < cdMs) {
    const rem = ((cdMs - (Date.now() - last)) / 1000).toFixed(1);
    await interaction.reply({ content:`⏰ Đợi **${rem}s** nữa!`, ephemeral:true });
    return;
  }

  isFishing.add(userId);
  const msg = await interaction.reply({ content:"🎣 Đang thả câu xuống nước... 🌊", fetchReply:true });
  await sleep(1800);

  const result = await doFishing(userId, username).finally(() => isFishing.delete(userId));

  if (!result.ok) {
    if (result.reason === "COOLDOWN") {
      const rem = ((result.remainingMs ?? 0) / 1000).toFixed(1);
      await interaction.editReply({ content:`⏰ Đợi **${rem}s** nữa!` });
    }
    return;
  }

  const cdSec = result.cooldownMs / 1000;
  await interaction.editReply({ content:"", embeds:[result.embed], components:[buildMainRow(cdSec)] });

  // ── Collector ──────────────────────────────────────────────
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 300_000,
  });

  activeCollectors.set(userId, collector);

  collector.on("collect", async (i: ButtonInteraction) => {
    if (i.user.id !== userId) {
      await i.reply({ content:"Không phải của bạn!", ephemeral:true });
      return;
    }

    // ── Dừng ────────────────────────────────────────────────
    if (i.customId === "fish_stop") {
      collector.stop("user");
      await i.update({ components:[] });
      return;
    }

    // ── Bán cá ──────────────────────────────────────────────
    if (i.customId === "fish_sell") {
      await i.reply({ content:"Dùng lệnh **/banca** để bán cá nhé!", ephemeral:true });
      return;
    }

    // ── Đổi mồi ─────────────────────────────────────────────
    if (i.customId === "fish_bait") {
      const freshGear = await db.select().from(userFishingGearTable)
        .where(eq(userFishingGearTable.discordId, userId)).limit(1);
      const fg = freshGear[0] ?? g;
      const cur = baitPrefs.get(userId) ?? "auto";
      const labels: Record<BaitPref, string> = {
        auto:"🔄 Tự động", none:"🚫 Không mồi",
        basic:"🪱 Mồi Giun", premium:"🦐 Mồi Tôm", legendary:"✨ Mồi Vàng",
      };
      await i.reply({
        content:`🪱 **Chọn mồi sử dụng** (hiện tại: **${labels[cur]}**)\nMồi có sẵn: 🪱${fg.bait} 🦐${fg.baitGold} ✨${fg.baitDivine}`,
        components:[buildBaitRow(fg, userId)],
        ephemeral:true,
      });
      return;
    }

    // ── Chọn mồi ────────────────────────────────────────────
    if (i.customId.startsWith("bait_")) {
      const pref = i.customId.replace("bait_", "") as BaitPref;
      baitPrefs.set(userId, pref);
      const labels: Record<BaitPref, string> = {
        auto:"🔄 Tự động (ưu tiên tốt nhất)", none:"🚫 Không dùng mồi",
        basic:"🪱 Mồi Giun", premium:"🦐 Mồi Tôm", legendary:"✨ Mồi Vàng",
      };
      await i.update({ content:`✅ **${labels[pref]}**`, components:[] });
      return;
    }

    // ── Câu lại ──────────────────────────────────────────────
    if (i.customId === "fish_again") {
      if (isFishing.has(userId)) {
        await i.reply({ content:"🎣 Đang câu rồi, đợi xíu!", ephemeral:true });
        return;
      }

      const nowCd = getCooldownMs(g.cooldownLevel);
      const lastTs = fishingCooldowns.get(userId) ?? 0;
      if (Date.now() - lastTs < nowCd) {
        const rem = ((nowCd - (Date.now() - lastTs)) / 1000).toFixed(1);
        await i.reply({ content:`⏰ Đợi **${rem}s** nữa!`, ephemeral:true });
        return;
      }

      isFishing.add(userId);
      await i.deferUpdate();
      await i.editReply({ content:"🎣 Đang thả câu xuống nước... 🌊", embeds:[], components:[] });
      await sleep(1800);

      const freshGear = await db.select().from(userFishingGearTable)
        .where(eq(userFishingGearTable.discordId, userId)).limit(1);
      const fg = freshGear[0] ?? g;
      const freshCd = getCooldownMs(fg.cooldownLevel);

      const res = await doFishing(userId, username).finally(() => isFishing.delete(userId));
      if (!res.ok) {
        if (res.reason === "COOLDOWN") {
          const rem = ((res.remainingMs ?? 0) / 1000).toFixed(1);
          await i.editReply({ content:`⏰ Đợi **${rem}s** nữa!`, embeds:[], components:[buildMainRow(freshCd/1000)] });
        }
        return;
      }
      await i.editReply({ content:"", embeds:[res.embed], components:[buildMainRow(res.cooldownMs/1000)] });
    }
  });

  collector.on("end", (_, reason) => {
    activeCollectors.delete(userId);
    if (reason !== "user" && reason !== "replaced") {
      interaction.editReply({ components:[] }).catch(() => {});
    }
  });
    }
