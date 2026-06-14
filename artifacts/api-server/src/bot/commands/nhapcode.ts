hereimport {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { db, redemptionCodesTable, codeRedemptionsTable, discordUsersTable, fishInventoryTable, userFishingGearTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getOrCreateUser, addXp } from "../utils/db-helpers.js";
import { formatVND } from "../utils/currency.js";

// Fish data nhỏ gọn để lookup emoji + value khi tặng cá
const FISH_META: Record<string, { emoji: string; value: number; rarity: string }> = {
  "Cá Rô Phi":        { emoji:"🐟", value:35_000,      rarity:"common" },
  "Cá Trê":           { emoji:"🐡", value:55_000,      rarity:"common" },
  "Cá Chép":          { emoji:"🎏", value:80_000,      rarity:"common" },
  "Cá Diêu Hồng":     { emoji:"🐠", value:120_000,     rarity:"common" },
  "Cá Lửa":           { emoji:"🔥", value:150_000,     rarity:"common" },
  "Cá Băng":          { emoji:"❄️", value:100_000,     rarity:"common" },
  "Cá Lóc":           { emoji:"🐟", value:400_000,     rarity:"uncommon" },
  "Cá Basa":          { emoji:"🐠", value:600_000,     rarity:"uncommon" },
  "Cá Mực Ống":       { emoji:"🦑", value:750_000,     rarity:"uncommon" },
  "Cá Thu":           { emoji:"🐡", value:900_000,     rarity:"uncommon" },
  "Cá Sấm Sét":       { emoji:"⚡", value:1_200_000,   rarity:"uncommon" },
  "Cá Bóng Tối":      { emoji:"🌑", value:900_000,     rarity:"uncommon" },
  "Cá Độc Dược":      { emoji:"☠️", value:1_000_000,   rarity:"uncommon" },
  "Cá Ngừ":           { emoji:"🐟", value:3_000_000,   rarity:"rare" },
  "Cá Mú Đỏ":         { emoji:"🐠", value:5_000_000,   rarity:"rare" },
  "Cá Kiếm":          { emoji:"⚔️", value:8_000_000,   rarity:"rare" },
  "Cá Hồi":           { emoji:"🐟", value:6_000_000,   rarity:"rare" },
  "Cá Rồng Đỏ":       { emoji:"🐉", value:15_000_000,  rarity:"rare" },
  "Cá Nguyệt":        { emoji:"🌙", value:12_000_000,  rarity:"rare" },
  "Cá Mặt Trời":      { emoji:"☀️", value:18_000_000,  rarity:"rare" },
  "Cá Tầm Beluga":    { emoji:"🐋", value:80_000_000,  rarity:"legendary" },
  "Cá Ngừ Vây Xanh":  { emoji:"🦈", value:120_000_000, rarity:"legendary" },
  "Cá Thần":          { emoji:"👑", value:200_000_000, rarity:"legendary" },
  "Cá Vũ Trụ":        { emoji:"🌌", value:500_000_000, rarity:"legendary" },
  "Cá Hỗn Mang":      { emoji:"🌀", value:300_000_000, rarity:"legendary" },
};

export const data = new SlashCommandBuilder()
  .setName("nhapcode")
  .setDescription("🎁 Nhập code đổi thưởng")
  .addStringOption((o) =>
    o.setName("code").setDescription("Nhập code vào đây").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id.toString();
  const rawCode = interaction.options.getString("code", true);
  const code = rawCode.toUpperCase().trim();

  const user = await getOrCreateUser(userId, interaction.user.username);

  // Tìm code
  const codeRow = await db.select().from(redemptionCodesTable)
    .where(eq(redemptionCodesTable.code, code)).limit(1);

  if (codeRow.length === 0 || !codeRow[0]!.isActive) {
    await interaction.reply({ content:"❌ Code không tồn tại hoặc đã bị vô hiệu hóa!", ephemeral:true });
    return;
  }

  const c = codeRow[0]!;

  // Kiểm tra hết hạn
  if (c.expiresAt && new Date() > c.expiresAt) {
    await interaction.reply({ content:"⌛ Code này đã hết hạn!", ephemeral:true });
    return;
  }

  // Kiểm tra đã dùng chưa
  const alreadyUsed = await db.select().from(codeRedemptionsTable)
    .where(and(eq(codeRedemptionsTable.code, code), eq(codeRedemptionsTable.userId, userId)))
    .limit(1);
  if (alreadyUsed.length > 0) {
    await interaction.reply({ content:"❌ Bạn đã nhập code này rồi!", ephemeral:true });
    return;
  }

  // Kiểm tra giới hạn lượt
  if (c.maxUses !== null && c.currentUses >= c.maxUses) {
    await interaction.reply({ content:"❌ Code này đã hết lượt sử dụng!", ephemeral:true });
    return;
  }

  await interaction.deferReply({ ephemeral:true });

  // Phát thưởng
  const rewards: string[] = [];

  if (c.money > 0) {
    await db.update(discordUsersTable)
      .set({ balance: user.balance + c.money, updatedAt: new Date() })
      .where(eq(discordUsersTable.discordId, userId));
    rewards.push(`💰 **${formatVND(c.money)}**`);
  }

  if (c.xp > 0) {
    await addXp(userId, c.xp).catch(() => {});
    rewards.push(`✨ **${c.xp} XP**`);
  }

  if (c.bait > 0 || c.baitGold > 0 || c.baitDivine > 0) {
    const gear = await db.select().from(userFishingGearTable)
      .where(eq(userFishingGearTable.discordId, userId)).limit(1);
    if (gear.length > 0) {
      await db.update(userFishingGearTable).set({
        bait: gear[0]!.bait + c.bait,
        baitGold: gear[0]!.baitGold + c.baitGold,
        baitDivine: gear[0]!.baitDivine + c.baitDivine,
        updatedAt: new Date(),
      }).where(eq(userFishingGearTable.id, gear[0]!.id));
    }
    if (c.bait > 0)        rewards.push(`🪱 **${c.bait} mồi thường**`);
    if (c.baitGold > 0)    rewards.push(`✨ **${c.baitGold} mồi vàng**`);
    if (c.baitDivine > 0)  rewards.push(`💫 **${c.baitDivine} mồi thần**`);
  }

  if (c.fishName) {
    const meta = FISH_META[c.fishName];
    const emoji = meta?.emoji ?? "🐟";
    const value = meta?.value ?? 0;
    const rarity = meta?.rarity ?? "common";
    const qty = c.fishQuantity;

    const existing = await db.select().from(fishInventoryTable)
      .where(and(eq(fishInventoryTable.discordId, userId), eq(fishInventoryTable.fishName, c.fishName)))
      .limit(1);
    if (existing.length > 0) {
      await db.update(fishInventoryTable)
        .set({ quantity: existing[0]!.quantity + qty })
        .where(eq(fishInventoryTable.id, existing[0]!.id));
    } else {
      await db.insert(fishInventoryTable).values({
        discordId: userId, fishName: c.fishName,
        emoji, value, fishType: "real", rarity, quantity: qty,
      });
    }
    rewards.push(`🐟 **${emoji} ${c.fishName} x${qty}**`);
  }

  // Ghi lại lượt dùng
  await db.insert(codeRedemptionsTable).values({ code, userId });
  await db.update(redemptionCodesTable)
    .set({ currentUses: c.currentUses + 1 })
    .where(eq(redemptionCodesTable.code, code));

  const embed = new EmbedBuilder()
    .setColor(0x00ff88)
    .setTitle("🎁 Nhập code thành công!")
    .setDescription(`Code: \`${code}\`\n\n**Phần thưởng nhận được:**\n${rewards.join("\n")}`)
    .setFooter({ text:`Dùng bởi ${interaction.user.username}` })
    .setTimestamp();

  await interaction.editReply({ embeds:[embed] });
}
