# Discord Bot Mini Game — VNĐ Economy

Bot Discord với hệ thống kinh tế VNĐ, lệnh kiếm tiền và mini game Tài Xỉu.

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
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/bot/` — toàn bộ code Discord bot
- `artifacts/api-server/src/bot/commands/` — các slash commands
- `artifacts/api-server/src/bot/utils/` — helpers (db, currency)
- `lib/db/src/schema/discord-users.ts` — schema bảng `discord_users`
- `lib/api-spec/openapi.yaml` — API contract

## Architecture decisions

- Bot Discord chạy song song với Express server trong cùng process
- Nếu thiếu `DISCORD_BOT_TOKEN` hoặc `DISCORD_CLIENT_ID`, server vẫn khởi động bình thường — chỉ bot không hoạt động
- Slash commands được đăng ký global (không phải per-guild) mỗi khi bot khởi động
- Số dư lưu dạng `bigint` trong PostgreSQL để tránh overflow khi số tiền lớn

## Product

- `/lamviec` — Đi làm kiếm tiền ngẫu nhiên 100–500₫, cooldown 1 giờ
- `/taixiu` — Cược Tài (T, tổng 11-17) hoặc Xỉu (X, tổng 4-10) với số tiền bất kỳ hoặc `all`; thắng ×1.9
- `/sotaikhoan` — Xem số dư của mình hoặc người khác
- `/bangxephang` — Top 10 người giàu nhất server

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Phải có cả `DISCORD_BOT_TOKEN` **và** `DISCORD_CLIENT_ID` để bot hoạt động
- Slash commands đăng ký global mất ~1 giờ để lan truyền toàn Discord lần đầu tiên
- Sau mỗi thay đổi lệnh, cần restart server để đăng ký lại

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
