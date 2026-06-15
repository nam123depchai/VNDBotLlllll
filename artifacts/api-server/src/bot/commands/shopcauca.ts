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
import { db, userFishingGearTable, discordUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getOrCreateUser } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";

// ============================================================
// SHOP ITEMS
// ============================================================

type ShopCategory = "rod" | "cooldown" | "bait" | "bait_gold" | "bait_divine";

type ShopItem = {
  id: string;
  name: string;
  emoji: string;
  price: number;
  desc: string;
  detail: string;
  category: ShopCategory;
  rodLevel?: number;
  cooldownLevel?: number;
  baitQty?: number;
  baitType?: "basic" | "premium" | "legendary";
};

const SHOP_ITEMS: ShopItem[] = [
  // ───── Cần câu ─────
  {
    id: "rod_1",    name: "Cần Câu Gỗ",     emoji: "🎣", price: 500_000,
    desc: "Cần câu cơ bản",
    detail: "Mở khóa cá không phổ biến (Lóc, Trê, Chép...)",
    category: "rod", rodLevel: 1,
  },
  {
    id: "rod_2",    name: "Cần Câu Pro",     emoji: "🦯", price: 2_000_000,
    desc: "Cần câu chuyên nghiệp",
    detail: "Mở khóa cá hiếm (Hồi, Ngừ, Mú, Tôm Hùm...)",
    category: "rod", rodLevel: 2,
  },
  {
    id: "rod_3",    name: "Cần Câu Legend",  emoji: "⚡", price: 10_000_000,
    desc: "Cần câu huyền thoại",
    detail: "Mở khóa cá sử thi + cá giả tưởng (Lửa, Băng, Rồng...)",
    category: "rod", rodLevel: 3,
  },
  {
    id: "rod_4",    name: "Cần Câu Thần",   emoji: "🌟", price: 50_000_000,
    desc: "Cần câu siêu thần thánh",
    detail: "Mở khóa cá MYTHIC: Rồng Cổ Đại, Thần Vương, Vũ Trụ (giá trị lên đến 2 tỷ!)",
    category: "rod", rodLevel: 4,
  },

  // ───── Phao câu (cooldown reduction) ─────
  {
    id: "float_1",  name: "Phao Câu Đá",    emoji: "🪨", price: 300_000,
    desc: "Giảm 3 giây hồi chiêu",
    detail: "20s → 17s mỗi lần câu",
    category: "cooldown", cooldownLevel: 1,
  },
  {
    id: "float_2",  name: "Phao Câu Bạc",   emoji: "🥈", price: 1_500_000,
    desc: "Giảm 8 giây hồi chiêu",
    detail: "20s → 12s mỗi lần câu",
    category: "cooldown", cooldownLevel: 2,
  },
  {
    id: "float_3",  name: "Phao Câu Vàng",  emoji: "🥇", price: 8_000_000,
    desc: "Giảm 15 giây hồi chiêu",
    detail: "20s → 5s (TỐI THIỂU) mỗi lần câu!",
    category: "cooldown", cooldownLevel: 3,
  },

  // ───── Mồi Giun (basic) ─────
  {
    id: "bait_10",   name: "Mồi Giun x10",  emoji: "🪱", price: 50_000,
    desc: "Mồi cơ bản",
    detail: "+150% tỷ lệ cá không phổ biến, -70% rác",
    category: "bait", baitQty: 10, baitType: "basic",
  },
  {
    id: "bait_50",   name: "Mồi Giun x50",  emoji: "🪱", price: 200_000,
    desc: "Tiết kiệm hơn mua lẻ",
    detail: "+150% tỷ lệ cá không phổ biến, -70% rác",
    category: "bait", baitQty: 50, baitType: "basic",
  },
  {
    id: "bait_100",  name: "Mồi Giun x100", emoji: "🪱", price: 350_000,
    desc: "Gói siêu lớn",
    detail: "+150% tỷ lệ cá không phổ biến, -70% rác",
    category: "bait", baitQty: 100, baitType: "basic",
  },

  // ───── Mồi Tôm (premium) ─────
  {
    id: "pbait_10",  name: "Mồi Tôm x10",   emoji: "🦐", price: 200_000,
    desc: "Mồi cao cấp",
    detail: "+150% cá hiếm, +50% cá sử thi, -70% rác",
    category: "bait_gold", baitQty: 10, baitType: "premium",
  },
  {
    id: "pbait_50",  name: "Mồi Tôm x50",   emoji: "🦐", price: 800_000,
    desc: "Gói mồi tôm tiết kiệm",
    detail: "+150% cá hiếm, +50% cá sử thi, -70% rác",
    category: "bait_gold", baitQty: 50, baitType: "premium",
  },

  // ───── Mồi Vàng (legendary) ─────
  {
    id: "lbait_5",   name: "Mồi Vàng x5",   emoji: "✨", price: 1_000_000,
    desc: "Mồi huyền thoại",
    detail: "+200% cá huyền thoại, +200% cá mythic! Hiếm nhất.",
    category: "bait_divine", baitQty: 5, baitType: "legendary",
  },
  {
    id: "lbait_20",  name: "Mồi Vàng x20",  emoji: "✨", price: 3_500_000,
    desc: "Gói Mồi Vàng",
    detail: "+200% cá huyền thoại, +200% cá mythic! Hiếm nhất.",
    category: "bait_divine", baitQty: 20, baitType: "legendary",
  },
];

