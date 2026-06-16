import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
} from "discord.js";
import { db, bossGearTable, bossPetTable, discordUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getOrCreateUser } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";

// ============================================================
// SHOP ITEMS
// ============================================================

type ShopCategory = "weapon" | "armor" | "potion" | "revive" | "pet";

type ShopItem = {
  id: string;
  name: string;
  emoji: string;
  price: number;
  desc: string;
  detail: string;
  category: ShopCategory;
  weaponLevel?: number;
  armorLevel?: number;
  potionQty?: number;
  reviveQty?: number;
  petType?: string;
};

const PET_INFO: Record<string, { name: string; emoji: string; atk: number; def: number; crit: number }> = {
  cho:     { name: "Cún Con",     emoji: "🐶", atk: 5,  def: 5,  crit: 0 },
  meo:     { name: "Mèo Thần",    emoji: "🐱", atk: 0,  def: 5,  crit: 8 },
  rong:    { name: "Rồng Nhỏ",    emoji: "🐲", atk: 12, def: 0,  crit: 5 },
  phoenix: { name: "Phượng Hoàng", emoji: "🔥", atk: 8,  def: 8,  crit: 0 },
  ho:      { name: "Hổ Vương",    emoji: "🐯", atk: 15, def: 0,  crit: 0 },
};

const SHOP_ITEMS: ShopItem[] = [
  // ───── Vũ khí (tăng % sát thương) ─────
  { id: "wp_1", name: "Kiếm Sắt",     emoji: "🗡️", price: 800_000,    desc: "+10% sát thương", detail: "Trang bị cơ bản cho đấu boss", category: "weapon", weaponLevel: 1 },
  { id: "wp_2", name: "Kiếm Bạc",     emoji: "⚔️", price: 3_000_000,  desc: "+20% sát thương", detail: "Sắc hơn, mạnh hơn", category: "weapon", weaponLevel: 2 },
  { id: "wp_3", name: "Kiếm Rồng",    emoji: "🔪", price: 10_000_000, desc: "+35% sát thương", detail: "Rèn từ vảy rồng cổ đại", category: "weapon", weaponLevel: 3 },
  { id: "wp_4", name: "Đại Kiếm Thần", emoji: "🛡️", price: 30_000_000, desc: "+55% sát thương", detail: "Vũ khí cấp thần thoại", category: "weapon", weaponLevel: 4 },
  { id: "wp_5", name: "Kiếm Diệt Thế", emoji: "✨", price: 80_000_000, desc: "+80% sát thương", detail: "Một nhát chém, trời long đất lở", category: "weapon", weaponLevel: 5 },

  // ───── Giáp (giảm % sát thương nhận) ─────
  { id: "ar_1", name: "Giáp Da",      emoji: "🧥", price: 800_000,    desc: "-10% dmg nhận", detail: "Bảo vệ cơ bản", category: "armor", armorLevel: 1 },
  { id: "ar_2", name: "Giáp Sắt",     emoji: "🦺", price: 3_000_000,  desc: "-18% dmg nhận", detail: "Chắc chắn hơn nhiều", category: "armor", armorLevel: 2 },
  { id: "ar_3", name: "Giáp Rồng",    emoji: "🛡️", price: 10_000_000, desc: "-28% dmg nhận", detail: "Vảy rồng dệt thành áo giáp", category: "armor", armorLevel: 3 },
  { id: "ar_4", name: "Giáp Thần",    emoji: "👑", price: 30_000_000, desc: "-40% dmg nhận", detail: "Cấp thần thoại, gần như bất tử", category: "armor", armorLevel: 4 },
  { id: "ar_5", name: "Giáp Vô Cực",  emoji: "💠", price: 80_000_000, desc: "-55% dmg nhận", detail: "Tối thượng, khắc tinh của mọi boss", category: "armor", armorLevel: 5 },

  // ───── Bình hồi máu (mang theo trận, +1 lượt heal mỗi bình) ─────
  { id: "pot_3",  name: "Bình Máu x3",  emoji: "🧪", price: 500_000,   desc: "+3 lượt hồi máu dự trữ", detail: "Mang theo trận, dùng dần", category: "potion", potionQty: 3 },
  { id: "pot_10", name: "Bình Máu x10", emoji: "🧪", price: 1_500_000, desc: "+10 lượt hồi máu dự trữ", detail: "Gói tiết kiệm hơn", category: "potion", potionQty: 10 },

  // ───── Bùa hồi sinh (sống lại khi gục, dùng 1 lần) ─────
  { id: "rev_1", name: "Bùa Hồi Sinh",      emoji: "💍", price: 2_000_000, desc: "Sống lại 1 lần khi gục", detail: "Hồi 50% HP khi cận tử", category: "revive", reviveQty: 1 },
  { id: "rev_3", name: "Bùa Hồi Sinh x3",   emoji: "💍", price: 5_000_000, desc: "Sống lại 3 lần khi gục", detail: "Gói tiết kiệm hơn", category: "revive", reviveQty: 3 },

  // ───── Pet (chỉ 1 con, mua loại mới sẽ thay thế) ─────
  { id: "pet_cho",     name: "Cún Con",      emoji: "🐶", price: 1_000_000,  desc: "+5% ATK, +5% DEF",        detail: "Người bạn trung thành, cân bằng", category: "pet", petType: "cho" },
  { id: "pet_meo",     name: "Mèo Thần",     emoji: "🐱", price: 2_500_000,  desc: "+5% DEF, +8% Crit",       detail: "Né đòn khéo, ra tay chí mạng", category: "pet", petType: "meo" },
  { id: "pet_phoenix", name: "Phượng Hoàng", emoji: "🔥", price: 6_000_000,  desc: "+8% ATK, +8% DEF",        detail: "Bất tử trong huyền thoại, cân bằng cao", category: "pet", petType: "phoenix" },
  { id: "pet_rong",    name: "Rồng Nhỏ",     emoji: "🐲", price: 12_000_000, desc: "+12% ATK, +5% Crit",      detail: "Sức mạnh cổ đại, thiên về công", category: "pet", petType: "rong" },
  { id: "pet_ho",      name: "Hổ Vương",     emoji: "🐯", price: 20_000_000, desc: "+15% ATK",                detail: "Sát thương thuần khiết, không khoan nhượng", category: "pet", petType: "ho" },
];

