import Dexie, { type Table } from "dexie";

export type TransactionType = "expense" | "income" | "transfer";
export type AccountKind = "cash" | "investment" | "provident";

export type Transaction = {
  id?: number;
  type: TransactionType;
  amount: number;
  category: string;
  account?: string;
  toAccount?: string;
  note: string;
  date: string;
  createdAt: string;
  updatedAt: string;
};

export type Category = {
  id?: number;
  name: string;
  type: TransactionType;
  color: string;
  icon?: string;
  defaultAccount?: string;
};

export type Account = {
  id?: number;
  name: string;
  kind?: AccountKind;
  createdAt: string;
  sortOrder?: number;
  /** 公积金账户：期初余额，自 providentInitialDate（上一个 6/30）起计入余额 */
  providentInitialBalance?: number;
  /** 公积金账户：期初余额的起算日期，余额只累计该日期之后的流水 */
  providentInitialDate?: string;
  /** 公积金账户：已完成手动结息的年份（结息年度为上年 7/1 至该年 6/30），当年 7/1 起小于当年则提醒结息 */
  providentSettledYear?: number;
};

export type RecurringFrequency = "daily" | "weekday" | "weekend" | "weekly" | "monthly" | "yearly";

export type TransferRule = {
  id?: number;
  type: TransactionType;
  amount: number;
  category: string;
  account: string;
  toAccount?: string;
  frequency: RecurringFrequency;
  days?: number[];
  startDate: string;
  endDate?: string;
  lastRunDate?: string;
  enabled: boolean;
  note?: string;
  createdAt: string;
  fromAccount?: string;
};

export const accountKindLabel: Record<AccountKind, string> = {
  cash: "现金",
  investment: "理财",
  provident: "公积金",
};

export function inferAccountKind(name: string): AccountKind {
  if (/公积金|住房资金/.test(name)) return "provident";
  return /理财|投资|基金|股票|证券|余额宝|债券|定投/.test(name) ? "investment" : "cash";
}

export function accountKindOf(account: Pick<Account, "name" | "kind">): AccountKind {
  return account.kind ?? inferAccountKind(account.name);
}

class MoneyDb extends Dexie {
  transactions!: Table<Transaction, number>;
  categories!: Table<Category, number>;
  accounts!: Table<Account, number>;
  transferRules!: Table<TransferRule, number>;

  constructor() {
    super("local-money-db");
    this.version(1).stores({
      transactions: "++id, type, category, date, createdAt",
      categories: "++id, &[name+type], type",
    });
    this.version(2).stores({
      transactions: "++id, type, category, account, date, createdAt",
      categories: "++id, &[name+type], type",
    });
    this.version(3).stores({
      transactions: "++id, type, category, account, date, createdAt",
      categories: "++id, &[name+type], type",
      accounts: "++id, &name, createdAt",
    });
    this.version(4).stores({
      transactions: "++id, type, category, account, date, createdAt",
      categories: "++id, &[name+type], type",
      accounts: "++id, &name, createdAt",
    });
    this.version(5)
      .stores({
        transactions: "++id, type, category, account, date, createdAt",
        categories: "++id, &[name+type], type",
        accounts: "++id, &name, kind, createdAt",
      })
      .upgrade((tx) =>
        tx
          .table("accounts")
          .toCollection()
          .modify((account: Account) => {
            account.kind = accountKindOf(account);
          })
      );
    this.version(6).stores({
      transactions: "++id, type, category, account, toAccount, date, createdAt",
      categories: "++id, &[name+type], type",
      accounts: "++id, &name, kind, createdAt",
      transferRules: "++id, createdAt, frequency, startDate, lastRunDate",
    });
    this.version(7)
      .stores({
        transactions: "++id, type, category, account, toAccount, date, createdAt",
        categories: "++id, &[name+type], type",
        accounts: "++id, &name, kind, createdAt",
        transferRules: "++id, createdAt, type, frequency, startDate, lastRunDate",
      })
      .upgrade((tx) =>
        tx
          .table("transferRules")
          .toCollection()
          .modify((rule: TransferRule) => {
            if (!rule.type) rule.type = "transfer";
            if (!rule.category) rule.category = "转账";
            if (!rule.account) rule.account = rule.fromAccount || defaultAccounts[0];
            if (!rule.frequency) rule.frequency = "daily";
            if (!rule.note) rule.note = "周期记账";
          })
      );
  }
}

