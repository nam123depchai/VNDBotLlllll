import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ComponentType,
} from "discord.js";
import { db, redemptionCodesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { formatVND } from "../utils/currency.js";

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export const data = new SlashCommandBuilder()
  .setName("taocode")
  .setDescription("🔑 [ADMIN] Tạo code đổi thưởng")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((o) => o.setName("code").setDescription("Tên code (để trống = tự động)").setRequired(false))
  .addIntegerOption((o) => o.setName("tien").setDescription("Số tiền thưởng (₫)").setRequired(false).setMinValue(0))
  .addIntegerOption((o) => o.setName("xp").setDescription("XP thưởng").setRequired(false).setMinValue(0))
  .addIntegerOption((o) => o.setName("moi").setDescription("Mồi thường").setRequired(false).setMinValue(0))
  .addIntegerOption((o) => o.setName("moi_vang").setDescription("Mồi vàng").setRequired(false).setMinValue(0))
  .addIntegerOption((o) => o.setName("moi_than").setDescription("Mồi thần").setRequired(false).setMinValue(0))
  .addStringOption((o) => o.setName("ten_ca").setDescription("Tên cá thưởng (ví dụ: Cá Rồng Đỏ)").setRequired(false))
  .addIntegerOption((o) => o.setName("so_ca").setDescription("Số lượng cá (mặc định 1)").setRequired(false).setMinValue(1))
  .addIntegerOption((o) => o.setName("limit").setDescription("Số lượt nhập tối đa (để trống = vô hạn)").setRequired(false).setMinValue(1))
  .addIntegerOption((o) => o.setName("het_han").setDescription("Hết hạn sau X giờ (để trống = không hạn)").setRequired(false).setMinValue(1));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const code = (interaction.options.getString("code") ?? randomCode()).toUpperCase().replace(/\s/g, "");
  const money      = interaction.options.getInteger("tien") ?? 0;
  const xp         = interaction.options.getInteger("xp") ?? 0;
  const bait       = interaction.options.getInteger("moi") ?? 0;
  const baitGold   = interaction.options.getInteger("moi_vang") ?? 0;
  const baitDivine = interaction.options.getInteger("moi_than") ?? 0;
  const fishName   = interaction.options.getString("ten_ca") ?? null;
  const fishQty    = interaction.options.getInteger("so_ca") ?? 1;
  const maxUses    = interaction.options.getInteger("limit") ?? null;
  const expiresHrs = interaction.options.getInteger("het_han") ?? null;

  if (money === 0 && xp === 0 && bait === 0 && baitGold === 0 && baitDivine === 0 && !fishName) {
    await interaction.reply({ content:"❌ Cần ít nhất 1 phần thưởng!", ephemeral:true });
    return;
  }

  // Kiểm tra code trùng
  const existing = await db.select().from(redemptionCodesTable)
    .where(eq(redemptionCodesTable.code, code)).limit(1);
  if (existing.length > 0) {
    await interaction.reply({ content:`❌ Code **${code}** đã tồn tại!`, ephemeral:true });
    return;
  }

  const expiresAt = expiresHrs ? new Date(Date.now() + expiresHrs * 3_600_000) : null;

  await db.insert(redemptionCodesTable).values({
    code,
    createdBy: interaction.user.id.toString(),
    money, xp, bait, baitGold, baitDivine,
    fishName, fishQuantity: fishQty,
    maxUses,
    expiresAt,
  });

  const rewards: string[] = [];
  if (money > 0)       rewards.push(`💰 **${formatVND(money)}**`);
  if (xp > 0)          rewards.push(`✨ **${xp} XP**`);
  if (bait > 0)        rewards.push(`🪱 **${bait} mồi thường**`);
  if (baitGold > 0)    rewards.push(`✨ **${baitGold} mồi vàng**`);
  if (baitDivine > 0)  rewards.push(`💫 **${baitDivine} mồi thần**`);
  if (fishName)        rewards.push(`🐟 **${fishName} x${fishQty}**`);

  const embed = new EmbedBuilder()
    .setColor(0x00ff88)
    .setTitle("🔑 Code đã tạo!")
    .addFields(
      { name:"Code", value:`\`\`\`${code}\`\`\``, inline:false },
      { name:"Phần thưởng", value:rewards.join("\n"), inline:false },
      { name:"Lượt dùng", value:maxUses ? `${maxUses} lượt` : "♾️ Vô hạn", inline:true },
      { name:"Hết hạn", value:expiresAt ? `<t:${Math.floor(expiresAt.getTime()/1000)}:R>` : "Không hạn", inline:true },
    )
    .setFooter({ text:"Chỉ mình bạn thấy tin nhắn này" });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`delete_code_${code}`).setLabel("🗑️ Xóa Code").setStyle(ButtonStyle.Danger),
  );

  const reply = await interaction.reply({ embeds:[embed], components:[row], ephemeral:true });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 600_000,
  });

  collector.on("collect", async (i) => {
    if (i.user.id !== interaction.user.id) return;
    if (i.customId === `delete_code_${code}`) {
      await db.update(redemptionCodesTable)
        .set({ isActive:false })
        .where(eq(redemptionCodesTable.code, code));
      await i.update({
        embeds:[embed.setColor(0xff4444).setTitle("🗑️ Code đã bị xóa").setDescription(`Code \`${code}\` không còn hoạt động.`)],
        components:[],
      });
    }
  });
}

