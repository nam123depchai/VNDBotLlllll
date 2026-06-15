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
import { eq, and } from "drizzle-orm";
import { getOrCreateUser, addXp } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";
import { unlockAchievement } from "./thanhtich.js";

// Cấu hình Hệ thống Thuế khi bán cá (Theo file banca.ts của bạn là 10%)
const TAX_BOT_ID = "1504802232632082502";
const TAX_RATE = 0.10;

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
// COOLDOWN
// ═══════════════════════════════════════════════════════════
const COOLDOWNS = [20_000, 15_000, 10_000, 5_000];
function getCooldownMs(level: number) { return COOLDOWNS[level] ?? 20_000; }

type BaitType = "none" | "basic" | "premium" | "legendary";
type BaitPref = "auto" | "none" | "basic" | "premium" | "legendary";

const BAIT_LABEL: Record<BaitType, string> = {
  none: "", basic: "🪱 Mồi Giun", premium: "🦐 Mồi Tôm", legendary: "✨ Mồi Vàng",
};

const RARITY_COLOR: Record<FishRarity, number> = {
  trash:0x666666, common:0x99aabb, uncommon:0x00cc55, rare:0x0099ff,
  epic:0xaa00ff, legendary:0xffaa00, mythic:0xff2266,
};
const RARITY_LABEL: Record<FishRarity, string> = {
  trash:"Rác", common:"Thường", uncommon:"Không phổ biến", rare:"Hiếm",
  epic:"Sử thi", legendary:"Huyền thoại", mythic:"✨ THẦN THÁNH ✨",
};

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
const fishingCooldowns = new Map<string, number>();
const activeCollectors = new Map<string, { stop: (r?: string) => void }>();
const isFishing        = new Set<string>();
const baitPrefs        = new Map<string, BaitPref>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type GearRow = typeof userFishingGearTable.$inferSelect;

function resolveBaitType(g: GearRow, pref: BaitPref): BaitType {
  if (pref === "none")      return "none";
  if (pref === "legendary" && g.baitDivine > 0) return "legendary";
  if (pref === "premium"   && g.baitGold   > 0) return "premium";
  if (pref === "basic"     && g.bait       > 0) return "basic";
  if (pref !== "auto")     return "none";
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
// CORE FISHING
// ═══════════════════════════════════════════════════════════
type FishResult =
  | { ok: true; embed: EmbedBuilder; cooldownMs: number; fishValue: number; fishName: string; isTrash: boolean }
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

  fishingCooldowns.set(userId, Date.now());

  const pref     = baitPrefs.get(userId) ?? "auto";
  const baitType = resolveBaitType(g, pref);

  const upd: Partial<GearRow> = { updatedAt: new Date() };
  if (baitType === "legendary") upd.baitDivine = g.baitDivine - 1;
  else if (baitType === "premium") upd.baitGold = g.baitGold - 1;
  else if (baitType === "basic")   upd.bait     = g.bait - 1;
  if (Object.keys(upd).length > 1)
    await db.update(userFishingGearTable).set(upd).where(eq(userFishingGearTable.id, g.id));

  const result = rollFish(g.rodLevel, baitType, g.luckLevel);
  const caught = result.fish;
  const isTrash = result.rarity === "trash";

  let totalValue = caught.value;
  let summaryName = caught.name;

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

  // Lưới bắt thêm cá
  let extra: typeof result | null = null;
  if (!isTrash && g.hasNet && Math.random() < 0.25) {
    extra = rollFish(g.rodLevel, baitType, g.luckLevel);
    if (extra.rarity !== "trash") {
      await addToInventory(userId, extra.fish, extra.rarity);
      newTotal++;
      totalValue += extra.fish.value; 
      summaryName += ` + ${extra.fish.name}`; // Gộp tên lại để truyền vào customId nút bấm
      await db.update(userFishingGearTable)
        .set({ totalFishCaught: newTotal, updatedAt: new Date() })
        .where(eq(userFishingGearTable.id, g.id));
      if (extra.fish.xp > 0) await addXp(userId, extra.fish.xp).catch(() => {});
    } else { extra = null; }
  }

  const baitLeft = baitType === "legendary" ? g.baitDivine - 1
    : baitType === "premium" ? g.baitGold - 1
    : baitType === "basic"   ? g.bait - 1 : 0;

  // 🌟 ĐẾM GIÂY REALTIME: Tính toán Timestamp chuẩn của Discord
  const readyAtSeconds = Math.floor((Date.now() + cooldownMs) / 1000);

  let embed: EmbedBuilder;
  if (isTrash) {
    embed = new EmbedBuilder()
      .setColor(RARITY_COLOR.trash)
      .setTitle(`${caught.emoji} Câu được rác!`)
      .setDescription(
        `Bạn câu được... **${caught.name}** 😂\nKhông sao, lần sau cố lên!\n\n` +
        (baitType !== "none" ? `> ${BAIT_LABEL[baitType]} đã dùng (còn ${Math.max(0,baitLeft)})\n` : "") +
        `💡 Mua mồi ở **/shopcauca** để giảm rác!\n\n⏳ **Hồi chiêu:** Sẵn sàng <t:${readyAtSeconds}:R>`
      );
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
    
    desc += `\n\n⏳ **Hồi chiêu:** Sẵn sàng <t:${readyAtSeconds}:R>`;

    embed = new EmbedBuilder()
      .setColor(RARITY_COLOR[result.rarity])
      .setTitle(`${caught.emoji}  ${caught.name}`)
      .setDescription(desc)
      .addFields(
        { name:"Cần câu",   value:`Level ${g.rodLevel}`, inline:true },
        { name:"Tổng cá",   value:`${newTotal}`,          inline:true },
      );
  }

  return { ok: true, embed, cooldownMs, fishValue: totalValue, fishName: summaryName, isTrash };
}

