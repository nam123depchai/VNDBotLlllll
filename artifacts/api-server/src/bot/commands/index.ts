import * as sotaikhoan from "./sotaikhoan.js";
import * as lamviec from "./lamviec.js";
import * as taixiu from "./taixiu.js";
import * as bangxephang from "./bangxephang.js";
import * as chuyentien from "./chuyentien.js";
import * as daily from "./daily.js";
import * as baucua from "./baucua.js";
import * as blackjack from "./blackjack.js";
import * as daga from "./daga.js";
import * as tuimu from "./tuimu.js";
import * as nganhang from "./nganhang.js";
import * as gui from "./gui.js";
import * as rut from "./rut.js";
import * as vay from "./vay.js";
import * as trano from "./trano.js";
import * as nhiemvu from "./nhiemvu.js";
import * as nhiemvuNhan from "./nhiemvu-nhan.js";
import * as hutixi from "./hutixi.js";
import * as lamphat from "./lamphat.js";
import * as level from "./level.js";
import * as thanhtich from "./thanhtich.js";
import * as sanck from "./sanck.js";
import * as muack from "./muack.js";
import * as banck from "./banck.js";
import * as dautu from "./dautu.js";
import * as xoso from "./xoso.js";
import * as cauca from "./cauca.js";
import * as tuido from "./tuido.js";
import * as shopcauca from "./shopcauca.js";
import * as banca from "./banca.js";
import * as dauboss from "./dauboss.js";
import * as topboss from "./topboss.js";
import * as resetthitruong from "./resetthitruong.js";
import * as taocode from "./taocode.js";
import * as nhapcode from "./nhapcode.js";
import * as help from "./help.js";
import * as quyengop from "./quyengop.js";
import type { SlashCommandBuilder, SlashCommandOptionsOnlyBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";

interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const commands: Map<string, Command> = new Map([
  [sotaikhoan.data.name, sotaikhoan as Command],
  [lamviec.data.name, lamviec as Command],
  [taixiu.data.name, taixiu as Command],
  [bangxephang.data.name, bangxephang as Command],
  [chuyentien.data.name, chuyentien as Command],
  [daily.data.name, daily as Command],
  [baucua.data.name, baucua as Command],
  [blackjack.data.name, blackjack as Command],
  [daga.data.name, daga as Command],
  [tuimu.data.name, tuimu as Command],
  [tuimu.tuimuThuong.data.name, tuimu.tuimuThuong as Command],
  [tuimu.tuimuVip.data.name, tuimu.tuimuVip as Command],
  [tuimu.tuimuSieu.data.name, tuimu.tuimuSieu as Command],
  [nganhang.data.name, nganhang as Command],
  [gui.data.name, gui as Command],
  [rut.data.name, rut as Command],
  [vay.data.name, vay as Command],
  [trano.data.name, trano as Command],
  [nhiemvu.data.name, nhiemvu as Command],
  [nhiemvuNhan.data.name, nhiemvuNhan as Command],
  [hutixi.data.name, hutixi as Command],
  [lamphat.data.name, lamphat as Command],
  [level.data.name, level as Command],
  [thanhtich.data.name, thanhtich as Command],
  [sanck.data.name, sanck as Command],
  [muack.data.name, muack as Command],
  [banck.data.name, banck as Command],
  [dautu.data.name, dautu as Command],
  [xoso.data.name, xoso as Command],
  [cauca.data.name, cauca as Command],
  [tuido.data.name, tuido as Command],
  [shopcauca.data.name, shopcauca as Command],
  [banca.data.name, banca as Command],
  [dauboss.data.name, dauboss as Command],
  [topboss.data.name, topboss as Command],
  [resetthitruong.data.name, resetthitruong as Command],
  [taocode.data.name, taocode as Command],
  [nhapcode.data.name, nhapcode as Command],
  [help.data.name, help as Command],
  [quyengop.data.name, quyengop as Command],
]);

export const commandBuilders = [
  sotaikhoan.data.toJSON(),
  lamviec.data.toJSON(),
  taixiu.data.toJSON(),
  bangxephang.data.toJSON(),
  chuyentien.data.toJSON(),
  daily.data.toJSON(),
  baucua.data.toJSON(),
  blackjack.data.toJSON(),
  daga.data.toJSON(),
  tuimu.data.toJSON(),
  tuimu.tuimuThuong.data.toJSON(),
  tuimu.tuimuVip.data.toJSON(),
  tuimu.tuimuSieu.data.toJSON(),
  nganhang.data.toJSON(),
  gui.data.toJSON(),
  rut.data.toJSON(),
  vay.data.toJSON(),
  trano.data.toJSON(),
  nhiemvu.data.toJSON(),
  nhiemvuNhan.data.toJSON(),
  hutixi.data.toJSON(),
  lamphat.data.toJSON(),
  level.data.toJSON(),
  thanhtich.data.toJSON(),
  sanck.data.toJSON(),
  muack.data.toJSON(),
  banck.data.toJSON(),
  dautu.data.toJSON(),
  xoso.data.toJSON(),
  cauca.data.toJSON(),
  tuido.data.toJSON(),
  shopcauca.data.toJSON(),
  banca.data.toJSON(),
  dauboss.data.toJSON(),
  topboss.data.toJSON(),
  resetthitruong.data.toJSON(),
  taocode.data.toJSON(),
  nhapcode.data.toJSON(),
  help.data.toJSON(),
  quyengop.data.toJSON(),
];
