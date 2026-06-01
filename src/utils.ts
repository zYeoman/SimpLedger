import type { Transaction, TransactionType } from "./db";

export const currency = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  maximumFractionDigits: 2,
});

export const shortDate = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
});

export function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

export function getMonthRange(key: string) {
  const [year, month] = key.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function sumByType(items: Transaction[], type: TransactionType) {
  return items.filter((item) => item.type === type).reduce((sum, item) => sum + item.amount, 0);
}

export function groupByDate(items: Transaction[]) {
  return items.reduce<Record<string, Transaction[]>>((groups, item) => {
    groups[item.date] = groups[item.date] ?? [];
    groups[item.date].push(item);
    return groups;
  }, {});
}

export function fileSafeStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
