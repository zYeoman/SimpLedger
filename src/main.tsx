import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useLiveQuery } from "dexie-react-hooks";
import { Button, DatePicker, Picker, Popup, TabBar } from "antd-mobile";
import "antd-mobile/bundle/style.css";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Apple,
  Baby,
  BarChart3,
  BadgeCent,
  BadgeDollarSign,
  BadgePercent,
  Banknote,
  Beer,
  Bike,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  Bus,
  CakeSlice,
  Candy,
  Car,
  Cat,
  CircleDollarSign,
  Clapperboard,
  Coins,
  Coffee,
  Cookie,
  CreditCard,
  CupSoda,
  Dog,
  Droplets,
  Dumbbell,
  Download,
  Film,
  Fuel,
  Gift,
  GraduationCap,
  Gamepad2,
  HandCoins,
  HeartPulse,
  Home,
  Hospital,
  House,
  IceCream,
  KeyRound,
  Landmark,
  Lightbulb,
  Milk,
  Music,
  Package,
  PiggyBank,
  Pill,
  Plane,
  Pizza,
  Plus,
  ReceiptText,
  Sandwich,
  Settings,
  ShieldPlus,
  ShoppingBag,
  ShoppingCart,
  Shirt,
  Ship,
  ShowerHead,
  Smartphone,
  Soup,
  Store,
  Tags,
  Ticket,
  Train,
  TrendingUp,
  Truck,
  Umbrella,
  Upload,
  Utensils,
  Wallet,
  Wifi,
  Wine,
  Wrench,
  Zap,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { db, defaultAccounts, exportBackup, importBackup, seedCategories, type Account, type BackupPayload, type Transaction, type TransactionType } from "./db";
import { currency, fileSafeStamp, getMonthRange, groupByDate, monthKey, sumByType, todayInputValue } from "./utils";
import "./styles.css";

type View = "home" | "assets" | "stats" | "settings";

const typeLabel: Record<TransactionType, string> = {
  expense: "支出",
  income: "收入",
};

