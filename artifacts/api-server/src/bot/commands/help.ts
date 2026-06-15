import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";

type HelpCategory = "economy" | "fishing" | "game" | "shop" | "info" | "admin";

interface CommandInfo {
  name: string;
  desc: string;
}

const CATEGORIES: Record<HelpCategory, { label: string; emoji: string; color: number; commands: CommandInfo[] }> = {
  economy: {
    label: "Kinh Tế", emoji: "💰", color: 0x00cc66,
    commands: [
      { name: "/sotaikhoan",  desc: "Xem số dư tài khoản" },
      { name: "/lamviec",     desc: "Làm việc kiếm tiền (cooldown 1h)" },
      { name: "/daily",       desc: "Nhận thưởng điểm danh hàng ngày" },
      { name: "/nganhang",    desc: "Xem thông tin ngân hàng" },
      { name: "/gui",         desc: "Gửi tiền vào ngân hàng" },
      { name: "/rut",         desc: "Rút tiền từ ngân hàng" },
      { name: "/vay",         desc: "Vay tiền từ ngân hàng" },
      { name: "/trano",       desc: "Trả nợ ngân hàng" },
      { name: "/chuyentien",  desc: "Chuyển tiền cho người khác" },
      { name: "/dautu",       desc: "Đầu tư cổ phiếu / crypto" },
      { name: "/lamphat",     desc: "Xem tình hình lạm phát server" },
      { name: "/chonglamphat",desc: "Mua vàng chống lạm phát" },
    ],
  },
  fishing: {
    label: "Câu Cá", emoji: "🎣", color: 0x0099ff,
    commands: [
      { name: "/cauca",       desc: "Câu cá kiếm tiền (cần mua cần câu trước)" },
      { name: "/banca",       desc: "Bán cá trong túi để lấy tiền" },
      { name: "/shopcauca",   desc: "Mua cần câu, phao, mồi câu" },
    ],
  },
  game: {
    label: "Mini Game", emoji: "🎮", color: 0xaa00ff,
    commands: [
      { name: "/taixiu",      desc: "Chơi Tài Xỉu — cược Tài (11-17) hoặc Xỉu (4-10)" },
      { name: "/baucua",      desc: "Bầu cua tôm cá — đặt cược vào con vật" },
      { name: "/blackjack",   desc: "Chơi Blackjack với bot" },
      { name: "/daga",        desc: "Đá gà — cược vào gà của mình" },
      { name: "/xoso",        desc: "Mua vé xổ số may mắn" },
      { name: "/hutixi",      desc: "Hú tì xì — đoán bài" },
      { name: "/dauboss",     desc: "Chiến đấu với Boss để nhận thưởng" },
    ],
  },
  shop: {
    label: "Shop & Vật Phẩm", emoji: "🛒", color: 0xff9900,
    commands: [
      { name: "/tuimu",       desc: "Mở túi mù ngẫu nhiên" },
      { name: "/tuimuThuong", desc: "Mở túi mù thường" },
      { name: "/tuimuVip",    desc: "Mở túi mù VIP" },
      { name: "/tuimuSieu",   desc: "Mở túi mù siêu hiếm" },
      { name: "/muack",       desc: "Mua vật phẩm từ chợ" },
      { name: "/banck",       desc: "Bán vật phẩm lên chợ" },
      { name: "/sanck",       desc: "Xem chợ trao đổi vật phẩm" },
      { name: "/tuido",       desc: "Xem túi đồ vật phẩm" },
      { name: "/nhapcode",    desc: "Nhập code đổi thưởng" },
    ],
  },
  info: {
    label: "Thống Kê & Nhiệm Vụ", emoji: "📊", color: 0x00bbff,
    commands: [
      { name: "/level",       desc: "Xem level và XP hiện tại" },
      { name: "/thanhtich",   desc: "Xem thành tích đã đạt được" },
      { name: "/nhiemvu",     desc: "Xem nhiệm vụ đang có" },
      { name: "/nhiemvu-nhan",desc: "Nhận thưởng nhiệm vụ đã hoàn thành" },
      { name: "/bangxephang", desc: "Bảng xếp hạng giàu nhất server" },
      { name: "/topboss",     desc: "Top chiến binh đánh boss" },
    ],
  },
  admin: {
    label: "Admin", emoji: "🔧", color: 0xff4444,
    commands: [
      { name: "/taocode",         desc: "Tạo code đổi thưởng cho người dùng" },
      { name: "/resetthitruong",  desc: "Reset giá cổ phiếu về ban đầu" },
    ],
  },
};

const CATEGORY_ORDER: HelpCategory[] = ["economy", "fishing", "game", "shop", "info", "admin"];

function buildEmbed(cat: HelpCategory) {
  const c = CATEGORIES[cat];
  const desc = c.commands.map((cmd) => `\`${cmd.name}\` — ${cmd.desc}`).join("\n");
  return new EmbedBuilder()
    .setColor(c.color)
    .setTitle(`${c.emoji} ${c.label}`)
    .setDescription(desc)
    .setFooter({ text: "VND Bot • Dùng nút bên dưới để chuyển danh mục" });
}

function buildRow(current: HelpCategory) {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let row = new ActionRowBuilder<ButtonBuilder>();

  for (const cat of CATEGORY_ORDER) {
    const c = CATEGORIES[cat];
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`help_${cat}`)
        .setLabel(`${c.emoji} ${c.label}`)
        .setStyle(cat === current ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );
    if (row.components.length === 3) {
      rows.push(row);
      row = new ActionRowBuilder<ButtonBuilder>();
    }
  }
  if (row.components.length > 0) rows.push(row);
  return rows;
}

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("📖 Xem danh sách tất cả lệnh của bot");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  let current: HelpCategory = "economy";

  const reply = await interaction.reply({
    embeds: [buildEmbed(current)],
    components: buildRow(current),
    ephemeral: true,
  });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 120_000,
  });

  collector.on("collect", async (i) => {
    if (i.user.id !== interaction.user.id) {
      await i.reply({ content: "Không phải của bạn!", ephemeral: true });
      return;
    }
    current = i.customId.replace("help_", "") as HelpCategory;
    await i.update({
      embeds: [buildEmbed(current)],
      components: buildRow(current),
    });
  });

  collector.on("end", () => {
    interaction.editReply({ components: [] }).catch(() => {});
  });
}
