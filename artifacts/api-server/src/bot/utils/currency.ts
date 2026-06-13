export function formatVND(amount: number): string {
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
