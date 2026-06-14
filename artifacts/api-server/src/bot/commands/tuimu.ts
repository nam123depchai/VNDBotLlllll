import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
  import { getOrCreateUser, updateBalance } from "../utils/db-helpers.js";
  import { formatVND } from "../utils/currency.js";

  const TIERS = {
    thuong: { name: "📦 Hộp Thường", cost: 10_000, min: 1_000, max: 100_000 },
    vip: { name: "📦 Hộp VIP", cost: 50_000, min: 30_000, max: 300_000 },
    sieu: { name: "📦 Hộp Siêu VIP", cost: 500_000, min: 200_000, max: 1_000_000 },
  };

  type TierKey = keyof typeof TIERS;

  export const data = new SlashCommandBuilder()
    .setName("tuimu")
    .setDescription("Ộ túi mù — mua hộp ngẫu nhiên, mở ra tiền!");

  export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const user = await getOrCreateUser(interaction.user.id, interaction.user.username);

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle("🎁 Túi Mù — Mua Hộp May Mắn")
      .setDescription(`Chọn hộp bạn muốn mua. Bạn đang có **${formatVND(user.balance)}**`)
      .addFields(
        { name: "1️⃣ " + TIERS.thuong.name, value: `**${formatVND(TIERS.thuong.cost)}** → Mở ra **${formatVND(TIERS.thuong.min)} – ${formatVND(TIERS.thuong.max)}**`, inline: true },
        { name: "2️⃣ " + TIERS.vip.name, value: `**${formatVND(TIERS.vip.cost)}** → Mở ra **${formatVND(TIERS.vip.min)} – ${formatVND(TIERS.vip.max)}**`, inline: true },
        { name: "3️⃣ " + TIERS.sieu.name, value: `**${formatVND(TIERS.sieu.cost)}** → Mở ra **${formatVND(TIERS.sieu.min)} – ${formatVND(TIERS.sieu.max)}**`, inline: true }
      )
      .setFooter({ text: "Dùng /tuimu-thuong, /tuimu-vip, hoặc /tuimu-sieu để mua!" });

    await interaction.reply({ embeds: [embed] });
  }

  // Helper: create the tier-specific commands
  function createTierCommand(key: TierKey, name: string) {
    const tier = TIERS[key];
    return {
      data: new SlashCommandBuilder().setName(name).setDescription(`Mua ${tier.name} — ${formatVND(tier.cost)}`),
      async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const user = await getOrCreateUser(interaction.user.id, interaction.user.username);

        if (user.balance < tier.cost) {
          const embed = new EmbedBuilder()
            .setColor(0xff4444).setTitle("❌ Không đủ tiền!")
            .setDescription(`Bạn cần **${formatVND(tier.cost)}** để mua ${tier.name}.\nSố dư hiện tại: **${formatVND(user.balance)}**.`);
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }

        const reward = Math.floor(Math.random() * (tier.max - tier.min + 1)) + tier.min;
        const newBalance = user.balance - tier.cost + reward;
        const profit = reward - tier.cost;

        await updateBalance(interaction.user.id, newBalance);

        const isProfit = profit > 0;
        const embed = new EmbedBuilder()
          .setColor(isProfit ? 0x00cc66 : 0xff4444)
          .setTitle(isProfit ? "🎉 Làm Giàu!" : "😢 Lỗ Rồi!")
          .setDescription(`Mở **${tier.name}** với **${formatVND(tier.cost)}**!`)
          .addFields(
            { name: "🎲 Mở ra", value: `**${formatVND(reward)}**`, inline: true },
            { name: isProfit ? "💰 Lợi nhuận" : "💸 Lỗ", value: `**${isProfit ? "+" : ""}${formatVND(profit)}**`, inline: true },
            { name: "🏦 Số dư mới", value: `**${formatVND(newBalance)}**`, inline: true }
          )
          .setFooter({ text: isProfit ? "Định lắm! 🎉" : "Mày mắn hơn lần sau! 😉" })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      },
    };
  }

  const thuongCmd = createTierCommand("thuong", "tuimu-thuong");
  const vipCmd = createTierCommand("vip", "tuimu-vip");
  const sieuCmd = createTierCommand("sieu", "tuimu-sieu");

  export { thuongCmd as tuimuThuong, vipCmd as tuimuVip, sieuCmd as tuimuSieu };