export const db = new MoneyDb();

export const defaultCategories: Category[] = [
  { name: "餐饮", type: "expense", color: "#d95f43", icon: "food" },
  { name: "交通", type: "expense", color: "#4776b4", icon: "bus" },
  { name: "购物", type: "expense", color: "#3a8d8f", icon: "shopping" },
  { name: "居住", type: "expense", color: "#2f3d4f", icon: "home" },
  { name: "日用", type: "expense", color: "#5f8f5f", icon: "daily" },
  { name: "医疗", type: "expense", color: "#c24b5a", icon: "health" },
  { name: "娱乐", type: "expense", color: "#8b68b8", icon: "game" },
  { name: "其他", type: "expense", color: "#6f7680", icon: "wallet" },
  { name: "工资", type: "income", color: "#2f7d62", icon: "money" },
  { name: "奖金", type: "income", color: "#c28a2c", icon: "piggy" },
  { name: "兼职", type: "income", color: "#3d8b93", icon: "wallet" },
  { name: "公积金", type: "income", color: "#c28a2c", icon: "piggy" },
  { name: "公积金利息", type: "income", color: "#3a8d8f", icon: "coins" },
  { name: "其他", type: "income", color: "#6f7680", icon: "wallet" },
];

export const defaultAccounts = ["现金", "微信", "支付宝", "银行卡"];

export async function seedCategories() {
  const count = await db.categories.count();
  if (count === 0) {
    await db.categories.bulkAdd(defaultCategories);
  }
  const categories = await db.categories.toArray();
  await Promise.all(
    categories.map((category) => {
      if (category.icon) return Promise.resolve();
      const defaultCategory = defaultCategories.find((item) => item.name === category.name && item.type === category.type);
      if (!defaultCategory) return Promise.resolve();
      return db.categories.update(category.id!, { icon: defaultCategory.icon, color: category.color || defaultCategory.color });
    })
  );
  const accountCount = await db.accounts.count();
  if (accountCount === 0) {
    const now = new Date().toISOString();
    await db.accounts.bulkAdd(defaultAccounts.map((name) => ({ name, kind: inferAccountKind(name), createdAt: now })));
  } else {
    const accounts = await db.accounts.toArray();
    await Promise.all(accounts.map((account) => (account.kind ? Promise.resolve() : db.accounts.update(account.id!, { kind: inferAccountKind(account.name) }))));
  }
}

function localDatePart(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: string, days: number) {
  const source = new Date(`${date}T00:00:00`);
  source.setDate(source.getDate() + days);
  return localDatePart(source);
}

async function isWorkdayByLegalCalendar(date: string) {
  const { LegalHoliday } = await import("tyme4ts");
  const source = new Date(`${date}T00:00:00`);
  const legalHoliday = LegalHoliday.fromYmd(source.getFullYear(), source.getMonth() + 1, source.getDate());
  if (legalHoliday) return legalHoliday.isWork();
  const weekday = source.getDay();
  return weekday >= 1 && weekday <= 5;
}

async function recurringRuleMatchesDate(rule: TransferRule, date: string) {
  const source = new Date(`${date}T00:00:00`);
  const weekday = source.getDay();
  const dayOfMonth = source.getDate();
  const month = source.getMonth() + 1;
  const dayOfYear = Number(`${String(month).padStart(2, "0")}${String(dayOfMonth).padStart(2, "0")}`);
  const start = new Date(`${rule.startDate}T00:00:00`);
  const startDayOfYear = Number(`${String(start.getMonth() + 1).padStart(2, "0")}${String(start.getDate()).padStart(2, "0")}`);
  const days = rule.days?.length ? rule.days : [];

  if (rule.frequency === "daily") return true;
  if (rule.frequency === "weekday") return isWorkdayByLegalCalendar(date);
  if (rule.frequency === "weekend") return !(await isWorkdayByLegalCalendar(date));
  if (rule.frequency === "weekly") return (days.length ? days : [start.getDay()]).includes(weekday);
  if (rule.frequency === "monthly") return (days.length ? days : [start.getDate()]).includes(dayOfMonth);
  if (rule.frequency === "yearly") return (days.length ? days : [startDayOfYear]).includes(dayOfYear);
  return false;
}