// ═══════════════════════════════════════════════════════════
// UI BUILDERS
// ═══════════════════════════════════════════════════════════
// 🌟 NÂNG CẤP NÚT BẤM: Đính giá trị cá và Tên cá trực tiếp vào Id của Nút Bán cá để xử lý gọn nhẹ
function buildMainRow(fishValue: number, fishName: string, isTrash: boolean) {
  const btnRecatch = new ButtonBuilder()
    .setCustomId("fish_again")
    .setLabel("🎣 Câu tiếp")
    .setStyle(ButtonStyle.Success)
    .setDisabled(true); // Mặc định khóa nút câu lại cho đến khi hết cooldown thực tế

  const btnSell = new ButtonBuilder()
    .setCustomId(`fish_sell_${fishValue}_${fishName}`)
    .setLabel(isTrash ? "🗑️ Huỷ rác" : `💰 Bán ngay (+${formatVND(Math.floor(fishValue * (1 - TAX_RATE)))})`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(isTrash || fishValue <= 0); // Nếu là rác hoặc giá trị = 0 thì khóa nút bán luôn

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    btnRecatch,
    new ButtonBuilder().setCustomId("fish_bait").setLabel("🪱 Đổi mồi").setStyle(ButtonStyle.Secondary),
    btnSell,
    new ButtonBuilder().setCustomId("fish_shop").setLabel("🛒 Cửa hàng ngư cụ").setStyle(ButtonStyle.Secondary), // Nút mở shop nhanh
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

  activeCollectors.get(userId)?.stop("replaced");
  activeCollectors.delete(userId);

  if (isFishing.has(userId)) {
    await interaction.reply({ content:"🎣 Đang câu rồi, đợi xíu!", ephemeral:true });
    return;
  }

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

  // Thiết lập ActionRow chứa các nút bấm động
  const mainRow = buildMainRow(result.fishValue, result.fishName, result.isTrash);
  await interaction.editReply({ content:"", embeds:[result.embed], components:[mainRow] });

  // 🌟 MẸO KÍCH HOẠT NÚT CÂU LẠI: Chờ đúng số mili-giây hồi chiêu rồi mở khóa nút
  setTimeout(async () => {
    try {
      const components = msg.components[0];
      if (!components) return;
      
      const buttons = components.components.map(c => ButtonBuilder.from(c as any));
      // Nút thứ nhất (index 0) chính là nút Câu Tiếp
      buttons[0].setDisabled(false).setLabel("🎣 Câu tiếp ngay!");
      
      const updatedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
      await interaction.editReply({ components: [updatedRow] });
    } catch {
      // Bỏ qua nếu tin nhắn bị xoá hoặc người dùng đổi giao diện mồi/bán cá
    }
  }, result.cooldownMs);

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

    if (i.customId === "fish_stop") {
      collector.stop("user");
      await i.update({ components:[] });
      return;
    }

    // 🌟 XỬ LÝ HÀNH ĐỘNG: BÁN CÁ NGAY TẠI CHỖ
    if (i.customId.startsWith("fish_sell_")) {
      collector.stop("sold");
      await i.deferUpdate();

      const [_, __, valueStr, fishName] = i.customId.split("_");
      const grossValue = parseInt(valueStr, 10);
      
      // Tính toán thuế 10% y hệt file banca.ts của bạn
      const taxAmount = Math.floor(grossValue * TAX_RATE);
      const netEarned = grossValue - taxAmount;

      const user = await getOrCreateUser(userId, username);
      
      // 1. Cộng tiền ròng sau thuế cho người chơi
      await db
        .update(discordUsersTable)
        .set({ balance: user.balance + netEarned, updatedAt: new Date() })
        .where(eq(discordUsersTable.discordId, userId));

      // 2. Trích tiền thuế chuyển vào tài khoản Bot
      if (taxAmount > 0) {
        const botUser = await getOrCreateUser(TAX_BOT_ID, "Bot Thuế");
        await db
          .update(discordUsersTable)
          .set({ balance: botUser.balance + taxAmount, updatedAt: new Date() })
          .where(eq(discordUsersTable.discordId, TAX_BOT_ID));
      }

      // Xoá con cá vừa câu ra khỏi túi (Bởi vì lúc câu trúng, hàm doFishing đã lưu vào DB rồi)
      // Tìm bản ghi cá của user để giảm số lượng đi 1 (hoặc xoá nếu chỉ có 1 con)
      const fishNames = fishName.split(" + "); // Tách ra phòng trường hợp dính lưới bắt 2 cá
      for (const name of fishNames) {
        const existing = await db.select().from(fishInventoryTable)
          .where(and(eq(fishInventoryTable.discordId, userId), eq(fishInventoryTable.fishName, name)))
          .limit(1);
        if (existing.length > 0) {
          if (existing[0]!.quantity <= 1) {
            await db.delete(fishInventoryTable).where(eq(fishInventoryTable.id, existing[0]!.id));
          } else {
            await db.update(fishInventoryTable)
              .set({ quantity: existing[0]!.quantity - 1 })
              .where(eq(fishInventoryTable.id, existing[0]!.id));
          }
        }
      }

      const sellEmbed = new EmbedBuilder()
        .setColor(0x00cc66)
        .setTitle("💰 Đã Bán Cá Siêu Tốc!")
        .setDescription(`Bạn đã bán **${fishName}** trực tiếp cho thương lái tại bến thuyền!\n\n💵 Thu nhập ròng: **+${formatVND(netEarned)}**\n💸 Khấu trừ thuế (${TAX_RATE * 100}%): \`${formatVND(taxAmount)}\``)
        .addFields({ name: "🏦 Số dư ví của bạn", value: `**${formatVND(user.balance + netEarned)}**` })
        .setTimestamp();

      // Giữ lại nút Câu Tiếp và nút Shop, tắt nút Bán đi
      const components = msg.components[0];
      const buttons = components.components.map(c => ButtonBuilder.from(c as any));
      
      // Vô hiệu hoá nút bán cá (Index 2)
      buttons[2].setDisabled(true).setLabel("❌ Đã bán cá");
      
      // Kiểm tra xem thời gian hồi chiêu gốc đã qua chưa để mở/khoá nút Câu tiếp
      const lastTs = fishingCooldowns.get(userId) ?? 0;
      const currentCd = getCooldownMs(g.cooldownLevel);
      const isCdOver = Date.now() - lastTs >= currentCd;
      buttons[0].setDisabled(!isCdOver).setLabel(isCdOver ? "🎣 Câu tiếp ngay!" : "🎣 Câu tiếp (Đang hồi)");

      await i.editReply({ embeds: [sellEmbed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)] });
      return;
    }

    // 🌟 XỬ LÝ HÀNH ĐỘNG: MỞ SHOP CAU CA LUÔN
    if (i.customId === "fish_shop") {
      collector.stop("shop");
      await i.deferUpdate();

      const shopEmbed = new EmbedBuilder()
        .setColor(0xffaa00)
        .setTitle("🛒 Tiệm Đồ Câu Cá Bird Bot")
        .setDescription("Chào mừng đạo hữu đến tiệm đạo cụ! Vui lòng sử dụng các lệnh dưới đây để mua sắm nâng cấp:\n\n🎋 **Mua cần câu mới / mồi xịn:** Sử dụng lệnh `/shopcauca` để xem danh mục và click mua tự động.\n\n*(Giao diện nút mua sắm trực tiếp tại bảng câu đang được đồng bộ hóa hệ thống dữ liệu)*")
        .setFooter({ text: "Mẹo: Gõ lệnh /shopcauca để nâng cấp cần và mua mồi nhanh nhất!" });

      await i.editReply({ embeds: [shopEmbed], components: [] }); // Dọn dẹp hết các nút câu cá
      return;
    }

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

      const res = await doFishing(userId, username).finally(() => isFishing.delete(userId));
      if (!res.ok) {
        if (res.reason === "COOLDOWN") {
          const rem = ((res.remainingMs ?? 0) / 1000).toFixed(1);
          await i.editReply({ content:`⏰ Đợi **${rem}s** nữa!`, embeds:[], components:[buildMainRow(0, "", true)] });
        }
        return;
      }

      const nextRow = buildMainRow(res.fishValue, res.fishName, res.isTrash);
      await i.editReply({ content:"", embeds:[res.embed], components:[nextRow] });

      // Kích hoạt lại bộ đếm cho nút câu tiếp ở lượt bấm lại này
      setTimeout(async () => {
        try {
          const comps = msg.components[0];
          if (!comps) return;
          const bts = comps.components.map(c => ButtonBuilder.from(c as any));
          bts[0].setDisabled(false).setLabel("🎣 Câu tiếp ngay!");
          await interaction.editReply({ components: [new ActionRowBuilder<ButtonBuilder>().addComponents(...bts)] });
        } catch {}
      }, res.cooldownMs);
    }
  });

  collector.on("end", (_, reason) => {
    activeCollectors.delete(userId);
    if (reason !== "user" && reason !== "replaced" && reason !== "sold" && reason !== "shop") {
      interaction.editReply({ components:[] }).catch(() => {});
    }
  });
}
