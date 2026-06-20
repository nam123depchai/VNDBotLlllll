import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  type Interaction,
  ActivityType,
} from "discord.js";
import { logger } from "../lib/logger.js";
import { commands, commandBuilders } from "./commands/index.js";
import { initStocks, updateStockPrices } from "./utils/stock-init.js";
import { runCharity } from "./utils/charity.js";
import { runFundAutoInvest } from "./utils/fund-auto-invest.js";

async function registerCommands(token: string, clientId: string): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(token);
  const guildId = process.env["DISCORD_GUILD_ID"];

  try {
    logger.info("Đang đăng ký slash commands...");
    if (guildId) {
      try {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
          body: commandBuilders,
        });
        logger.info({ count: commandBuilders.length, mode: "guild", guildId }, "Đăng ký tức thì thành công");
        return;
      } catch (guildErr: unknown) {
        const err = guildErr as { code?: number; message?: string };
        if (err.code === 50001) {
          logger.warn(
            { guildId },
            "Bot thiếu quyền application.commands trong server. Đăng ký global thay thế (cần ~1h)."
          );
        } else {
          logger.warn({ err: guildErr }, "Lỗi đăng ký guild commands, fallback global...");
        }
      }
    }
    await rest.put(Routes.applicationCommands(clientId), {
      body: commandBuilders,
    });
    logger.info({ count: commandBuilders.length, mode: "global" }, "Đăng ký global thành công (cần ~1h)");
  } catch (err) {
    logger.error({ err }, "Lỗi khi đăng ký slash commands");
    throw err;
  }
}

export async function startBot(): Promise<void> {
  const token = process.env["DISCORD_BOT_TOKEN"];
  const clientId = process.env["DISCORD_CLIENT_ID"];

  if (!token) {
    logger.warn("DISCORD_BOT_TOKEN chưa được cấu hình — bot Discord sẽ không khởi động.");
    return;
  }

  if (!clientId) {
    logger.warn("DISCORD_CLIENT_ID chưa được cấu hình — bot Discord sẽ không khởi động.");
    return;
  }

  await registerCommands(token, clientId);

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  // Sự kiện khi Bot sẵn sàng hoạt động
  client.once("clientReady", (c) => {
    logger.info({ tag: c.user.tag }, "Bot Discord đã đăng nhập thành công!");
    c.user.setActivity("Tài Xỉu 🎲", { type: ActivityType.Playing });

    // Khởi tạo hệ thống thị trường chứng khoán
    initStocks().catch(err => logger.error({ err }, "Lỗi init stocks"));

    // Tự động cập nhật giá cổ phiếu mỗi 5 phút
    setInterval(() => {
      updateStockPrices().catch(err => logger.error({ err }, "Lỗi update stock prices"));
    }, 5 * 60 * 1000);

    // Quỹ đầu tư chung tự động mua/bán mỗi 30 phút
    setInterval(() => {
      runFundAutoInvest().catch(err => logger.error({ err }, "Lỗi fund auto-invest"));
    }, 30 * 60 * 1000);

    // ========================================================
    // 🔥 HỆ THỐNG TỪ THIỆN: Tự động phát chấn tế mỗi 30 phút
    // (Gom gọn vào trong này để biến `c` hoạt động chính xác)
    // ========================================================
    setInterval(() => {
      runCharity(c).catch(err => logger.error({ err }, "Lỗi chạy hệ thống từ thiện"));
    }, 30 * 60 * 1000);
    // ========================================================

  }); // Đóng sự kiện clientReady chuẩn xác tại đây!

  // Xử lý tương tác Slash Commands
  client.on("interactionCreate", async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) {
      logger.warn({ commandName: interaction.commandName }, "Không tìm thấy lệnh");
      return;
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      logger.error({ err, commandName: interaction.commandName }, "Lỗi khi xử lý lệnh");
      const errContent = "❌ Có lỗi xảy ra khi xử lý lệnh. Vui lòng thử lại!";
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errContent, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: errContent, ephemeral: true }).catch(() => {});
      }
    }
  });

  client.on("error", (err) => {
    logger.error({ err }, "Discord client error");
  });

  await client.login(token);
}