const CATEGORIES = [
  { value: "weapon", label: "🗡️ Vũ Khí",      description: "Tăng % sát thương khi đấu boss" },
  { value: "armor",  label: "🛡️ Giáp",         description: "Giảm % sát thương nhận vào" },
  { value: "potion", label: "🧪 Bình Máu",      description: "Lượt hồi máu dự trữ mang theo trận" },
  { value: "revive", label: "💍 Bùa Hồi Sinh",  description: "Sống lại khi gục giữa trận" },
  { value: "pet",    label: "🐾 Pet",           description: "Thú cưởng đồng hành, buff chỉ số" },
];

// ============================================================
// HELPERS
// ============================================================

type GearState = { weaponLevel: number; armorLevel: number; potions: number; revives: number } | null;
type PetState = { petType: string; level: number } | null;

function buildCategoryEmbed(category: string, gear: GearState, pet: PetState, balance: number): EmbedBuilder {
  const items = SHOP_ITEMS.filter((i) => i.category === category);
  const cat = CATEGORIES.find((c) => c.value === category)!;

  let status = `🗡️ Vũ khí: Lv${gear?.weaponLevel ?? 0}  |  🛡️ Giáp: Lv${gear?.armorLevel ?? 0}\n`;
  status += `🧪 Bình máu: ${gear?.potions ?? 0}  |  💍 Bùa hồi sinh: ${gear?.revives ?? 0}\n`;
  status += pet ? `🐾 Pet hiện tại: ${PET_INFO[pet.petType]?.emoji ?? ""} ${PET_INFO[pet.petType]?.name ?? pet.petType} (Lv${pet.level})\n` : `🐾 Pet hiện tại: chưa có\n`;

  let desc = `💰 **Số dư:** ${formatVND(balance)}\n${status}\n`;

  for (const item of items) {
    const owned = checkOwned(item, gear, pet);
    const statusIcon = owned ? "✅" : "🛒";
    desc += `${item.emoji} **${item.name}** — ${formatVND(item.price)}  ${statusIcon}\n`;
    desc += `> ${item.desc} — *${item.detail}*\n\n`;
  }

  return new EmbedBuilder()
    .setColor(0xaa00ff)
    .setTitle(`🛒 Shop Đấu Boss — ${cat.label}`)
    .setDescription(desc)
    .setFooter({ text: "Chọn danh mục phía trên · Nhấn nút để mua" });
}