function App() {
  const [view, setView] = useState<View>("home");
  const [isEntryOpen, setIsEntryOpen] = useState(false);
  const [isEntryClosing, setIsEntryClosing] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const isEntryOpenRef = useRef(false);
  const entryHistoryPushedRef = useRef(false);
  const [statsMode, setStatsMode] = useState<"month" | "year">("month");
  const [statsMonth, setStatsMonth] = useState(monthKey());
  const [statsYear, setStatsYear] = useState(String(new Date().getFullYear()));
  const [homeAccountFilter, setHomeAccountFilter] = useState("all");
  const [isSeedReady, setIsSeedReady] = useState(false);
  const categoryRows = useLiveQuery(() => db.categories.orderBy("type").toArray(), []);
  const accountRows = useLiveQuery(() => db.accounts.orderBy("createdAt").toArray(), []);
  const transactionRows = useLiveQuery(() => db.transactions.orderBy("date").reverse().toArray(), []);
  const categories = categoryRows ?? [];
  const accounts = accountRows ?? [];
  const transactions = transactionRows ?? [];
  const isDataReady = isSeedReady && categoryRows !== undefined && accountRows !== undefined && transactionRows !== undefined;

  useEffect(() => {
    let isActive = true;
    seedCategories().finally(() => {
      if (isActive) setIsSeedReady(true);
    });
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/public-sw.js").catch(() => undefined);
    }
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    isEntryOpenRef.current = isEntryOpen;
  }, [isEntryOpen]);

  useEffect(() => {
    function handlePopState() {
      if (isEntryOpenRef.current) {
        animateEntryClose();
      }
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const currentMonthItems = useMemo(() => {
    const range = getMonthRange(monthKey());
    return transactions.filter((item) => item.date >= range.start && item.date <= range.end);
  }, [transactions]);
  const homeItems = useMemo(() => {
    if (homeAccountFilter === "all") return currentMonthItems;
    return currentMonthItems.filter((item) => (item.account || defaultAccounts[0]) === homeAccountFilter);
  }, [homeAccountFilter, currentMonthItems]);
  const statsItems = useMemo(() => {
    if (statsMode === "month") {
      const range = getMonthRange(statsMonth);
      return transactions.filter((item) => item.date >= range.start && item.date <= range.end);
    }
    return transactions.filter((item) => item.date.startsWith(`${statsYear}-`));
  }, [statsMode, statsMonth, statsYear, transactions]);

  return (
    <main className="app-shell">
      <header className={`topbar ${view === "stats" ? "stats-topbar" : ""}`}>
        <div>
          <h1>{titleForView(view)}</h1>
        </div>
        {view === "stats" && (
          <StatsPeriodControls
            mode={statsMode}
            setMode={setStatsMode}
            month={statsMonth}
            setMonth={setStatsMonth}
            year={statsYear}
            setYear={setStatsYear}
          />
        )}
      </header>

      <section className="content">
        {!isDataReady && <LoadingState />}
        {isDataReady && view === "home" && (
          <HomeView
            items={homeItems}
            categories={categories}
            accounts={accounts}
            accountFilter={homeAccountFilter}
            setAccountFilter={setHomeAccountFilter}
            goAdd={() => openEntryPage()}
            goEdit={openEntryPage}
          />
        )}
        {isDataReady && view === "assets" && <AssetsView items={transactions} accounts={accounts} />}
        {isDataReady && view === "stats" && (
          <StatsView
            items={statsItems}
            categories={categories}
            mode={statsMode}
            month={statsMonth}
            year={statsYear}
          />
        )}
        {isDataReady && view === "settings" && <SettingsView categories={categories} transactions={transactions} />}
      </section>

      {isEntryOpen && (
        <section className={`entry-page ${isEntryClosing ? "leaving" : ""}`} aria-labelledby="entry-title">
          <div className="entry-page-inner">
            <div className="sheet-title">
              <h2 id="entry-title">{editingTransaction ? "修改一笔" : "记一笔"}</h2>
              <button onClick={closeEntryPage}>关闭</button>
            </div>
            {isDataReady ? (
              <EntryForm categories={categories} accounts={accounts} transaction={editingTransaction} onDone={closeEntryPage} />
            ) : (
              <LoadingState />
            )}
          </div>
        </section>
      )}

      <nav className="bottom-nav">
        <TabBar className="main-tabbar" activeKey={view} onChange={(key) => setView(key as View)}>
          <TabBar.Item key="home" icon={<Home size={20} />} title="首页" />
          <TabBar.Item key="assets" icon={<Wallet size={20} />} title="资产" />
          <TabBar.Item key="stats" icon={<BarChart3 size={20} />} title="统计" />
          <TabBar.Item key="settings" icon={<Settings size={20} />} title="设置" />
        </TabBar>
        <button className="add-fab" aria-label="记一笔" disabled={!isDataReady} onClick={() => openEntryPage()}>
          <Plus size={26} />
        </button>
      </nav>
    </main>
  );

  function openEntryPage(transaction?: Transaction) {
    if (isEntryOpenRef.current || !isDataReady) return;
    setEditingTransaction(transaction ?? null);
    window.history.pushState({ localMoneyEntry: true }, "", window.location.href);
    entryHistoryPushedRef.current = true;
    setIsEntryClosing(false);
    setIsEntryOpen(true);
    isEntryOpenRef.current = true;
  }

  function closeEntryPage() {
    if (entryHistoryPushedRef.current) {
      window.history.back();
      return;
    }
    animateEntryClose();
  }

  function animateEntryClose() {
    setIsEntryClosing(true);
    window.setTimeout(() => {
      setIsEntryOpen(false);
      setIsEntryClosing(false);
      setEditingTransaction(null);
      isEntryOpenRef.current = false;
      entryHistoryPushedRef.current = false;
    }, 220);
  }
}

function titleForView(view: View) {
  return {
    home: "记账",
    assets: "资产",
    stats: "统计",
    settings: "设置",
  }[view];
}

function HomeView({
  items,
  categories,
  accounts,
  accountFilter,
  setAccountFilter,
  goAdd,
  goEdit,
}: {
  items: Transaction[];
  categories: ReturnType<typeof useCategories>;
  accounts: Account[];
  accountFilter: string;
  setAccountFilter: (value: string) => void;
  goAdd: () => void;
  goEdit: (transaction: Transaction) => void;
}) {
  const expense = sumByType(items, "expense");
  const income = sumByType(items, "income");
  const accountNames = accounts.length ? accounts.map((item) => item.name) : defaultAccounts;

  return (
    <>
      <div className="account-filter">
        <button className={accountFilter === "all" ? "selected" : ""} onClick={() => setAccountFilter("all")}>
          全部
        </button>
        {accountNames.map((account) => (
          <button key={account} className={accountFilter === account ? "selected" : ""} onClick={() => setAccountFilter(account)}>
            {account}
          </button>
        ))}
      </div>
      <section className="metric-grid">
        <Metric label="本月支出" value={currency.format(expense)} tone="expense" />
        <Metric label="本月收入" value={currency.format(income)} tone="income" />
      </section>
      <section className="panel">
        <div className="section-title">
          <h2>本月明细</h2>
        </div>
        {items.length === 0 ? <EmptyState /> : <TransactionList items={items} categories={categories} goEdit={goEdit} />}
      </section>
    </>
  );
}

function Metric({ icon, label, value, tone }: { icon?: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className={`metric ${tone}`}>
      {icon && <div>{icon}</div>}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EntryForm({
  categories,
  accounts,
  transaction,
  onDone,
}: {
  categories: ReturnType<typeof useCategories>;
  accounts: Account[];
  transaction: Transaction | null;
  onDone: () => void;
}) {
  const [type, setType] = useState<TransactionType>(transaction?.type ?? "expense");
  const typeCategories = categories.filter((category) => category.type === type);
  const accountNames = accounts.length ? accounts.map((item) => item.name) : defaultAccounts;
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : "");
  const [category, setCategory] = useState(transaction?.category ?? typeCategories[0]?.name ?? "");
  const [account, setAccount] = useState(transaction?.account ?? accountNames[0]);
  const [date, setDate] = useState(transaction?.date ?? todayInputValue());
  const [note, setNote] = useState(transaction?.note ?? "");

  useEffect(() => {
    if (!typeCategories.some((item) => item.name === category)) {
      setCategory(typeCategories[0]?.name ?? "");
    }
  }, [type, categories.length, category]);

  useEffect(() => {
    if (!accountNames.includes(account)) {
      setAccount(accountNames[0]);
    }
  }, [accountNames.join("|")]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (/[+-]/.test(amount)) {
      calculateAmountInPlace();
      return;
    }
    const value = evaluateAmountExpression(amount);
    if (!value || value <= 0 || !category) return;
    const now = new Date().toISOString();
    const payload = {
      type,
      amount: Math.round(value * 100) / 100,
      category,
      account,
      note: note.trim(),
      date,
      updatedAt: now,
    };
    if (transaction?.id) {
      await db.transactions.update(transaction.id, payload);
    } else {
      await db.transactions.add({
        ...payload,
        createdAt: now,
      });
    }
    setAmount("");
    setNote("");
    onDone();
  }

  function pressAmountKey(key: string) {
    setAmount((current) => {
      if (key === "backspace") {
        return current.slice(0, -1);
      }
      if (key === "clear") {
        return "";
      }
      if (key === "+" || key === "-") {
        if (!current) return "";
        if (/[+-]$/.test(current)) return `${current.slice(0, -1)}${key}`;
        return `${current}${key}`;
      }
      if (key === ".") {
        const segments = current.split(/[+-]/);
        const segment = segments[segments.length - 1] ?? "";
        return segment.includes(".") ? current : `${current || "0"}.`;
      }
      const segments = current.split(/[+-]/);
      const segment = segments[segments.length - 1] ?? "";
      if (segment.includes(".") && segment.split(".")[1].length >= 2) {
        return current;
      }
      if (segment === "0" && key !== ".") {
        return `${current.slice(0, -1)}${key}`;
      }
      return `${current}${key}`;
    });
  }

  function preventKeyboardSubmit(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
    }
  }

  const dateLabel = formatEntryDateLabel(date);
  const dateValue = new Date(`${date}T00:00:00`);
  const accountColumns = [accountNames.map((item) => ({ label: item, value: item }))];
  const hasAmountExpression = /[+-]/.test(amount);

  function calculateAmountInPlace() {
    const value = evaluateAmountExpression(amount);
    if (value > 0) {
      setAmount(String(value));
    }
  }

  return (
    <form className="entry-form" onSubmit={submit} onKeyDown={preventKeyboardSubmit}>
      <div className="segmented">
        <button type="button" className={type === "expense" ? "selected" : ""} onClick={() => setType("expense")}>
          支出
        </button>
        <button type="button" className={type === "income" ? "selected" : ""} onClick={() => setType("income")}>
          收入
        </button>
      </div>

      <div className="category-grid">
        {typeCategories.map((item) => (
          <button
            type="button"
            key={`${item.type}-${item.name}`}
            className={category === item.name ? "selected" : ""}
            onClick={() => setCategory(item.name)}
            style={{ "--swatch": item.color } as React.CSSProperties}
          >
            <span>
              <CategoryIcon icon={item.icon} />
            </span>
            <em>{item.name}</em>
          </button>
        ))}
      </div>

      <div className="entry-bottom">
        <div className="entry-meta-grid">
          <div className="meta-left">
            <div className="choice-wrap">
              <DatePicker title="选择日期" value={dateValue} onConfirm={(value) => setDate(toDateInputValue(value))}>
                {(_, actions) => (
                  <Button className="choice-button" color="primary" fill="solid" onClick={actions.open}>
                    {dateLabel}
                  </Button>
                )}
              </DatePicker>
            </div>
            <div className="choice-wrap">
              <Picker columns={accountColumns} value={[account]} onConfirm={(value) => setAccount(String(value[0]))}>
                {(_, actions) => (
                  <Button className="choice-button" color="primary" fill="solid" onClick={actions.open}>
                    {account}
                  </Button>
                )}
              </Picker>
            </div>
          </div>
          <label className="field note-field">
            <input placeholder="备注" value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
        </div>
        <label className="field amount-field">
          <span>金额</span>
          <output>{amount || "0.00"}</output>
        </label>
        <div className="number-pad" aria-label="金额数字键盘">
          {["1", "2", "3"].map((key) => (
            <button type="button" key={key} onClick={() => pressAmountKey(key)}>
              {key}
            </button>
          ))}
          <button type="button" className="operator-key" onClick={() => pressAmountKey("+")}>
            +
          </button>
          {["4", "5", "6"].map((key) => (
            <button type="button" key={key} onClick={() => pressAmountKey(key)}>
              {key}
            </button>
          ))}
          <button type="button" className="operator-key" onClick={() => pressAmountKey("-")}>
            -
          </button>
          {["7", "8", "9"].map((key) => (
            <button type="button" key={key} onClick={() => pressAmountKey(key)}>
              {key}
            </button>
          ))}
          <button type="button" className="operator-key" onClick={() => pressAmountKey("backspace")} aria-label="退格">
            ⌫
          </button>
          <button type="button" onClick={() => pressAmountKey(".")}>
            .
          </button>
          <button type="button" onClick={() => pressAmountKey("0")}>
            0
          </button>
          <button type="button" className="clear-key" onClick={() => pressAmountKey("clear")}>
            清空
          </button>
          {hasAmountExpression ? (
            <button
              type="button"
              className="confirm-key"
              aria-label="计算"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                calculateAmountInPlace();
              }}
            >
              =
            </button>
          ) : (
            <button type="submit" className="confirm-key" aria-label="提交">
              ✓
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

function evaluateAmountExpression(expression: string) {
  if (!expression || /[+-]$/.test(expression)) return 0;
  const parts = expression.match(/[+-]?[^+-]+/g);
  if (!parts) return 0;
  const total = parts.reduce((sum, part) => {
    const value = Number(part);
    if (!Number.isFinite(value)) return NaN;
    return sum + value;
  }, 0);
  return Number.isFinite(total) ? Math.round(total * 100) / 100 : 0;
}

function toDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatEntryDateLabel(value: string) {
  if (value === todayInputValue()) return "今天";
  const date = new Date(`${value}T00:00:00`);
  const currentYear = new Date().getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  if (date.getFullYear() === currentYear) return `${month}/${day}`;
  return `${date.getFullYear()}/${month}/${day}`;
}

function useCategories() {
  return useLiveQuery(() => db.categories.toArray(), [], []) ?? [];
}

function TransactionList({
  items,
  categories,
  goEdit,
  compact = false,
}: {
  items: Transaction[];
  categories: ReturnType<typeof useCategories>;
  goEdit: (transaction: Transaction) => void;
  compact?: boolean;
}) {
  const [selectedItem, setSelectedItem] = useState<Transaction | null>(null);
  const groups = groupByDate(items);

  function selectItem(item: Transaction) {
    if (!item.id) return;
    setSelectedItem(item);
  }

  async function deleteItem(id: number) {
    await db.transactions.delete(id);
    setSelectedItem(null);
  }

  return (
    <>
      <div className="transaction-list">
        {Object.entries(groups).map(([date, records]) => (
          <div className="day-group" key={date}>
            {!compact && <DateHeader date={date} records={records} />}
            {records.map((item) => {
              const meta = getCategoryMeta(item, categories);
              return (
                <article key={item.id} className="transaction-row clickable timeline-row" onClick={() => selectItem(item)}>
                  <time>{formatRecordTime(item)}</time>
                  <div className="timeline-dot" />
                  <div
                    className="transaction-pill"
                    style={
                      {
                        "--row-bg": softColor(meta.color),
                        "--row-fg": meta.color,
                      } as React.CSSProperties
                    }
                  >
                    <div className="category-icon">
                      <CategoryIcon icon={meta.icon} />
                    </div>
                    <div className="row-main">
                      <strong>{item.category}</strong>
                      <span>{[item.account, item.note].filter(Boolean).join(" · ") || typeLabel[item.type]}</span>
                    </div>
                    <div className={`row-amount ${item.type}`}>
                      {item.type === "expense" ? "-" : "+"}
                      {currency.format(item.amount).replace("¥", "")}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ))}
      </div>
      {selectedItem?.id && (
        <div className="detail-overlay" role="presentation">
          <button className="detail-backdrop" aria-label="关闭详情" onClick={() => setSelectedItem(null)} />
          <section className="detail-card floating" role="dialog" aria-modal="true" aria-label="账单详情">
            <div className="detail-grid">
              <span>类型</span>
              <strong>{typeLabel[selectedItem.type]}</strong>
              <span>金额</span>
              <strong>{currency.format(selectedItem.amount)}</strong>
              <span>分类</span>
              <strong>{selectedItem.category}</strong>
              <span>账户</span>
              <strong>{selectedItem.account || defaultAccounts[0]}</strong>
              <span>日期</span>
              <strong>{selectedItem.date}</strong>
              <span>备注</span>
              <strong>{selectedItem.note || "无"}</strong>
            </div>
            <div className="detail-actions">
              <button type="button" className="secondary-button danger-button" onClick={() => deleteItem(selectedItem.id!)}>
                删除
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  const item = selectedItem;
                  setSelectedItem(null);
                  goEdit(item);
                }}
              >
                修改
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function DateHeader({ date, records }: { date: string; records: Transaction[] }) {
  const day = new Date(`${date}T00:00:00`);
  const income = sumByType(records, "income");
  const expense = sumByType(records, "expense");
  const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(day);

  return (
    <div className="date-header">
      <div>
        <strong>{String(day.getDate()).padStart(2, "0")}</strong>
        <span>/ {String(day.getMonth() + 1).padStart(2, "0")}</span>
        <em>{weekday}</em>
      </div>
      <div>
        <span>+{formatAmountPlain(income)}</span>
        <span className="expense">-{formatAmountPlain(expense)}</span>
      </div>
    </div>
  );
}

function formatRecordTime(item: Transaction) {
  const source = item.createdAt || `${item.date}T00:00:00`;
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(source));
}

function formatAmountPlain(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

const categoryIconOptions = [
  { value: "eat", label: "吃饭" },
  { value: "hamburger", label: "汉堡" },
  { value: "soup", label: "汤粥" },
  { value: "pizza", label: "披萨" },
  { value: "ice", label: "冷饮" },
  { value: "drink", label: "饮料" },
  { value: "coffee", label: "咖啡" },
  { value: "beer", label: "酒水" },
  { value: "milk", label: "奶制品" },
  { value: "fruit", label: "水果" },
  { value: "snack", label: "零食" },
  { value: "cake", label: "甜品" },
  { value: "traffic", label: "交通" },
  { value: "car", label: "汽车" },
  { value: "bike", label: "骑行" },
  { value: "train", label: "火车" },
  { value: "fly", label: "飞机" },
  { value: "fuel", label: "加油" },
  { value: "taxi", label: "打车" },
  { value: "ship", label: "船舶" },
  { value: "shop", label: "商店" },
  { value: "cart", label: "购物车" },
  { value: "bag", label: "购物袋" },
  { value: "shirt", label: "服饰" },
  { value: "gift", label: "礼物" },
  { value: "tags", label: "优惠" },
  { value: "ticket", label: "票券" },
  { value: "house", label: "房屋" },
  { value: "water", label: "水电" },
  { value: "safe", label: "保险" },
  { value: "key", label: "钥匙" },
  { value: "building", label: "楼房" },
  { value: "health", label: "医疗" },
  { value: "pill", label: "药物" },
  { value: "hospital", label: "医院" },
  { value: "fitness", label: "健身" },
  { value: "happy", label: "娱乐" },
  { value: "film", label: "电影" },
  { value: "music", label: "音乐" },
  { value: "daily", label: "日用" },
  { value: "light", label: "电费" },
  { value: "shower", label: "洗护" },
  { value: "wifi", label: "网络" },
  { value: "phone", label: "数码" },
  { value: "education", label: "教育" },
  { value: "book", label: "学习" },
  { value: "baby", label: "育儿" },
  { value: "pet", label: "宠物" },
  { value: "work", label: "工作" },
  { value: "card", label: "卡片" },
  { value: "bank", label: "银行" },
  { value: "receipt", label: "票据" },
  { value: "repair", label: "维修" },
  { value: "salary", label: "工资" },
  { value: "income", label: "收入" },
  { value: "cash", label: "现金" },
  { value: "awards", label: "奖金" },
  { value: "refund", label: "退款" },
  { value: "dividends", label: "分红" },
  { value: "manage", label: "理财" },
  { value: "sale", label: "销售" },
  { value: "coins", label: "硬币" },
  { value: "percent", label: "折扣" },
  { value: "money", label: "钱币" },
  { value: "piggy", label: "储蓄" },
  { value: "wallet", label: "钱包" },
  { value: "package", label: "快递" },
];

const categoryColorOptions = [
  "#d95f43",
  "#df5750",
  "#c24b5a",
  "#c28a2c",
  "#5f8f5f",
  "#2f7d62",
  "#3d8b93",
  "#3a8d8f",
  "#4776b4",
  "#8b68b8",
  "#b45f9d",
  "#8c6b4f",
  "#455160",
  "#6f7680",
];

function CategoryIcon({ icon }: { icon?: string }) {
  const props = { size: 26, strokeWidth: 2.8 };
  if (icon === "eat") return <Utensils {...props} />;
  if (icon === "hamburger") return <Sandwich {...props} />;
  if (icon === "food") return <Utensils {...props} />;
  if (icon === "soup") return <Soup {...props} />;
  if (icon === "pizza") return <Pizza {...props} />;
  if (icon === "ice") return <IceCream {...props} />;
  if (icon === "drink") return <CupSoda {...props} />;
  if (icon === "coffee") return <Coffee {...props} />;
  if (icon === "beer") return <Beer {...props} />;
  if (icon === "milk") return <Milk {...props} />;
  if (icon === "fruit") return <Apple {...props} />;
  if (icon === "snack") return <Cookie {...props} />;
  if (icon === "cake") return <CakeSlice {...props} />;
  if (icon === "traffic") return <Bus {...props} />;
  if (icon === "bus") return <Bus {...props} />;
  if (icon === "car") return <Car {...props} />;
  if (icon === "bike") return <Bike {...props} />;
  if (icon === "train") return <Train {...props} />;
  if (icon === "fly") return <Plane {...props} />;
  if (icon === "fuel") return <Fuel {...props} />;
  if (icon === "plane") return <Plane {...props} />;
  if (icon === "taxi") return <Car {...props} />;
  if (icon === "ship") return <Ship {...props} />;
  if (icon === "shop") return <Store {...props} />;
  if (icon === "cart") return <ShoppingCart {...props} />;
  if (icon === "bag") return <ShoppingBag {...props} />;
  if (icon === "shopping") return <ShoppingBag {...props} />;
  if (icon === "shirt") return <Shirt {...props} />;
  if (icon === "gift") return <Gift {...props} />;
  if (icon === "tags") return <Tags {...props} />;
  if (icon === "ticket") return <Ticket {...props} />;
  if (icon === "house") return <House {...props} />;
  if (icon === "home") return <House {...props} />;
  if (icon === "life") return <Zap {...props} />;
  if (icon === "water") return <Droplets {...props} />;
  if (icon === "safe") return <ShieldPlus {...props} />;
  if (icon === "key") return <KeyRound {...props} />;
  if (icon === "building") return <Building2 {...props} />;
  if (icon === "health") return <HeartPulse {...props} />;
  if (icon === "medical") return <HeartPulse {...props} />;
  if (icon === "pill") return <Pill {...props} />;
  if (icon === "hospital") return <Hospital {...props} />;
  if (icon === "fitness") return <Dumbbell {...props} />;
  if (icon === "happy") return <Gamepad2 {...props} />;
  if (icon === "game") return <Gamepad2 {...props} />;
  if (icon === "film") return <Film {...props} />;
  if (icon === "movie") return <Clapperboard {...props} />;
  if (icon === "music") return <Music {...props} />;
  if (icon === "daily") return <Zap {...props} />;
  if (icon === "light") return <Lightbulb {...props} />;
  if (icon === "shower") return <ShowerHead {...props} />;
  if (icon === "wifi") return <Wifi {...props} />;
  if (icon === "phone") return <Smartphone {...props} />;
  if (icon === "education") return <GraduationCap {...props} />;
  if (icon === "book") return <BookOpen {...props} />;
  if (icon === "baby") return <Baby {...props} />;
  if (icon === "pet") return <Dog {...props} />;
  if (icon === "cat") return <Cat {...props} />;
  if (icon === "work") return <BriefcaseBusiness {...props} />;
  if (icon === "card") return <CreditCard {...props} />;
  if (icon === "bank") return <Landmark {...props} />;
  if (icon === "receipt") return <ReceiptText {...props} />;
  if (icon === "repair") return <Wrench {...props} />;
  if (icon === "salary") return <BadgeDollarSign {...props} />;
  if (icon === "income") return <HandCoins {...props} />;
  if (icon === "cash") return <Banknote {...props} />;
  if (icon === "awards") return <Gift {...props} />;
  if (icon === "refund") return <ReceiptText {...props} />;
  if (icon === "dividends") return <PiggyBank {...props} />;
  if (icon === "manage") return <TrendingUp {...props} />;
  if (icon === "sale") return <Store {...props} />;
  if (icon === "coins") return <Coins {...props} />;
  if (icon === "percent") return <BadgePercent {...props} />;
  if (icon === "cent") return <BadgeCent {...props} />;
  if (icon === "money") return <CircleDollarSign {...props} />;
  if (icon === "piggy") return <PiggyBank {...props} />;
  if (icon === "package") return <Package {...props} />;
  if (icon === "truck") return <Truck {...props} />;
  if (icon === "umbrella") return <Umbrella {...props} />;
  if (icon === "wine") return <Wine {...props} />;
  return <Wallet {...props} />;
}

function getCategoryMeta(transaction: Transaction, categories: ReturnType<typeof useCategories>) {
  const matched = categories.find((category) => category.name === transaction.category && category.type === transaction.type);
  return {
    color: matched?.color || (transaction.type === "income" ? "#2f7d62" : "#6f7680"),
    icon: matched?.icon || "wallet",
  };
}

function softColor(hex: string) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return "#eef0e7";
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgb(${Math.round(red + (255 - red) * 0.72)}, ${Math.round(green + (255 - green) * 0.72)}, ${Math.round(
    blue + (255 - blue) * 0.72
  )})`;
}

function AssetsView({ items, accounts }: { items: Transaction[]; accounts: Account[] }) {
  const [newAccount, setNewAccount] = useState("");
  const accountNames = accounts.length ? accounts.map((item) => item.name) : defaultAccounts;
  const rows = accountNames.map((account) => {
    const accountItems = items.filter((item) => (item.account || defaultAccounts[0]) === account);
    const income = sumByType(accountItems, "income");
    const expense = sumByType(accountItems, "expense");
    return {
      account,
      income,
      expense,
      balance: income - expense,
      count: accountItems.length,
      id: accounts.find((item) => item.name === account)?.id,
    };
  });
  const total = rows.reduce((sum, item) => sum + item.balance, 0);

  async function addAccount(event: React.FormEvent) {
    event.preventDefault();
    const name = newAccount.trim();
    if (!name || accountNames.includes(name)) return;
    await db.accounts.add({ name, createdAt: new Date().toISOString() });
    setNewAccount("");
  }

  async function deleteAccount(id: number | undefined, count: number) {
    if (!id || count > 0) return;
    await db.accounts.delete(id);
  }

  return (
    <section className="settings-stack">
      <div className="summary-band asset-summary">
        <div>
          <span>总资产</span>
          <strong>{currency.format(total)}</strong>
        </div>
      </div>
      <div className="panel">
        <div className="section-title">
          <h2>账户汇总</h2>
          <span>按已记录收支计算</span>
        </div>
        <form className="asset-add-form" onSubmit={addAccount}>
          <input placeholder="新增资产账户" value={newAccount} onChange={(event) => setNewAccount(event.target.value)} />
          <button type="submit">添加</button>
        </form>
        <div className="asset-list">
          {rows.map((row) => (
            <article className="asset-row" key={row.account}>
              <div>
                <strong>{row.account}</strong>
                <span>{row.count} 笔记录</span>
              </div>
              <div>
                <strong className={row.balance < 0 ? "negative" : ""}>{currency.format(row.balance)}</strong>
                <span>
                  收入 {currency.format(row.income)} · 支出 {currency.format(row.expense)}
                </span>
              </div>
              <button className="asset-delete" disabled={row.count > 0} onClick={() => deleteAccount(row.id, row.count)}>
                删除
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatsView({
  items,
  categories,
  mode,
  month,
  year,
}: {
  items: Transaction[];
  categories: ReturnType<typeof useCategories>;
  mode: "month" | "year";
  month: string;
  year: string;
}) {
  const expenseTotal = sumByType(items, "expense");
  const incomeTotal = sumByType(items, "income");
  const expenseData = buildCategoryStats(items, categories, "expense");
  const incomeData = buildCategoryStats(items, categories, "income");

  return (
    <section className="stats-page">
      <div className="stats-summary">
        <div>
          <span>支出</span>
          <strong className="expense">{currency.format(expenseTotal)}</strong>
        </div>
        <div>
          <span>收入</span>
          <strong>{currency.format(incomeTotal)}</strong>
        </div>
        <div>
          <span>结余</span>
          <strong className={incomeTotal - expenseTotal < 0 ? "expense" : ""}>{currency.format(incomeTotal - expenseTotal)}</strong>
        </div>
      </div>
      <StatsCategorySection title="支出分类" total={expenseTotal} data={expenseData} />
      <StatsCategorySection title="收入分类" total={incomeTotal} data={incomeData} />
    </section>
  );
}

function StatsPeriodControls({
  mode,
  setMode,
  month,
  setMonth,
  year,
  setYear,
}: {
  mode: "month" | "year";
  setMode: (mode: "month" | "year") => void;
  month: string;
  setMonth: (month: string) => void;
  year: string;
  setYear: (year: string) => void;
}) {
  const dateValue = mode === "month" ? new Date(`${month}-01T00:00:00`) : new Date(`${year}-01-01T00:00:00`);
  const dateLabel = mode === "month" ? formatStatsMonthLabel(month) : year;

  return (
    <div className="stats-controls">
      <DatePicker
        title={mode === "month" ? "选择月份" : "选择年份"}
        precision={mode === "month" ? "month" : "year"}
        value={dateValue}
        onConfirm={(value) => {
          if (mode === "month") {
            setMonth(toDateInputValue(value).slice(0, 7));
          } else {
            setYear(String(value.getFullYear()));
          }
        }}
      >
        {(_, actions) => (
          <Button className="stats-control-button" color="primary" fill="solid" onClick={actions.open}>
            {dateLabel}
          </Button>
        )}
      </DatePicker>
      <Button
        className="stats-control-button"
        color="primary"
        fill="solid"
        onClick={() => setMode(mode === "month" ? "year" : "month")}
      >
        {mode === "month" ? "按月统计" : "按年统计"}
      </Button>
    </div>
  );
}

function formatStatsMonthLabel(value: string) {
  const [year, month] = value.split("-");
  return `${year.slice(-2)}/${month}`;
}

type CategoryStat = {
  name: string;
  value: number;
  percent: number;
  color: string;
  icon?: string;
};

function buildCategoryStats(items: Transaction[], categories: ReturnType<typeof useCategories>, type: TransactionType): CategoryStat[] {
  const typedItems = items.filter((item) => item.type === type);
  const total = sumByType(typedItems, type);
  return Object.entries(
    typedItems.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] ?? 0) + item.amount;
      return acc;
    }, {})
  )
    .map(([name, value]) => {
      const category = categories.find((item) => item.name === name && item.type === type);
      return {
        name,
        value,
        percent: total ? (value / total) * 100 : 0,
        color: category?.color ?? "#6f7680",
        icon: category?.icon ?? "wallet",
      };
    })
    .sort((a, b) => b.value - a.value);
}

function StatsCategorySection({ title, total, data }: { title: string; total: number; data: CategoryStat[] }) {
  const chartData = data.length ? data : [{ name: "暂无", value: 1, percent: 0, color: "#f0f1f4", icon: "wallet" }];

  return (
    <section className="panel stats-category-panel">
      <div className="section-title stats-section-title">
        <h2>{title}</h2>
        <strong>{currency.format(total)}</strong>
      </div>
      {data.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="stats-chart-layout">
            <div className="stats-donut">
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie data={chartData} dataKey="value" innerRadius={46} outerRadius={78} paddingAngle={2}>
                    {chartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => currency.format(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="stats-rank-list">
            {data.map((item) => (
              <div className="stats-rank-row" key={item.name}>
                <div className="stats-rank-icon" style={{ "--swatch": item.color } as React.CSSProperties}>
                  <CategoryIcon icon={item.icon} />
                </div>
                <div>
                  <div className="stats-rank-title">
                    <strong>{item.name}</strong>
                    <span>{formatAmountPlain(item.value)}</span>
                  </div>
                  <div className="stats-progress">
                    <i style={{ width: `${Math.max(item.percent, 3)}%`, background: item.color }} />
                  </div>
                </div>
                <em>{item.percent.toFixed(2)}%</em>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function SettingsView({ categories, transactions }: { categories: ReturnType<typeof useCategories>; transactions: Transaction[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [updateStatus, setUpdateStatus] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryType, setNewCategoryType] = useState<TransactionType>("expense");
  const [newCategoryColor, setNewCategoryColor] = useState("#6f7680");
  const [newCategoryIcon, setNewCategoryIcon] = useState("wallet");

  async function downloadBackup() {
    const payload = await exportBackup();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `local-money-${fileSafeStamp()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const payload = JSON.parse(await file.text()) as BackupPayload;
    await importBackup(payload);
    event.target.value = "";
  }

  async function addCategory(event: React.FormEvent) {
    event.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    const exists = categories.some((category) => category.name === name && category.type === newCategoryType);
    if (exists) return;
    await db.categories.add({
      name,
      type: newCategoryType,
      color: newCategoryColor,
      icon: newCategoryIcon,
    });
    setNewCategoryName("");
  }

  async function checkForUpdates() {
    if (!("serviceWorker" in navigator)) {
      setUpdateStatus("当前浏览器不支持应用更新检查");
      return;
    }
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      setUpdateStatus("尚未安装离线服务，请刷新后再试");
      return;
    }
    setUpdateStatus("正在更新...");
    await registration.update();
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    setUpdateStatus("即将刷新应用");
    window.setTimeout(() => window.location.reload(), 300);
  }

  return (
    <section className="settings-stack">
      <div className="panel">
        <div className="section-title">
          <h2>应用</h2>
        </div>
        <button className="secondary-button update-button" onClick={checkForUpdates}>
          检查更新
        </button>
        {updateStatus && <p className="setting-hint">{updateStatus}</p>}
      </div>
      <div className="panel">
        <div className="section-title">
          <h2>备份</h2>
        </div>
        <div className="button-row">
          <button className="secondary-button" onClick={downloadBackup}>
            <Download size={18} />
            导出 JSON
          </button>
          <button className="secondary-button" onClick={() => fileRef.current?.click()}>
            <Upload size={18} />
            导入 JSON
          </button>
          <input ref={fileRef} hidden type="file" accept="application/json" onChange={handleImport} />
        </div>
      </div>
      <div className="panel">
        <div className="section-title">
          <h2>分类</h2>
          <span>{categories.length} 个</span>
        </div>
        <form className="category-add-form" onSubmit={addCategory}>
          <input placeholder="新增分类" value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} />
          <select value={newCategoryType} onChange={(event) => setNewCategoryType(event.target.value as TransactionType)}>
            <option value="expense">支出</option>
            <option value="income">收入</option>
          </select>
          <ColorPicker value={newCategoryColor} onChange={setNewCategoryColor} />
          <IconPicker value={newCategoryIcon} color={newCategoryColor} onChange={setNewCategoryIcon} />
          <button type="submit">添加</button>
        </form>
        <div className="category-editor-list">
          {categories.map((category) => {
            const usageCount = transactions.filter((item) => item.category === category.name && item.type === category.type).length;
            return (
              <div className="category-editor-row" key={`${category.type}-${category.name}`}>
                <IconPicker
                  value={category.icon || "wallet"}
                  color={category.color}
                  onChange={(icon) => category.id && db.categories.update(category.id, { icon })}
                />
                <div>
                  <strong>{category.name}</strong>
                  <span>
                    {typeLabel[category.type]} · {usageCount} 笔
                  </span>
                </div>
                <ColorPicker
                  value={category.color}
                  onChange={(color) => category.id && db.categories.update(category.id, { color })}
                />
                <button
                  type="button"
                  className="category-delete"
                  onClick={() => category.id && db.categories.delete(category.id)}
                >
                  删除
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function IconPicker({ value, color, onChange }: { value: string; color: string; onChange: (value: string) => void }) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <button
        type="button"
        className="icon-picker-trigger"
        aria-label="选择图标"
        style={{ "--swatch": color } as React.CSSProperties}
        onClick={() => setVisible(true)}
      >
        <CategoryIcon icon={value} />
      </button>
      <Popup visible={visible} onMaskClick={() => setVisible(false)} bodyClassName="icon-picker-popup">
        <div className="popup-title">选择图标</div>
        <div className="icon-picker-panel">
          {categoryIconOptions.map((option) => (
            <button
              type="button"
              key={option.value}
              className={value === option.value ? "selected" : ""}
              title={option.label}
              aria-label={option.label}
              onClick={() => {
                onChange(option.value);
                setVisible(false);
              }}
            >
              <CategoryIcon icon={option.value} />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </Popup>
    </>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <button
        type="button"
        className="color-picker-trigger"
        aria-label="选择颜色"
        style={{ "--swatch": value } as React.CSSProperties}
        onClick={() => setVisible(true)}
      />
      <Popup visible={visible} onMaskClick={() => setVisible(false)} bodyClassName="color-picker-popup">
        <div className="popup-title">选择颜色</div>
        <div className="color-picker-panel">
          {categoryColorOptions.map((color) => (
            <button
              type="button"
              key={color}
              className={value.toLowerCase() === color.toLowerCase() ? "selected" : ""}
              aria-label={color}
              style={{ "--swatch": color } as React.CSSProperties}
              onClick={() => {
                onChange(color);
                setVisible(false);
              }}
            />
          ))}
        </div>
        <label className="custom-color-field">
          <span>自定义</span>
          <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
        </label>
      </Popup>
    </>
  );
}

function EmptyState() {
  return <div className="empty-state">暂无记录</div>;
}

function LoadingState() {
  return <div className="empty-state loading-state">正在加载本地数据</div>;
}

createRoot(document.getElementById("root")!).render(<App />);