const CATEGORIES = [
  { value: "rod",            label: "🎣 Cần Câu",       description: "4 loại cần câu từ gỗ đến thần thánh" },
  { value: "cooldown",       label: "🎯 Phao Câu",       description: "Giảm thời gian hồi chiêu xuống 5s" },
  { value: "bait",     label: "🪱 Mồi Giun",       description: "Mồi cơ bản tăng cá không phổ biến" },
  { value: "bait_gold",   label: "🦐 Mồi Tôm",        description: "Mồi cao cấp tăng cá hiếm+" },
  { value: "bait_divine", label: "✨ Mồi Vàng",       description: "Mồi thần tăng cá huyền thoại & mythic" },
];

// ============================================================
// BUILD EMBEDS
// ============================================================

function buildCategoryEmbed(
  category: string,
  gear: { rodLevel: number; cooldownLevel: number; bait: number; baitGold: number; baitDivine: number } | null,
  balance: number,
): EmbedBuilder {
  const items = SHOP_ITEMS.filter((i) => i.category === category);
  const cat = CATEGORIES.find((c) => c.value === category)!;

  let gearStatus = "";
  if (gear) {
    gearStatus =
      `🎣 Cần câu: Level ${gear.rodLevel}  |  🎯 Phao: Level ${gear.cooldownLevel}\n` +
      `🪱 Mồi Giun: ${gear.bait}  |  🦐 Mồi Tôm: ${gear.baitGold}  |  ✨ Mồi Vàng: ${gear.baitDivine}\n`;
  }

  let desc = `💰 **Số dư:** ${formatVND(balance)}\n${gearStatus}\n`;

  for (const item of items) {
    const owned = checkOwned(item, gear);
    const statusIcon = owned ? "✅" : "🛒";
    desc += `${item.emoji} **${item.name}** — ${formatVND(item.price)}  ${statusIcon}\n`;
    desc += `> ${item.desc} — *${item.detail}*\n\n`;
  }

  return new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle(`🛒 Shop Câu Cá — ${cat.label}`)
    .setDescription(desc)
    .setFooter({ text: "Chọn danh mục phía trên · Nhấn nút để mua" });
}

function checkOwned(item: ShopItem, gear: { rodLevel: number; cooldownLevel: number } | null): boolean {
  if (!gear) return false;
  if (item.rodLevel   !== undefined) return gear.rodLevel   >= item.rodLevel;
  if (item.cooldownLevel !== undefined) return gear.cooldownLevel >= item.cooldownLevel;
  return false; // consumables always buyable
}