export async function applyAutoTransfers(today = localDatePart(new Date())) {
  const now = new Date().toISOString();
  await db.transaction("rw", db.transactions, db.transferRules, async () => {
    const rules = (await db.transferRules.toArray()).filter((rule) => rule.enabled);
    for (const rule of rules) {
      let date = rule.lastRunDate ? addDays(rule.lastRunDate, 1) : rule.startDate;
      let lastRunDate = rule.lastRunDate;
      const lastDate = rule.endDate && rule.endDate < today ? rule.endDate : today;
      while (date <= lastDate) {
        const type = rule.type || "transfer";
        const account = rule.account || rule.fromAccount || defaultAccounts[0];
        const isValidTransfer = type !== "transfer" || (rule.toAccount && account !== rule.toAccount);
        const hasCategory = type === "transfer" || Boolean(rule.category);
        if ((await recurringRuleMatchesDate(rule, date)) && rule.amount > 0 && isValidTransfer && hasCategory) {
          await db.transactions.add({
            type,
            amount: Math.round(rule.amount * 100) / 100,
            category: type === "transfer" ? "转账" : rule.category,
            account,
            toAccount: type === "transfer" ? rule.toAccount : undefined,
            note: rule.note?.trim() || "周期记账",
            date,
            createdAt: now,
            updatedAt: now,
          });
        }
        lastRunDate = date;
        date = addDays(date, 1);
      }
      if (lastRunDate && lastRunDate !== rule.lastRunDate) {
        await db.transferRules.update(rule.id!, { lastRunDate });
      }
    }
  });
}

/** 手动结息记入的「公积金利息」收入分类 */
export const providentInterestCategory = "公积金利息";

/** 每月缴存周期记账使用的收入分类 */
export const providentDepositCategory = "公积金缴存";

/** 公积金缴存/提取的记账日：每月 28 号 */
export const providentMonthlyDay = 28;

/** 结息周期的起算点：today 之前最近的一个 6/30（期初余额从这一天起算） */
export function providentPeriodStart(today = localDatePart(new Date())) {
  const year = Number(today.slice(0, 4));
  return today > `${year}-06-30` ? `${year}-06-30` : `${year - 1}-06-30`;
}

/** periodStart 之后到 today 之间的每月 28 号个数（= 周期记账追平将补记的缴存/提取笔数） */
export function providentBackfillCount(periodStart: string, today = localDatePart(new Date())) {
  let count = 0;
  let year = Number(periodStart.slice(0, 4));
  let month = Number(periodStart.slice(5, 7));
  for (;;) {
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
    const date = `${year}-${String(month).padStart(2, "0")}-${providentMonthlyDay}`;
    if (date > today) break;
    if (date > periodStart) count += 1;
  }
  return count;
}

/** 公积金缴存/利息两个收入分类不存在时补齐（老库的分类表里没有它们） */
export async function ensureProvidentCategories() {
  const defaults: Category[] = [
    { name: providentDepositCategory, type: "income", color: "#c28a2c", icon: "piggy" },
    { name: providentInterestCategory, type: "income", color: "#3a8d8f", icon: "coins" },
  ];
  const incomeCategories = await db.categories.filter((category) => category.type === "income").toArray();
  const existingNames = new Set(incomeCategories.map((category) => category.name));
  const missing = defaults.filter((item) => !existingNames.has(item.name));
  if (missing.length) await db.categories.bulkAdd(missing);
}

/** 公积金缴存周期规则：账户 = 公积金账户、分类 = 公积金缴存 的收入规则 */
export function findProvidentDepositRule(rules: TransferRule[], accountName: string) {
  return rules.find((rule) => (rule.type || "transfer") === "income" && rule.account === accountName && rule.category === providentDepositCategory);
}

/** 公积金提取周期规则：从公积金账户转出的转账规则 */
export function findProvidentWithdrawRule(rules: TransferRule[], accountName: string) {
  return rules.find((rule) => (rule.type || "transfer") === "transfer" && (rule.account || rule.fromAccount) === accountName);
}

/**
 * 新建或更新公积金缴存周期规则（每月 28 号记一笔收入）；amount <= 0 时删除已有规则。
 * 新建时传 lastRunDate = today 表示从下个记账日开始，不追平历史。
 */
