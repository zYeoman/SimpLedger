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

function localDatePart(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayInputValue() {
  return localDatePart(new Date());
}

export function monthKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function getMonthRange(key: string) {
  const [year, month] = key.split("-").map(Number);
  const end = new Date(year, month, 0);
  const monthPart = String(month).padStart(2, "0");
  return {
    start: `${year}-${monthPart}-01`,
    end: localDatePart(end),
  };
}

export function addMonthsToKey(key: string, offset: number) {
  const [year, month] = key.split("-").map(Number);
  return monthKey(new Date(year, month - 1 + offset, 1));
}

export function getMonthWindowRange(count: number, base = monthKey()) {
  const safeCount = Math.max(1, count);
  const startMonth = addMonthsToKey(base, 1 - safeCount);
  return {
    start: getMonthRange(startMonth).start,
    end: getMonthRange(base).end,
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