function checkOwned(item: ShopItem, gear: GearState, pet: PetState): boolean {
  if (item.weaponLevel !== undefined) return (gear?.weaponLevel ?? 0) >= item.weaponLevel;
  if (item.armorLevel !== undefined) return (gear?.armorLevel ?? 0) >= item.armorLevel;
  if (item.petType !== undefined) return pet?.petType === item.petType;
  return false; // potion/revive always buyable (consumable)
}

function buildBuyButtons(category: string, gear: GearState, pet: PetState) {
  const items = SHOP_ITEMS.filter((i) => i.category === category);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let row = new ActionRowBuilder<ButtonBuilder>();

  for (const item of items) {
    const owned = checkOwned(item, gear, pet);
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`buyboss_${item.id}`)
        .setLabel(item.name)
        .setStyle(owned ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setEmoji(item.emoji)
        .setDisabled(owned && item.category !== "potion" && item.category !== "revive"),
    );
    if (row.components.length === 3) {
      rows.push(row);
      row = new ActionRowBuilder<ButtonBuilder>();
    }
  }
  if (row.components.length > 0) rows.push(row);
  return rows;
}

function buildSelect(current: string): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("shopdauboss_category")
    .setPlaceholder("📂 Chọn danh mục...")
    .addOptions(
      CATEGORIES.map((c) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(c.label)
          .setDescription(c.description)
          .setValue(c.value)
          .setDefault(c.value === current)
      )
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

async function loadState(userId: string) {
  const gearRows = await db.select().from(bossGearTable).where(eq(bossGearTable.discordId, userId)).limit(1);
  const petRows = await db.select().from(bossPetTable).where(eq(bossPetTable.discordId, userId)).limit(1);
  return { gear: gearRows[0] ?? null, pet: petRows[0] ?? null };
}

// ============================================================
// COMMAND
// ============================================================

export const data = new SlashCommandBuilder()
  .setName("shopdauboss")
  .setDescription("🛒 Cửa hàng đấu boss — vũ khí, giáp, bình máu, bùa hồi sinh, pet");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const userId = interaction.user.id;
  const user = await getOrCreateUser(userId, interaction.user.username);

  let currentCategory = "weapon";
  const { gear, pet } = await loadState(userId);

  const reply = await interaction.editReply({
    embeds: [buildCategoryEmbed(currentCategory, gear, pet, user.balance)],
    components: [buildSelect(currentCategory), ...buildBuyButtons(currentCategory, gear, pet)],
  });

  const collector = reply.createMessageComponentCollector({ time: 120_000 });

  collector.on("collect", async (i) => {
    if (i.user.id !== userId) {
      await i.reply({ content: "Không phải của bạn!", ephemeral: true });
      return;
    }

    // ── Category switch ──
    if (i.componentType === ComponentType.StringSelect && i.customId === "shopdauboss_category") {
      currentCategory = i.values[0]!;
      const { gear: g, pet: p } = await loadState(userId);
      const u = await getOrCreateUser(userId, interaction.user.username);
      await i.update({
        embeds: [buildCategoryEmbed(currentCategory, g, p, u.balance)],
        components: [buildSelect(currentCategory), ...buildBuyButtons(currentCategory, g, p)],
      });
      return;
    }

    // ── Buy button ──
    if (i.componentType === ComponentType.Button && i.customId.startsWith("buyboss_")) {
      const itemId = i.customId.replace("buyboss_", "");
      const item = SHOP_ITEMS.find((s) => s.id === itemId);
      if (!item) return;

      const latestUser = await getOrCreateUser(userId, interaction.user.username);
      if (latestUser.balance < item.price) {
        await i.reply({ content: `❌ Không đủ tiền! Cần **${formatVND(item.price)}**, bạn có **${formatVND(latestUser.balance)}**`, ephemeral: true });
        return;
      }

      await db.update(discordUsersTable)
        .set({ balance: latestUser.balance - item.price, updatedAt: new Date() })
        .where(eq(discordUsersTable.discordId, userId));

      const { gear: existingGear, pet: existingPet } = await loadState(userId);

      if (item.weaponLevel !== undefined) {
        if (!existingGear) {
          await db.insert(bossGearTable).values({ discordId: userId, weaponLevel: item.weaponLevel });
        } else {
          await db.update(bossGearTable).set({ weaponLevel: item.weaponLevel, updatedAt: new Date() }).where(eq(bossGearTable.discordId, userId));
        }
        await i.reply({ content: `✅ Đã trang bị **${item.name}**! ${item.detail}`, ephemeral: true });

      } else if (item.armorLevel !== undefined) {
        if (!existingGear) {
          await db.insert(bossGearTable).values({ discordId: userId, armorLevel: item.armorLevel });
        } else {
          await db.update(bossGearTable).set({ armorLevel: item.armorLevel, updatedAt: new Date() }).where(eq(bossGearTable.discordId, userId));
        }
        await i.reply({ content: `✅ Đã trang bị **${item.name}**! ${item.detail}`, ephemeral: true });

      } else if (item.potionQty !== undefined) {
        const newQty = (existingGear?.potions ?? 0) + item.potionQty;
        if (!existingGear) {
          await db.insert(bossGearTable).values({ discordId: userId, potions: newQty });
        } else {
          await db.update(bossGearTable).set({ potions: newQty, updatedAt: new Date() }).where(eq(bossGearTable.discordId, userId));
        }
        await i.reply({ content: `✅ Đã mua **${item.name}**! Tổng 🧪 ${newQty} bình máu`, ephemeral: true });

      } else if (item.reviveQty !== undefined) {
        const newQty = (existingGear?.revives ?? 0) + item.reviveQty;
        if (!existingGear) {
          await db.insert(bossGearTable).values({ discordId: userId, revives: newQty });
        } else {
          await db.update(bossGearTable).set({ revives: newQty, updatedAt: new Date() }).where(eq(bossGearTable.discordId, userId));
        }
        await i.reply({ content: `✅ Đã mua **${item.name}**! Tổng 💍 ${newQty} bùa hồi sinh`, ephemeral: true });

      } else if (item.petType !== undefined) {
        const info = PET_INFO[item.petType]!;
        if (!existingPet) {
          await db.insert(bossPetTable).values({
            discordId: userId,
            petType: item.petType,
            name: info.name,
            level: 1,
            exp: 0,
            atkBonus: info.atk,
            defBonus: info.def,
            critBonus: info.crit,
          });
        } else {
          await db.update(bossPetTable).set({
            petType: item.petType,
            name: info.name,
            level: 1,
            exp: 0,
            atkBonus: info.atk,
            defBonus: info.def,
            critBonus: info.crit,
            updatedAt: new Date(),
          }).where(eq(bossPetTable.discordId, userId));
        }
        await i.reply({ content: `✅ Đã nhận pet **${info.emoji} ${info.name}**! Dùng \`/pet\` để xem & nuôi pet.`, ephemeral: true });
      }

      const { gear: refreshedGear, pet: refreshedPet } = await loadState(userId);
      const refreshedUser = await getOrCreateUser(userId, interaction.user.username);

      await interaction.editReply({
        embeds: [buildCategoryEmbed(currentCategory, refreshedGear, refreshedPet, refreshedUser.balance)],
        components: [buildSelect(currentCategory), ...buildBuyButtons(currentCategory, refreshedGear, refreshedPet)],
      });
    }
  });

  collector.on("end", () => {
    interaction.editReply({ components: [] }).catch(() => {});
  });
          }