export async function upsertProvidentDepositRule(accountName: string, amount: number, startDate: string, lastRunDate?: string) {
  const existing = findProvidentDepositRule(await db.transferRules.toArray(), accountName);
  if (amount <= 0) {
    if (existing?.id != null) await db.transferRules.delete(existing.id);
    return;
  }
  if (existing?.id != null) {
    await db.transferRules.update(existing.id, { amount });
    return;
  }
  await db.transferRules.add({
    type: "income",
    amount,
    category: providentDepositCategory,
    account: accountName,
    frequency: "monthly",
    days: [providentMonthlyDay],
    startDate,
    lastRunDate,
    enabled: true,
    note: "公积金缴存",
    createdAt: new Date().toISOString(),
  });
}

/** 新建或更新公积金提取周期规则（每月 28 号转账到到账账户）；amount <= 0 时删除已有规则 */
export async function upsertProvidentWithdrawRule(accountName: string, amount: number, toAccount: string, startDate: string, lastRunDate?: string) {
  const existing = findProvidentWithdrawRule(await db.transferRules.toArray(), accountName);
  if (amount <= 0) {
    if (existing?.id != null) await db.transferRules.delete(existing.id);
    return;
  }
  if (existing?.id != null) {
    await db.transferRules.update(existing.id, { amount, toAccount });
    return;
  }
  await db.transferRules.add({
    type: "transfer",
    amount,
    category: "转账",
    account: accountName,
    toAccount,
    frequency: "monthly",
    days: [providentMonthlyDay],
    startDate,
    lastRunDate,
    enabled: true,
    note: "公积金提取",
    createdAt: new Date().toISOString(),
  });
}

/** 删除账户的公积金缴存收入规则和从其转出的提取转账规则（改类型/删账户时级联） */
export async function removeProvidentRules(accountName: string) {
  const rules = await db.transferRules.toArray();
  const ids = rules
    .filter((rule) => {
      const from = rule.account || rule.fromAccount;
      if (from !== accountName) return false;
      const type = rule.type || "transfer";
      return type === "transfer" || (type === "income" && rule.category === providentDepositCategory);
    })
    .map((rule) => rule.id)
    .filter((id): id is number => id != null);
  if (ids.length) await db.transferRules.bulkDelete(ids);
}

/** 当年 7/1 起需要手动结息：已结息年份（默认取期初起算年份）落后于今年 */
export function providentNeedsSettlement(account: Account, today = localDatePart(new Date())) {
  const year = Number(today.slice(0, 4));
  if (today < `${year}-07-01`) return false;
  const settledYear = account.providentSettledYear ?? Number((account.providentInitialDate || account.createdAt || today).slice(0, 4));
  return settledYear < year;
}


export type BackupPayload = {
  exportedAt: string;
  app: "local-money";
  version: 1;
  transactions: Transaction[];
  categories: Category[];
  accounts?: Account[];
  transferRules?: TransferRule[];
};

export async function exportBackup(): Promise<BackupPayload> {
  return {
    exportedAt: new Date().toISOString(),
    app: "local-money",
    version: 1,
    transactions: await db.transactions.orderBy("date").toArray(),
    categories: await db.categories.toArray(),
    accounts: await db.accounts.toArray(),
    transferRules: await db.transferRules.toArray(),
  };
}

export async function importBackup(payload: BackupPayload) {
  if (payload.app !== "local-money" || payload.version !== 1) {
    throw new Error("备份文件格式不正确");
  }

  await db.transaction("rw", db.transactions, db.categories, db.accounts, db.transferRules, async () => {
    await db.transactions.clear();
    await db.categories.clear();
    await db.accounts.clear();
    await db.transferRules.clear();
    await db.categories.bulkAdd(payload.categories.map(({ id: _id, ...item }) => item));
    if (payload.accounts?.length) {
      await db.accounts.bulkAdd(payload.accounts.map(({ id: _id, ...item }) => ({ ...item, kind: item.kind ?? inferAccountKind(item.name) })));
    } else {
      const now = new Date().toISOString();
      await db.accounts.bulkAdd(defaultAccounts.map((name) => ({ name, kind: inferAccountKind(name), createdAt: now })));
    }
    await db.transactions.bulkAdd(payload.transactions.map(({ id: _id, ...item }) => item));
    if (payload.transferRules?.length) {
      await db.transferRules.bulkAdd(payload.transferRules.map(({ id: _id, ...item }) => item));
    }
  });
}
