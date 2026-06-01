import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useLiveQuery } from "dexie-react-hooks";
import { Button, DatePicker, Picker, TabBar } from "antd-mobile";
import "antd-mobile/bundle/style.css";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  Bus,
  Car,
  CircleDollarSign,
  Coffee,
  CreditCard,
  Dumbbell,
  Download,
  Film,
  Fuel,
  Gift,
  GraduationCap,
  Gamepad2,
  HeartPulse,
  Home,
  House,
  Landmark,
  Music,
  PiggyBank,
  Plane,
  Plus,
  ReceiptText,
  Settings,
  ShoppingBag,
  Shirt,
  Smartphone,
  Upload,
  Utensils,
  Wallet,
  Wrench,
  Zap,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { db, defaultAccounts, exportBackup, importBackup, seedCategories, type Account, type BackupPayload, type Transaction, type TransactionType } from "./db";
import { currency, fileSafeStamp, getMonthRange, groupByDate, monthKey, shortDate, sumByType, todayInputValue } from "./utils";
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
  const [month, setMonth] = useState(monthKey());
  const [homeAccountFilter, setHomeAccountFilter] = useState("all");
  const categories = useLiveQuery(() => db.categories.orderBy("type").toArray(), [], []);
  const accounts = useLiveQuery(() => db.accounts.orderBy("createdAt").toArray(), [], []);
  const transactions = useLiveQuery(() => db.transactions.orderBy("date").reverse().toArray(), [], []);

  useEffect(() => {
    seedCategories();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/public-sw.js").catch(() => undefined);
    }
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

  const monthItems = useMemo(() => {
    const range = getMonthRange(month);
    return transactions.filter((item) => item.date >= range.start && item.date <= range.end);
  }, [month, transactions]);
  const homeItems = useMemo(() => {
    if (homeAccountFilter === "all") return monthItems;
    return monthItems.filter((item) => (item.account || defaultAccounts[0]) === homeAccountFilter);
  }, [homeAccountFilter, monthItems]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">本地账本</p>
          <h1>{titleForView(view)}</h1>
        </div>
        <input className="month-input" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
      </header>

      <section className="content">
        {view === "home" && (
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
        {view === "assets" && <AssetsView items={transactions} accounts={accounts} />}
        {view === "stats" && <StatsView items={monthItems} categories={categories} month={month} />}
        {view === "settings" && <SettingsView categories={categories} transactions={transactions} />}
      </section>

      {isEntryOpen && (
        <section className={`entry-page ${isEntryClosing ? "leaving" : ""}`} aria-labelledby="entry-title">
          <div className="entry-page-inner">
            <div className="sheet-title">
              <h2 id="entry-title">{editingTransaction ? "修改一笔" : "记一笔"}</h2>
              <button onClick={closeEntryPage}>关闭</button>
            </div>
            <EntryForm categories={categories} accounts={accounts} transaction={editingTransaction} onDone={closeEntryPage} />
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
        <button className="add-fab" aria-label="记一笔" onClick={() => openEntryPage()}>
          <Plus size={26} />
        </button>
      </nav>
    </main>
  );

  function openEntryPage(transaction?: Transaction) {
    if (isEntryOpenRef.current) return;
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
    home: "月度概览",
    assets: "资产统计",
    stats: "分类统计",
    settings: "数据设置",
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
      <section className="summary-band">
        <div>
          <span>本月结余</span>
          <strong>{currency.format(income - expense)}</strong>
        </div>
      </section>
      <section className="metric-grid">
        <Metric icon={<ArrowDownCircle />} label="支出" value={currency.format(expense)} tone="expense" />
        <Metric icon={<ArrowUpCircle />} label="收入" value={currency.format(income)} tone="income" />
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

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className={`metric ${tone}`}>
      <div>{icon}</div>
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
            {item.name}
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
  { value: "food", label: "餐饮" },
  { value: "coffee", label: "咖啡" },
  { value: "bus", label: "交通" },
  { value: "car", label: "汽车" },
  { value: "fuel", label: "加油" },
  { value: "plane", label: "出行" },
  { value: "shopping", label: "购物" },
  { value: "shirt", label: "服饰" },
  { value: "gift", label: "礼物" },
  { value: "home", label: "居住" },
  { value: "health", label: "医疗" },
  { value: "fitness", label: "健身" },
  { value: "game", label: "娱乐" },
  { value: "film", label: "电影" },
  { value: "music", label: "音乐" },
  { value: "daily", label: "日用" },
  { value: "phone", label: "数码" },
  { value: "book", label: "学习" },
  { value: "work", label: "工作" },
  { value: "card", label: "卡片" },
  { value: "bank", label: "银行" },
  { value: "receipt", label: "票据" },
  { value: "repair", label: "维修" },
  { value: "money", label: "钱币" },
  { value: "piggy", label: "储蓄" },
  { value: "wallet", label: "钱包" },
];

function CategoryIcon({ icon }: { icon?: string }) {
  const props = { size: 26, strokeWidth: 2.8 };
  if (icon === "food") return <Utensils {...props} />;
  if (icon === "coffee") return <Coffee {...props} />;
  if (icon === "bus") return <Bus {...props} />;
  if (icon === "car") return <Car {...props} />;
  if (icon === "fuel") return <Fuel {...props} />;
  if (icon === "plane") return <Plane {...props} />;
  if (icon === "shopping") return <ShoppingBag {...props} />;
  if (icon === "shirt") return <Shirt {...props} />;
  if (icon === "gift") return <Gift {...props} />;
  if (icon === "home") return <House {...props} />;
  if (icon === "health") return <HeartPulse {...props} />;
  if (icon === "fitness") return <Dumbbell {...props} />;
  if (icon === "game") return <Gamepad2 {...props} />;
  if (icon === "film") return <Film {...props} />;
  if (icon === "music") return <Music {...props} />;
  if (icon === "daily") return <Zap {...props} />;
  if (icon === "phone") return <Smartphone {...props} />;
  if (icon === "book") return <BookOpen {...props} />;
  if (icon === "work") return <BriefcaseBusiness {...props} />;
  if (icon === "card") return <CreditCard {...props} />;
  if (icon === "bank") return <Landmark {...props} />;
  if (icon === "receipt") return <ReceiptText {...props} />;
  if (icon === "repair") return <Wrench {...props} />;
  if (icon === "money") return <CircleDollarSign {...props} />;
  if (icon === "piggy") return <PiggyBank {...props} />;
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

function StatsView({ items, categories, month }: { items: Transaction[]; categories: ReturnType<typeof useCategories>; month: string }) {
  const expenses = items.filter((item) => item.type === "expense");
  const data = Object.entries(
    expenses.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] ?? 0) + item.amount;
      return acc;
    }, {})
  )
    .map(([name, value]) => ({
      name,
      value,
      color: categories.find((category) => category.name === name && category.type === "expense")?.color ?? "#6f7680",
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <section className="panel stats-panel">
      <div className="section-title">
        <h2>{month} 支出分类</h2>
        <strong>{currency.format(sumByType(items, "expense"))}</strong>
      </div>
      {data.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={data} dataKey="value" innerRadius={62} outerRadius={104} paddingAngle={2}>
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => currency.format(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="rank-list">
            {data.map((item) => (
              <div className="rank-row" key={item.name}>
                <span style={{ background: item.color }} />
                <strong>{item.name}</strong>
                <em>{currency.format(item.value)}</em>
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

  return (
    <section className="settings-stack">
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
          <input aria-label="分类颜色" type="color" value={newCategoryColor} onChange={(event) => setNewCategoryColor(event.target.value)} />
          <IconPicker value={newCategoryIcon} onChange={setNewCategoryIcon} />
          <button type="submit">添加</button>
        </form>
        <div className="category-editor-list">
          {categories.map((category) => {
            const usageCount = transactions.filter((item) => item.category === category.name && item.type === category.type).length;
            return (
              <div className="category-editor-row" key={`${category.type}-${category.name}`}>
                <div className="category-preview" style={{ "--swatch": category.color } as React.CSSProperties}>
                  <CategoryIcon icon={category.icon} />
                </div>
                <div>
                  <strong>{category.name}</strong>
                  <span>
                    {typeLabel[category.type]} · {usageCount} 笔
                  </span>
                </div>
                <input
                  aria-label={`${category.name}颜色`}
                  type="color"
                  value={category.color}
                  onChange={(event) => category.id && db.categories.update(category.id, { color: event.target.value })}
                />
                <button
                  type="button"
                  className="category-delete"
                  onClick={() => category.id && db.categories.delete(category.id)}
                >
                  删除
                </button>
                <IconPicker
                  value={category.icon || "wallet"}
                  onChange={(icon) => category.id && db.categories.update(category.id, { icon })}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function IconPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="icon-picker">
      {categoryIconOptions.map((option) => (
        <button
          type="button"
          key={option.value}
          className={value === option.value ? "selected" : ""}
          title={option.label}
          aria-label={option.label}
          onClick={() => onChange(option.value)}
        >
          <CategoryIcon icon={option.value} />
        </button>
      ))}
    </div>
  );
}

function EmptyState() {
  return <div className="empty-state">暂无记录</div>;
}

createRoot(document.getElementById("root")!).render(<App />);
