# Discord Bot Mini Game — VNĐ Economy

Bot Discord với hệ thống kinh tế VNĐ, lệnh kiếm tiền, mini game Tài Xỉu, chuyển tiền, và bảng xếp hạng.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — chạy API server + Discord bot (port 8080)
- `pnpm run typecheck` — kiểm tra toàn bộ TypeScript
- `pnpm run build` — typecheck + build tất cả packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `DISCORD_BOT_TOKEN` — Token của bot Discord
- Required env: `DISCORD_CLIENT_ID` — Application/Client ID từ Discord Developer Portal

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Bot: discord.js v14
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Build: esbuild (ESM bundle)

## Where things live

- `artifacts/api-server/src/bot/commands/` — các slash commands
- `artifacts/api-server/src/bot/utils/` — helpers (db, currency format)
- `lib/db/src/schema/discord-users.ts` — schema bảng `discord_users`
- `lib/db/src/schema/` — các bảng DB

## Architecture decisions

- Bot Discord chạy song song với Express server trong cùng process
- Nếu thiếu `DISCORD_BOT_TOKEN` hoặc `DISCORD_CLIENT_ID`, server vẫn khởi động bình thường — chỉ bot không hoạt động
- Slash commands đăng ký global (không phải per-guild) mỗi khi bot khởi động
- Số dư lưu dạng `bigint` trong PostgreSQL để tránh overflow

## Product — Các lệnh hiện có

| Lệnh | Mô tả |
|------|-------|
| `/lamviec` | Đi làm kiếm **100.000–500.000₫** ngẫu nhiên, cooldown 1 giờ |
| `/taixiu` | Cược Tài (T) hoặc Xỉu (X) với số tiền tự chọn hoặc `all`, thắng ×1.9 |
| `/chuyentien` | Chuyển tiền cho người khác bằng @mention + số tiền |
| `/sotaikhoan` | Xem số dư của mình hoặc tag người khác |
| `/bangxephang` | Top 10 người giàu nhất server |

## Gotchas

- Slash commands global mất ~1 giờ để lan truyền toàn Discord lần đầu tiên
- Sau mỗi thay đổi lệnh, cần restart server để đăng ký lại

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
