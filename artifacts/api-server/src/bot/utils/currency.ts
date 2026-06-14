export function formatVND(amount: number): string {
  return amount.toLocaleString("vi-VN", { maximumFractionDigits: 0 }) + "₫";
}

export function formatVNDShort(amount: number): string {
  if (amount >= 1_000_000_000) {
    return (amount / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 }) + " tỷ";
  }
  if (amount >= 1_000_000) {
    return (amount / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 }) + " triệu";
  }
  if (amount >= 1_000) {
    return (amount / 1_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 }) + " nghìn";
  }
  return amount.toLocaleString("vi-VN") + "₫";
}

export function parseBetAmount(input: string, balance: number): number | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === "all") {
    return balance;
  }
  const num = parseInt(trimmed.replace(/[.,_]/g, ""), 10);
  if (isNaN(num) || num <= 0) return null;
  return num;
}
