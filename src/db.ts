import Dexie, { type Table } from "dexie";

export type TransactionType = "expense" | "income" | "transfer";
export type AccountKind = "cash" | "investment";

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
};

export type Account = {
  id?: number;
  name: string;
  kind?: AccountKind;
  createdAt: string;
};

export type TransferRule = {
  id?: number;
  fromAccount: string;
  toAccount: string;
  amount: number;
  frequency: "daily";
  startDate: string;
  lastRunDate?: string;
  enabled: boolean;
  createdAt: string;
};

export const accountKindLabel: Record<AccountKind, string> = {
  cash: "现金",
  investment: "理财",
};

export function inferAccountKind(name: string): AccountKind {
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

export async function applyAutoTransfers(today = localDatePart(new Date())) {
  const now = new Date().toISOString();
  await db.transaction("rw", db.transactions, db.transferRules, async () => {
    const rules = (await db.transferRules.toArray()).filter((rule) => rule.enabled);
    for (const rule of rules) {
      let date = rule.lastRunDate ? addDays(rule.lastRunDate, 1) : rule.startDate;
      let lastRunDate = rule.lastRunDate;
      while (date <= today) {
        if (rule.fromAccount !== rule.toAccount && rule.amount > 0) {
          await db.transactions.add({
            type: "transfer",
            amount: Math.round(rule.amount * 100) / 100,
            category: "转账",
            account: rule.fromAccount,
            toAccount: rule.toAccount,
            note: "自动划转",
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
