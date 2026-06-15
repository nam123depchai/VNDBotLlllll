import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { db, fishInventoryTable, discordUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getOrCreateUser } from "../utils/db-helpers";
import { formatVND } from "../utils/currency";

// Cấu hình Hệ thống Thuế
const TAX_BOT_ID = "1504802232632082502";
const TAX_RATE = 0.10; // 10% thuế

export const data = new SlashCommandBuilder()
  .setName("banca")
  .setDescription("Bán cá trong túi đồ để kiếm tiền");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const userId = interaction.user.id.toString(); // ✅ Convert to string

    const fish = await db
      .select()
      .from(fishInventoryTable)
      .where(eq(fishInventoryTable.discordId, userId)); // ✅ Use string userId

    if (fish.length === 0) {
      await interaction.reply({
        content: "🧹 Bạn không có cá để bán! Dùng /cauca để bắt cá.",
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xffaa00)
      .setTitle("🐟 Bán Cá")
      .setDescription("Chọn cá để bán hoặc bán tất cả (Lưu ý: Thuế bán cá là 10%).");

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    let row = new ActionRowBuilder<ButtonBuilder>();
    let totalValue = 0;

    // Discord giới hạn 5 rows, dành 1 row cho "bán tất cả" → tối đa 4 rows fish = 12 loại
    const MAX_FISH_ROWS = 4;
    const MAX_FISH_BUTTONS = MAX_FISH_ROWS * 3; // 12 loại
    let buttonCount = 0;
    let hiddenCount = 0;

    for (const f of fish) {
      totalValue += f.value * f.quantity;
      if (buttonCount < MAX_FISH_BUTTONS) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`sell_all_${f.id}`)
            .setLabel(`${f.fishName} x${f.quantity}`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji(f.emoji?.match(/\p{Emoji}/u) ? f.emoji : "🐟")
        );
        buttonCount++;
        if (row.components.length === 3) {
          rows.push(row);
          row = new ActionRowBuilder<ButtonBuilder>();
        }
      } else {
        hiddenCount++;
      }
    }
    if (row.components.length > 0) rows.push(row);

    const sellAllLabel = hiddenCount > 0
      ? `Bán tất cả +${hiddenCount} loại khác (${formatVND(totalValue)})`
      : `Bán tất cả (${formatVND(totalValue)})`;

    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("sell_all_fish")
          .setLabel(sellAllLabel.slice(0, 80)) // Discord label max 80 chars
          .setStyle(ButtonStyle.Danger)
          .setEmoji("💰")
      )
    );

    const reply = await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60_000,
    });

    collector.on("collect", async (i) => {
      try {
        if (i.user.id !== interaction.user.id) {
          await i.reply({ content: "Không phải của bạn!", ephemeral: true });
          return;
        }

        const user = await getOrCreateUser(interaction.user.id, interaction.user.username);

        // Validate user balance
        if (!user || user.balance === null || user.balance === undefined) {
          await i.reply({
            content: "❌ Lỗi: Không thể lấy thông tin người dùng",
            ephemeral: true,
          });
          return;
        }

        if (i.customId === "sell_all_fish") {
          // Sell all
          let totalEarned = 0;
          for (const f of fish) {
            totalEarned += f.value * f.quantity;
          }

          // Tính toán phân bổ thuế
          const taxAmount = Math.floor(totalEarned * TAX_RATE);
          const earned = totalEarned - taxAmount;

          await db.delete(fishInventoryTable).where(eq(fishInventoryTable.discordId, userId));
          
          // 1. Trả tiền sau thuế cho người chơi
          await db
            .update(discordUsersTable)
            .set({ balance: user.balance + earned, updatedAt: new Date() })
            .where(eq(discordUsersTable.discordId, userId));

          // 2. Chuyển 10% tiền thuế thu được vào tài khoản Bot
          if (taxAmount > 0) {
            const botUser = await getOrCreateUser(TAX_BOT_ID, "Bot Thuế");
            await db
              .update(discordUsersTable)
              .set({ balance: botUser.balance + taxAmount, updatedAt: new Date() })
              .where(eq(discordUsersTable.discordId, TAX_BOT_ID));
          }

          await i.update({
            content: `💰 Đã bán tất cả cá! +${formatVND(earned)} *(Đã khấu trừ 10% thuế: ${formatVND(taxAmount)} vào ngân khố)*`,
            embeds: [],
            components: [],
          });
          return;
        }

        // Sell individual fish
        const fishId = parseInt(i.customId.replace("sell_all_", ""), 10);

        // Validate fishId
        if (isNaN(fishId)) {
          await i.reply({
            content: "❌ Lỗi: ID cá không hợp lệ",
            ephemeral: true,
          });
          return;
        }

        const target = fish.find((f) => f.id === fishId);
        if (!target) {
          await i.reply({
            content: "❌ Không tìm thấy cá này trong túi đồ",
            ephemeral: true,
          });
          return;
        }

        // Tính toán phân bổ thuế cho bán cá lẻ
        const totalEarned = target.value * target.quantity;
        const taxAmount = Math.floor(totalEarned * TAX_RATE);
        const earned = totalEarned - taxAmount;

        await db.delete(fishInventoryTable).where(eq(fishInventoryTable.id, fishId));
        
        // 1. Trả tiền sau thuế cho người chơi
        await db
          .update(discordUsersTable)
          .set({ balance: user.balance + earned, updatedAt: new Date() })
          .where(eq(discordUsersTable.discordId, userId));

        // 2. Chuyển tiền thuế cho Bot
        if (taxAmount > 0) {
          const botUser = await getOrCreateUser(TAX_BOT_ID, "Bot Thuế");
          await db
            .update(discordUsersTable)
            .set({ balance: botUser.balance + taxAmount, updatedAt: new Date() })
            .where(eq(discordUsersTable.discordId, TAX_BOT_ID));
        }

        await i.update({
          content: `💰 Đã bán ${target.emoji} **${target.fishName}** x${target.quantity}! +${formatVND(earned)} *(Đã trừ 10% thuế: ${formatVND(taxAmount)})*`,
          embeds: [],
          components: [],
        });
      } catch (error) {
        console.error("❌ Lỗi khi xử lý button click:", error);
        try {
          await i.reply({
            content: `❌ Lỗi xảy ra: ${error instanceof Error ? error.message : "Không xác định"}`,
            ephemeral: true,
          });
        } catch {
          console.error("Không thể gửi error message");
        }
      }
    });

    collector.on("end", () => {
      // Optional: handle collector end
    });
  } catch (error) {
    console.error("❌ Lỗi trong lệnh banca:", error);
    await interaction.reply({
      content: `❌ Lỗi xảy ra khi xử lý lệnh: ${error instanceof Error ? error.message : "Không xác định"}`,
      ephemeral: true,
    });
  }
}
