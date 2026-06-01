import Dexie, { type Table } from "dexie";

export type TransactionType = "expense" | "income";

export type Transaction = {
  id?: number;
  type: TransactionType;
  amount: number;
  category: string;
  account?: string;
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
};

export type Account = {
  id?: number;
  name: string;
  createdAt: string;
};

class MoneyDb extends Dexie {
  transactions!: Table<Transaction, number>;
  categories!: Table<Category, number>;
  accounts!: Table<Account, number>;

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
  }
}

export const db = new MoneyDb();

export const defaultCategories: Category[] = [
  { name: "餐饮", type: "expense", color: "#d95f43" },
  { name: "交通", type: "expense", color: "#4776b4" },
  { name: "购物", type: "expense", color: "#b45f9d" },
  { name: "居住", type: "expense", color: "#8c6b4f" },
  { name: "日用", type: "expense", color: "#5f8f5f" },
  { name: "医疗", type: "expense", color: "#c24b5a" },
  { name: "娱乐", type: "expense", color: "#8b68b8" },
  { name: "其他", type: "expense", color: "#6f7680" },
  { name: "工资", type: "income", color: "#2f7d62" },
  { name: "奖金", type: "income", color: "#c28a2c" },
  { name: "兼职", type: "income", color: "#3d8b93" },
  { name: "其他", type: "income", color: "#6f7680" },
];

export const defaultAccounts = ["现金", "微信", "支付宝", "银行卡"];

export async function seedCategories() {
  const count = await db.categories.count();
  if (count === 0) {
    await db.categories.bulkAdd(defaultCategories);
  }
  const accountCount = await db.accounts.count();
  if (accountCount === 0) {
    const now = new Date().toISOString();
    await db.accounts.bulkAdd(defaultAccounts.map((name) => ({ name, createdAt: now })));
  }
}

export type BackupPayload = {
  exportedAt: string;
  app: "local-money";
  version: 1;
  transactions: Transaction[];
  categories: Category[];
  accounts?: Account[];
};

export async function exportBackup(): Promise<BackupPayload> {
  return {
    exportedAt: new Date().toISOString(),
    app: "local-money",
    version: 1,
    transactions: await db.transactions.orderBy("date").toArray(),
    categories: await db.categories.toArray(),
    accounts: await db.accounts.toArray(),
  };
}

export async function importBackup(payload: BackupPayload) {
  if (payload.app !== "local-money" || payload.version !== 1) {
    throw new Error("备份文件格式不正确");
  }

  await db.transaction("rw", db.transactions, db.categories, db.accounts, async () => {
    await db.transactions.clear();
    await db.categories.clear();
    await db.accounts.clear();
    await db.categories.bulkAdd(payload.categories.map(({ id: _id, ...item }) => item));
    if (payload.accounts?.length) {
      await db.accounts.bulkAdd(payload.accounts.map(({ id: _id, ...item }) => item));
    } else {
      const now = new Date().toISOString();
      await db.accounts.bulkAdd(defaultAccounts.map((name) => ({ name, createdAt: now })));
    }
    await db.transactions.bulkAdd(payload.transactions.map(({ id: _id, ...item }) => item));
  });
}