function buildBuyButtons(category: string, gear: { rodLevel: number; cooldownLevel: number } | null) {
  const items = SHOP_ITEMS.filter((i) => i.category === category);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let row = new ActionRowBuilder<ButtonBuilder>();

  for (const item of items) {
    const owned = checkOwned(item, gear);
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`buy_${item.id}`)
        .setLabel(item.name)
        .setStyle(owned ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setEmoji(item.emoji)
        .setDisabled(owned && item.baitType === undefined), // disable if rod/float already owned
    );
    if (row.components.length === 3) {
      rows.push(row);
      row = new ActionRowBuilder<ButtonBuilder>();
    }
  }
  if (row.components.length > 0) rows.push(row);
  return rows;
}

// ============================================================
// COMMAND
// ============================================================

export const data = new SlashCommandBuilder()
  .setName("shopcauca")
  .setDescription("🛒 Cửa hàng câu cá — cần, phao, mồi đa dạng");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const user = await getOrCreateUser(userId, interaction.user.username);

  const gearRows = await db.select().from(userFishingGearTable)
    .where(eq(userFishingGearTable.discordId, userId)).limit(1);
  const gear = gearRows[0] ?? null;

  let currentCategory = "rod";

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("shop_category")
    .setPlaceholder("📂 Chọn danh mục...")
    .addOptions(
      CATEGORIES.map((c) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(c.label)
          .setDescription(c.description)
          .setValue(c.value)
          .setDefault(c.value === currentCategory)
      )
    );

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const embed = buildCategoryEmbed(currentCategory, gear ? {
    rodLevel: gear.rodLevel, cooldownLevel: gear.cooldownLevel,
    bait: gear.bait, baitGold: gear.baitGold, baitDivine: gear.baitDivine,
  } : null, user.balance);

  const buyRows = buildBuyButtons(currentCategory, gear ? { rodLevel: gear.rodLevel, cooldownLevel: gear.cooldownLevel } : null);

  const reply = await interaction.reply({
    embeds: [embed],
    components: [selectRow, ...buyRows],
    ephemeral: true,
  });

  const collector = reply.createMessageComponentCollector({ time: 120_000 });

  collector.on("collect", async (i) => {
    if (i.user.id !== userId) {
      await i.reply({ content: "Không phải của bạn!", ephemeral: true });
      return;
    }

    // ── Category switch ──
    if (i.componentType === ComponentType.StringSelect && i.customId === "shop_category") {
      currentCategory = i.values[0]!;
      const latestGear = (await db.select().from(userFishingGearTable).where(eq(userFishingGearTable.discordId, userId)).limit(1))[0] ?? null;
      const latestUser = await getOrCreateUser(userId, interaction.user.username);

      const updatedSelect = new StringSelectMenuBuilder()
        .setCustomId("shop_category")
        .setPlaceholder("📂 Chọn danh mục...")
        .addOptions(
          CATEGORIES.map((c) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(c.label).setDescription(c.description).setValue(c.value).setDefault(c.value === currentCategory)
          )
        );

      await i.update({
        embeds: [buildCategoryEmbed(currentCategory, latestGear ? {
          rodLevel: latestGear.rodLevel, cooldownLevel: latestGear.cooldownLevel,
          bait: latestGear.bait, baitGold: latestGear.baitGold, baitDivine: latestGear.baitDivine,
        } : null, latestUser.balance)],
        components: [
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(updatedSelect),
          ...buildBuyButtons(currentCategory, latestGear ? { rodLevel: latestGear.rodLevel, cooldownLevel: latestGear.cooldownLevel } : null),
        ],
      });
      return;
    }

    // ── Buy button ──
    if (i.componentType === ComponentType.Button && i.customId.startsWith("buy_")) {
      const itemId = i.customId.replace("buy_", "");
      const item = SHOP_ITEMS.find((s) => s.id === itemId);
      if (!item) return;

      const latestUser = await getOrCreateUser(userId, interaction.user.username);
      if (latestUser.balance < item.price) {
        await i.reply({ content: `❌ Không đủ tiền! Cần **${formatVND(item.price)}**, bạn có **${formatVND(latestUser.balance)}**`, ephemeral: true });
        return;
      }

      // Deduct balance
      await db.update(discordUsersTable)
        .set({ balance: latestUser.balance - item.price, updatedAt: new Date() })
        .where(eq(discordUsersTable.discordId, userId));

      // Update gear
      const existingGear = await db.select().from(userFishingGearTable).where(eq(userFishingGearTable.discordId, userId)).limit(1);

      if (item.rodLevel !== undefined) {
        // Rod upgrade
        if (existingGear.length === 0) {
          await db.insert(userFishingGearTable).values({ discordId: userId, hasRod: true, rodLevel: item.rodLevel });
        } else {
          await db.update(userFishingGearTable)
            .set({ hasRod: true, rodLevel: item.rodLevel, updatedAt: new Date() })
            .where(eq(userFishingGearTable.id, existingGear[0]!.id));
        }
        await i.reply({ content: `✅ Đã mua **${item.name}**! Giờ có thể câu ${item.detail}`, ephemeral: true });

      } else if (item.cooldownLevel !== undefined) {
        // Float upgrade
        if (existingGear.length === 0) {
          await db.insert(userFishingGearTable).values({ discordId: userId, hasRod: false, cooldownLevel: item.cooldownLevel });
        } else {
          await db.update(userFishingGearTable)
            .set({ cooldownLevel: item.cooldownLevel, updatedAt: new Date() })
            .where(eq(userFishingGearTable.id, existingGear[0]!.id));
        }
        await i.reply({ content: `✅ Đã trang bị **${item.name}**! ${item.detail}`, ephemeral: true });

      } else if (item.baitType && item.baitQty) {
        // Bait purchase
        const cur = existingGear[0];
        const newBasic     = (cur?.bait ?? 0)          + (item.baitType === "basic"     ? item.baitQty : 0);
        const newPremium   = (cur?.baitGold ?? 0)   + (item.baitType === "premium"   ? item.baitQty : 0);
        const newLegendary = (cur?.baitDivine ?? 0) + (item.baitType === "legendary" ? item.baitQty : 0);

        if (!cur) {
          await db.insert(userFishingGearTable).values({
            discordId: userId, hasRod: false, bait: newBasic, baitGold: newPremium, baitDivine: newLegendary,
          });
        } else {
          await db.update(userFishingGearTable)
            .set({ bait: newBasic, baitGold: newPremium, baitDivine: newLegendary, updatedAt: new Date() })
            .where(eq(userFishingGearTable.id, cur.id));
        }
        await i.reply({
          content: `✅ Đã mua **${item.name}**! Tổng ${item.baitType === "basic" ? `🪱 ${newBasic}` : item.baitType === "premium" ? `🦐 ${newPremium}` : `✨ ${newLegendary}`} mồi`,
          ephemeral: true,
        });
      }

      // Refresh embed
      const refreshedGear = (await db.select().from(userFishingGearTable).where(eq(userFishingGearTable.discordId, userId)).limit(1))[0] ?? null;
      const refreshedUser = await getOrCreateUser(userId, interaction.user.username);
      const updatedSelect2 = new StringSelectMenuBuilder()
        .setCustomId("shop_category").setPlaceholder("📂 Chọn danh mục...")
        .addOptions(CATEGORIES.map((c) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(c.label).setDescription(c.description).setValue(c.value).setDefault(c.value === currentCategory)
        ));

      await interaction.editReply({
        embeds: [buildCategoryEmbed(currentCategory, refreshedGear ? {
          rodLevel: refreshedGear.rodLevel, cooldownLevel: refreshedGear.cooldownLevel,
          bait: refreshedGear.bait, baitGold: refreshedGear.baitGold, baitDivine: refreshedGear.baitDivine,
        } : null, refreshedUser.balance)],
        components: [
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(updatedSelect2),
          ...buildBuyButtons(currentCategory, refreshedGear ? { rodLevel: refreshedGear.rodLevel, cooldownLevel: refreshedGear.cooldownLevel } : null),
        ],
      });
    }
  });

  collector.on("end", () => {
    interaction.editReply({ components: [] }).catch(() => {});
  });
}
