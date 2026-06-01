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

class MoneyDb extends Dexie {
  transactions!: Table<Transaction, number>;
  categories!: Table<Category, number>;

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

export async function seedCategories() {
  const count = await db.categories.count();
  if (count > 0) return;
  await db.categories.bulkAdd(defaultCategories);
}

export type BackupPayload = {
  exportedAt: string;
  app: "local-money";
  version: 1;
  transactions: Transaction[];
  categories: Category[];
};

export async function exportBackup(): Promise<BackupPayload> {
  return {
    exportedAt: new Date().toISOString(),
    app: "local-money",
    version: 1,
    transactions: await db.transactions.orderBy("date").toArray(),
    categories: await db.categories.toArray(),
  };
}

export async function importBackup(payload: BackupPayload) {
  if (payload.app !== "local-money" || payload.version !== 1) {
    throw new Error("备份文件格式不正确");
  }

  await db.transaction("rw", db.transactions, db.categories, async () => {
    await db.transactions.clear();
    await db.categories.clear();
    await db.categories.bulkAdd(payload.categories.map(({ id: _id, ...item }) => item));
    await db.transactions.bulkAdd(payload.transactions.map(({ id: _id, ...item }) => item));
  });
}
