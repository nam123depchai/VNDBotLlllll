import * as sotaikhoan from "./sotaikhoan.js";
import * as lamviec from "./lamviec.js";
import * as taixiu from "./taixiu.js";
import * as bangxephang from "./bangxephang.js";
import type { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";

interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const commands: Map<string, Command> = new Map([
  [sotaikhoan.data.name, sotaikhoan as Command],
  [lamviec.data.name, lamviec as Command],
  [taixiu.data.name, taixiu as Command],
  [bangxephang.data.name, bangxephang as Command],
]);

export const commandBuilders = [
  sotaikhoan.data.toJSON(),
  lamviec.data.toJSON(),
  taixiu.data.toJSON(),
  bangxephang.data.toJSON(),
];
