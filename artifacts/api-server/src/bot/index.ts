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

async function registerCommands(token: string, clientId: string): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    logger.info("Đang đăng ký slash commands...");
    await rest.put(Routes.applicationCommands(clientId), {
      body: commandBuilders,
    });
    logger.info({ count: commandBuilders.length }, "Đăng ký slash commands thành công");
  } catch (err) {
    logger.error({ err }, "Lỗi khi đăng ký slash commands");
    throw err;
  }
}

export async function startBot(): Promise<void> {
  const token = process.env["DISCORD_BOT_TOKEN"];
  const clientId = process.env["DISCORD_CLIENT_ID"];

  if (!token) {
    logger.warn("DISCORD_BOT_TOKEN chưa được cấu hình — bot Discord sẽ không khởi động. Cung cấp token để kích hoạt bot.");
    return;
  }

  if (!clientId) {
    logger.warn("DISCORD_CLIENT_ID chưa được cấu hình — bot Discord sẽ không khởi động. Cung cấp Client ID để kích hoạt bot.");
    return;
  }

  await registerCommands(token, clientId);

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.once("ready", (c) => {
    logger.info({ tag: c.user.tag }, "Bot Discord đã đăng nhập thành công!");
    c.user.setActivity("Tài Xỉu 🎲", { type: ActivityType.Playing });
  });

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
      const errorMsg = { content: "❌ Có lỗi xảy ra khi xử lý lệnh. Vui lòng thử lại!", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMsg).catch(() => {});
      } else {
        await interaction.reply(errorMsg).catch(() => {});
      }
    }
  });

  client.on("error", (err) => {
    logger.error({ err }, "Discord client error");
  });

  await client.login(token);
}
