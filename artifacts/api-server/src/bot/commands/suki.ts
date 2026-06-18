import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { db, marketEventsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const TYPE_COLOR: Record<string, number> = {
  MOON:0x00ff88, CRASH:0xff2244, PUMP:0x00aaff, DUMP:0xff6600,
  BULL:0x00cc55, BEAR:0xaa0000, NEWS:0xffaa00,
};
const TYPE_LABEL: Record<string, string> = {
  MOON:"🚀 MOON", CRASH:"💥 CRASH", PUMP:"💉 PUMP", DUMP:"📉 DUMP",
  BULL:"🐂 BULL", BEAR:"🐻 BEAR", NEWS:"📰 TIN TỨC",
};

function timeLeft(expiresAt: Date): string {
  const ms = expiresAt.getTime() - Date.now();
  if (ms <= 0) return "Hết hạn";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return m > 0 ? `${m}p${s}s` : `${s}s`;
}

function buildDesc(active: (typeof marketEventsTable.$inferSelect)[], recent: (typeof marketEventsTable.$inferSelect)[]): string {
  let d = "";
  if (active.length === 0) {
    d += "😴 **Không có sự kiện nào đang diễn ra**\nThị trường đang bình thường...\n\n";
  } else {
    d += "**🔥 ĐANG DIỄN RA:**\n";
    for (const ev of active) {
      const affect = ev.affectedSymbol
        ? ev.affectedSymbol === "crypto" ? "Toàn bộ Crypto"
        : ev.affectedSymbol === "stock"  ? "Toàn bộ Cổ Phiếu"
        : ev.affectedSymbol
        : "Toàn thị trường";
      const trend = ev.trendBoost >= 0 ? `📈 +${(ev.trendBoost * 100).toFixed(0)}%/tick` : `📉 ${(ev.trendBoost * 100).toFixed(0)}%/tick`;
      d += `\n${ev.emoji} **${ev.title}** [${TYPE_LABEL[ev.eventType] ?? ev.eventType}]\n`;
      d += `> ${ev.description}\n`;
      d += `> 🎯 **${affect}** • ${trend} • ⏱️ Còn: **${timeLeft(ev.expiresAt)}**\n`;
    }
    d += "\n";
  }
  if (recent.length > 0) {
    d += "**📜 SỰ KIỆN GẦN ĐÂY:**\n";
    for (const ev of recent) d += `~~${ev.emoji} ${ev.title}~~ ✅ Đã kết thúc\n`;
  }
  return d;
}

export const data = new SlashCommandBuilder()
  .setName("suki")
  .setDescription("📰 Xem sự kiện thị trường đang diễn ra");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const active = await db.select().from(marketEventsTable)
    .where(eq(marketEventsTable.isActive, true)).orderBy(desc(marketEventsTable.createdAt));
  const recent = await db.select().from(marketEventsTable)
    .where(eq(marketEventsTable.isActive, false)).orderBy(desc(marketEventsTable.createdAt)).limit(5);

  const embed = new EmbedBuilder()
    .setColor(active.length > 0 ? (TYPE_COLOR[active[0]!.eventType] ?? 0xffaa00) : 0x888888)
    .setTitle("📰 SỰ KIỆN THỊ TRƯỜNG")
    .setDescription(buildDesc(active, recent))
    .addFields(
      { name:"🔥 Đang active", value:`${active.length} sự kiện`, inline:true },
      { name:"💡 Tip", value:"Sự kiện tác động mạnh đến giá!", inline:true },
    )
    .setFooter({ text:"Sự kiện xuất hiện ngẫu nhiên ~5% mỗi lần cập nhật giá (5 phút/lần)" })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("sk_refresh").setLabel("🔄 Refresh").setStyle(ButtonStyle.Secondary),
  );

  const msg = await interaction.editReply({ embeds:[embed], components:[row] });

  const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time:60_000 });
  col.on("collect", async (i) => {
    if (i.user.id !== interaction.user.id) { await i.reply({ content:"Không phải của bạn!", ephemeral:true }); return; }
    const newActive = await db.select().from(marketEventsTable).where(eq(marketEventsTable.isActive, true)).orderBy(desc(marketEventsTable.createdAt));
    const newRecent = await db.select().from(marketEventsTable).where(eq(marketEventsTable.isActive, false)).orderBy(desc(marketEventsTable.createdAt)).limit(5);
    await i.update({ embeds:[embed.setDescription(buildDesc(newActive, newRecent)).setTimestamp()], components:[row] });
  });
  col.on("end", () => interaction.editReply({ components:[] }).catch(() => {}));
}
