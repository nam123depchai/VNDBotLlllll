import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { db, userFishingGearTable, discordUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getOrCreateUser } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";

const SHOP_ITEMS = [
  { id: "rod_basic", name: "Cần Câu Gỗ", emoji: "🎣", price: 500_000, desc: "Cần câu cơ bản, câu cá bình thường", type: "rod", level: 1 },
  { id: "rod_pro", name: "Cần Câu Pro", emoji: "🦯", price: 2_000_000, desc: "Cần câu chuyên nghiệp, tăng tỷ lệ cá quý", type: "rod", level: 2 },
  { id: "rod_legend", name: "Cần Câu Legend", emoji: "⚡", price: 10_000_000, desc: "Cần câu huyền thoại, tăng tỷ lệ cá hiếm", type: "rod", level: 3 },
  { id: "bait_10", name: "Mồi Câu x10", emoji: "🪱", price: 50_000, desc: "Mồi câu giúp tăng tỷ lệ bắt cá", type: "bait", quantity: 10 },
  { id: "bait_50", name: "Mồi Câu x50", emoji: "🪱", price: 200_000, desc: "Gói mồi câu tiết kiệm", type: "bait", quantity: 50 },
  { id: "bait_100", name: "Mồi Câu x100", emoji: "🪱", price: 350_000, desc: "Gói mồi câu số lượng lớn", type: "bait", quantity: 100 },
];

export const data = new SlashCommandBuilder()
  .setName("shopcauca")
  .setDescription("Cửa hàng câu cá — mua cần, mồi, phụ kiện");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = await getOrCreateUser(interaction.user.id, interaction.user.username);

  const gear = await db
    .select()
    .from(userFishingGearTable)
    .where(eq(userFishingGearTable.discordId, interaction.user.id))
    .limit(1);

  const currentRod = gear[0]?.rodLevel ?? 0;
  const currentBait = gear[0]?.bait ?? 0;

  let description = `💰 Số dư: ${formatVND(user.balance)}\n🪱 Mồi hiện có: ${currentBait}\n\n`;

  for (const item of SHOP_ITEMS) {
    const canBuy = item.type === "rod" ? currentRod < item.level : true;
    const status = canBuy ? "✅" : "❌ Đã có";
    description += `${item.emoji} **${item.name}** — ${formatVND(item.price)} ${status}\n${item.desc}\n\n`;
  }

  const embed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("🎣 Shop Câu Cá")
    .setDescription(description)
    .setFooter({ text: "Nhấn nút để mua!" });

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < SHOP_ITEMS.length; i += 3) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (let j = i; j < Math.min(i + 3, SHOP_ITEMS.length); j++) {
      const item = SHOP_ITEMS[j]!;
      const canBuy = item.type === "rod" ? currentRod < item.level : true;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`buy_${item.id}`)
          .setLabel(`${item.name}`)
          .setStyle(ButtonStyle.Primary)
          .setEmoji(item.emoji)
          .setDisabled(!canBuy)
      );
    }
    rows.push(row);
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("shop_cancel").setLabel("Đóng").setStyle(ButtonStyle.Secondary)
    )
  );

  const reply = await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
  });

  collector.on("collect", async (i) => {
    if (i.user.id !== interaction.user.id) {
      await i.reply({ content: "Không phải của bạn!", ephemeral: true });
      return;
    }

    if (i.customId === "shop_cancel") {
      await i.update({ content: "Đã đóng shop.", embeds: [], components: [] });
      return;
    }

    const itemId = i.customId.replace("buy_", "");
    const item = SHOP_ITEMS.find((s) => s.id === itemId);
    if (!item) return;

    const updated = await getOrCreateUser(interaction.user.id, interaction.user.username);
    if (updated.balance < item.price) {
      await i.reply({ content: `❌ Không đủ tiền! Cần ${formatVND(item.price)}.`, ephemeral: true });
      return;
    }

    // Deduct
    await db
      .update(discordUsersTable)
      .set({ balance: updated.balance - item.price, updatedAt: new Date() })
      .where(eq(discordUsersTable.discordId, interaction.user.id));

    // Update gear
    const existingGear = await db
      .select()
      .from(userFishingGearTable)
      .where(eq(userFishingGearTable.discordId, interaction.user.id))
      .limit(1);

    if (item.type === "rod") {
      if (existingGear.length === 0) {
        await db.insert(userFishingGearTable).values({
          discordId: interaction.user.id,
          hasRod: true,
          rodLevel: item.level,
        });
      } else {
        await db
          .update(userFishingGearTable)
          .set({ hasRod: true, rodLevel: item.level, updatedAt: new Date() })
          .where(eq(userFishingGearTable.id, existingGear[0]!.id));
      }
    } else if (item.type === "bait") {
      const newBait = (existingGear[0]?.bait ?? 0) + item.quantity;
      if (existingGear.length === 0) {
        await db.insert(userFishingGearTable).values({
          discordId: interaction.user.id,
          hasRod: false,
          bait: newBait,
        });
      } else {
        await db
          .update(userFishingGearTable)
          .set({ bait: newBait, updatedAt: new Date() })
          .where(eq(userFishingGearTable.id, existingGear[0]!.id));
      }
    }

    await i.reply({
      content: `✅ Đã mua **${item.name}**! Còn ${formatVND(updated.balance - item.price)}`,
      ephemeral: true,
    });
  });
}
