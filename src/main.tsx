import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useLiveQuery } from "dexie-react-hooks";
import { Button, DatePicker, Picker, Popup, TabBar } from "antd-mobile";
import "antd-mobile/bundle/style.css";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowRightLeft,
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
import {
  accountKindLabel,
  accountKindOf,
  applyAutoTransfers,
  db,
  defaultAccounts,
  exportBackup,
  importBackup,
  inferAccountKind,
  seedCategories,
  type Account,
  type AccountKind,
  type BackupPayload,
  type RecurringFrequency,
  type Transaction,
  type TransactionType,
  type TransferRule,
} from "./db";
import { currency, fileSafeStamp, getMonthRange, groupByDate, monthKey, sumByType, todayInputValue } from "./utils";
import "./styles.css";

type View = "home" | "assets" | "stats" | "settings";

const typeLabel: Record<TransactionType, string> = {
  expense: "支出",
  income: "收入",
  transfer: "转账",
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
  const transferRuleRows = useLiveQuery(() => db.transferRules.orderBy("createdAt").toArray(), []);
  const categories = categoryRows ?? [];
  const accounts = accountRows ?? [];
  const transactions = transactionRows ?? [];
  const transferRules = transferRuleRows ?? [];
  const isDataReady = isSeedReady && categoryRows !== undefined && accountRows !== undefined && transactionRows !== undefined && transferRuleRows !== undefined;

  useEffect(() => {
    let isActive = true;
    seedCategories().then(() => applyAutoTransfers()).finally(() => {
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
    return currentMonthItems.filter((item) => transactionBelongsToAccount(item, homeAccountFilter));
  }, [homeAccountFilter, currentMonthItems]);
  const homeDetailItems = useMemo(() => {
    if (homeAccountFilter === "all") return transactions;
    return transactions.filter((item) => transactionBelongsToAccount(item, homeAccountFilter));
  }, [homeAccountFilter, transactions]);
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
            detailItems={homeDetailItems}
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
            accounts={accounts}
            mode={statsMode}
            month={statsMonth}
            year={statsYear}
          />
        )}
        {isDataReady && view === "settings" && (
          <SettingsView categories={categories} transactions={transactions} accounts={accounts} transferRules={transferRules} />
        )}
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

function transactionBelongsToAccount(item: Transaction, account: string) {
  return (item.account || defaultAccounts[0]) === account || (item.type === "transfer" && item.toAccount === account);
}

function HomeView({
  items,
  detailItems,
  categories,
  accounts,
  accountFilter,
  setAccountFilter,
  goAdd,
  goEdit,
}: {
  items: Transaction[];
  detailItems: Transaction[];
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
          <h2>明细</h2>
        </div>
        {detailItems.length === 0 ? <EmptyState /> : <VirtualTransactionList items={detailItems} categories={categories} goEdit={goEdit} />}
      </section>
    </>
  );
}

type VirtualTransactionRow =
  | { type: "month"; key: string; month: string }
  | { type: "date"; key: string; date: string; records: Transaction[] }
  | { type: "transaction"; key: string; item: Transaction };

const virtualRowHeights: Record<VirtualTransactionRow["type"], number> = {
  month: 42,
  date: 58,
  transaction: 88,
};

function VirtualTransactionList({
  items,
  categories,
  goEdit,
}: {
  items: Transaction[];
  categories: ReturnType<typeof useCategories>;
  goEdit: (transaction: Transaction) => void;
}) {
  const [selectedItem, setSelectedItem] = useState<Transaction | null>(null);
  const [viewport, setViewport] = useState({ scrollY: 0, height: 0, top: 0 });
  const listRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const dateGroups = groupByDate(items);
    const result: VirtualTransactionRow[] = [];
    let currentMonth = "";
    let currentDate = "";
    for (const item of items) {
      const month = item.date.slice(0, 7);
      if (month !== currentMonth) {
        currentMonth = month;
        result.push({ type: "month", key: `month-${month}`, month });
        currentDate = "";
      }
      if (item.date !== currentDate) {
        currentDate = item.date;
        result.push({ type: "date", key: `date-${item.date}`, date: item.date, records: dateGroups[item.date] ?? [] });
      }
      result.push({ type: "transaction", key: `transaction-${item.id ?? `${item.date}-${result.length}`}`, item });
    }
    return result;
  }, [items]);

  const offsets = useMemo(() => {
    let offset = 0;
    return rows.map((row) => {
      const top = offset;
      offset += virtualRowHeights[row.type];
      return top;
    });
  }, [rows]);

  const totalHeight = rows.reduce((sum, row) => sum + virtualRowHeights[row.type], 0);
  const visibleTop = Math.max(0, viewport.scrollY - viewport.top - 700);
  const visibleBottom = Math.max(0, viewport.scrollY - viewport.top + viewport.height + 900);
  const visibleRows = rows
    .map((row, index) => ({ row, index, top: offsets[index] }))
    .filter(({ row, top }) => top + virtualRowHeights[row.type] >= visibleTop && top <= visibleBottom);

  useEffect(() => {
    function updateViewport() {
      const rect = listRef.current?.getBoundingClientRect();
      setViewport({
        scrollY: window.scrollY,
        height: window.innerHeight,
        top: rect ? rect.top + window.scrollY : 0,
      });
    }
    updateViewport();
    window.addEventListener("scroll", updateViewport, { passive: true });
    window.addEventListener("resize", updateViewport);
    return () => {
      window.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, [rows.length]);

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
      <div ref={listRef} className="virtual-transaction-list" style={{ height: totalHeight }}>
        {visibleRows.map(({ row, top }) => (
          <div className={`virtual-transaction-row ${row.type}`} key={row.key} style={{ transform: `translateY(${top}px)` }}>
            {row.type === "month" && <div className="virtual-month-title">{formatMonthTitle(row.month)}</div>}
            {row.type === "date" && <DateHeader date={row.date} records={row.records} />}
            {row.type === "transaction" && <VirtualTransactionItem item={row.item} categories={categories} onSelect={selectItem} />}
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
              <span>{selectedItem.type === "transfer" ? "转出账户" : "账户"}</span>
              <strong>{selectedItem.account || defaultAccounts[0]}</strong>
              {selectedItem.type === "transfer" && (
                <>
                  <span>转入账户</span>
                  <strong>{selectedItem.toAccount || "未设置"}</strong>
                </>
              )}
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

function VirtualTransactionItem({
  item,
  categories,
  onSelect,
}: {
  item: Transaction;
  categories: ReturnType<typeof useCategories>;
  onSelect: (transaction: Transaction) => void;
}) {
  const meta = getCategoryMeta(item, categories);
  return (
    <article className="transaction-row clickable timeline-row" onClick={() => onSelect(item)}>
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
          <strong>{item.type === "transfer" ? "转账" : item.category}</strong>
          <span>
            {item.type === "transfer"
              ? [item.account && `${item.account} → ${item.toAccount || ""}`, item.note].filter(Boolean).join(" · ")
              : [item.account, item.note].filter(Boolean).join(" · ") || typeLabel[item.type]}
          </span>
        </div>
        <div className={`row-amount ${item.type}`}>
          {item.type === "expense" ? "-" : item.type === "income" ? "+" : ""}
          {currency.format(item.amount).replace("¥", "")}
        </div>
      </div>
    </article>
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
  const [toAccount, setToAccount] = useState(transaction?.toAccount ?? accountNames.find((item) => item !== (transaction?.account ?? accountNames[0])) ?? accountNames[0]);
  const [date, setDate] = useState(transaction?.date ?? todayInputValue());
  const [note, setNote] = useState(transaction?.note ?? "");

  useEffect(() => {
    if (type === "transfer") return;
    if (!typeCategories.some((item) => item.name === category)) {
      setCategory(typeCategories[0]?.name ?? "");
    }
  }, [type, categories.length, category]);

  useEffect(() => {
    if (!accountNames.includes(account)) {
      setAccount(accountNames[0]);
    }
    if (!accountNames.includes(toAccount)) {
      setToAccount(accountNames.find((item) => item !== accountNames[0]) ?? accountNames[0]);
    }
  }, [accountNames.join("|")]);

  useEffect(() => {
    if (type === "transfer" && account === toAccount) {
      setToAccount(accountNames.find((item) => item !== account) ?? account);
    }
  }, [type, account, toAccount, accountNames.join("|")]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (/[+-]/.test(amount)) {
      calculateAmountInPlace();
      return;
    }
    const value = evaluateAmountExpression(amount);
    if (!value || value <= 0) return;
    if (type !== "transfer" && !category) return;
    if (type === "transfer" && (!account || !toAccount || account === toAccount)) return;
    const now = new Date().toISOString();
    const payload = {
      type,
      amount: Math.round(value * 100) / 100,
      category: type === "transfer" ? "转账" : category,
      account,
      toAccount: type === "transfer" ? toAccount : undefined,
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
        <button type="button" className={type === "transfer" ? "selected" : ""} onClick={() => setType("transfer")}>
          转账
        </button>
      </div>

      {type === "transfer" ? (
        <div className="transfer-account-grid">
          <Picker columns={accountColumns} value={[account]} onConfirm={(value) => setAccount(String(value[0]))}>
            {(_, actions) => (
              <Button className="transfer-account-button" color="primary" fill="solid" onClick={actions.open}>
                转出 {account}
              </Button>
            )}
          </Picker>
          <Picker columns={accountColumns} value={[toAccount]} onConfirm={(value) => setToAccount(String(value[0]))}>
            {(_, actions) => (
              <Button className="transfer-account-button" color="primary" fill="solid" onClick={actions.open}>
                转入 {toAccount}
              </Button>
            )}
          </Picker>
        </div>
      ) : (
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
      )}

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
            {type !== "transfer" && (
              <div className="choice-wrap">
                <Picker columns={accountColumns} value={[account]} onConfirm={(value) => setAccount(String(value[0]))}>
                  {(_, actions) => (
                    <Button className="choice-button" color="primary" fill="solid" onClick={actions.open}>
                      {account}
                    </Button>
                  )}
                </Picker>
              </div>
            )}
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
                      <strong>{item.type === "transfer" ? "转账" : item.category}</strong>
                      <span>
                        {item.type === "transfer"
                          ? [item.account && `${item.account} → ${item.toAccount || ""}`, item.note].filter(Boolean).join(" · ")
                          : [item.account, item.note].filter(Boolean).join(" · ") || typeLabel[item.type]}
                      </span>
                    </div>
                    <div className={`row-amount ${item.type}`}>
                      {item.type === "expense" ? "-" : item.type === "income" ? "+" : ""}
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
              <span>{selectedItem.type === "transfer" ? "转出账户" : "账户"}</span>
              <strong>{selectedItem.account || defaultAccounts[0]}</strong>
              {selectedItem.type === "transfer" && (
                <>
                  <span>转入账户</span>
                  <strong>{selectedItem.toAccount || "未设置"}</strong>
                </>
              )}
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
  if (icon === "transfer") return <ArrowRightLeft {...props} />;
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
  if (transaction.type === "transfer") {
    return { color: "#4776b4", icon: "transfer" };
  }
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
  const accountRecords: Account[] = accounts.length
    ? accounts
    : defaultAccounts.map((name) => ({ name, kind: inferAccountKind(name), createdAt: "" }));
  const rows = accountRecords.map((accountRecord) => {
    const account = accountRecord.name;
    const accountItems = items.filter((item) => transactionBelongsToAccount(item, account));
    const income = sumByType(accountItems.filter((item) => item.type !== "transfer"), "income");
    const expense = sumByType(accountItems.filter((item) => item.type !== "transfer"), "expense");
    const transferIn = accountItems.filter((item) => item.type === "transfer" && item.toAccount === account).reduce((sum, item) => sum + item.amount, 0);
    const transferOut = accountItems.filter((item) => item.type === "transfer" && (item.account || defaultAccounts[0]) === account).reduce((sum, item) => sum + item.amount, 0);
    return {
      account,
      income,
      expense,
      transferIn,
      transferOut,
      balance: income + transferIn - expense - transferOut,
      count: accountItems.length,
      id: accountRecord.id,
      kind: accountKindOf(accountRecord),
    };
  });
  const total = rows.reduce((sum, item) => sum + item.balance, 0);
  const cashTotal = rows.filter((item) => item.kind === "cash").reduce((sum, item) => sum + item.balance, 0);
  const investmentTotal = rows.filter((item) => item.kind === "investment").reduce((sum, item) => sum + item.balance, 0);
  const totalAbsBalance = rows.reduce((sum, item) => sum + Math.abs(item.balance), 0);

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
        </div>
        <div className="asset-list">
          {rows.map((row) => {
            const flowGroups = [
              [
                ["收入", formatAmountPlain(row.income)],
                ["支出", formatAmountPlain(row.expense)],
              ],
              [
                ["转入", formatAmountPlain(row.transferIn)],
                ["转出", formatAmountPlain(row.transferOut)],
              ],
            ];
            return (
              <article
                className="asset-row"
                key={row.account}
                style={{ "--swatch": row.kind === "investment" ? "#4776b4" : "#2f6f5e" } as React.CSSProperties}
              >
                <div className="asset-row-icon">{row.kind === "investment" ? <TrendingUp /> : <Wallet />}</div>
                <div className="asset-row-main">
                  <strong>{row.account}</strong>
                  <span>
                    {accountKindLabel[row.kind]} · {row.count} 笔记录
                  </span>
                </div>
                <div className="asset-row-balance">
                  <strong className={row.balance < 0 ? "negative" : ""}>{currency.format(row.balance)}</strong>
                </div>
                <div className="asset-flow-line">
                  {flowGroups.map((group, index) => (
                    <div className="asset-flow-group" key={index}>
                      {group.map(([label, value]) => (
                        <span key={label}>
                          <em>{label}</em>
                          <strong>{value}</strong>
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="asset-progress" aria-hidden="true">
                  <i style={{ width: `${totalAbsBalance ? Math.max((Math.abs(row.balance) / totalAbsBalance) * 100, 4) : 0}%` }} />
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function StatsView({
  items,
  categories,
  accounts,
  mode,
  month,
  year,
}: {
  items: Transaction[];
  categories: ReturnType<typeof useCategories>;
  accounts: Account[];
  mode: "month" | "year";
  month: string;
  year: string;
}) {
  const accountKindByName = new Map(accounts.map((account) => [account.name, accountKindOf(account)]));
  const nonTransferItems = items.filter((item) => item.type !== "transfer");
  const ordinaryItems = nonTransferItems.filter((item) => (accountKindByName.get(item.account || defaultAccounts[0]) ?? inferAccountKind(item.account || defaultAccounts[0])) !== "investment");
  const investmentItems = nonTransferItems.filter((item) => (accountKindByName.get(item.account || defaultAccounts[0]) ?? inferAccountKind(item.account || defaultAccounts[0])) === "investment");
  const expenseTotal = sumByType(ordinaryItems, "expense");
  const incomeTotal = sumByType(ordinaryItems, "income");
  const investmentExpense = sumByType(investmentItems, "expense");
  const investmentIncome = sumByType(investmentItems, "income");
  const investmentProfit = investmentIncome - investmentExpense;
  const expenseData = buildCategoryStats(ordinaryItems, categories, "expense");
  const incomeData = buildCategoryStats(ordinaryItems, categories, "income");

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
      {investmentItems.length > 0 && (
        <div className="stats-summary investment-stats-summary">
          <div>
            <span>理财支出</span>
            <strong className="expense">{currency.format(investmentExpense)}</strong>
          </div>
          <div>
            <span>理财收入</span>
            <strong>{currency.format(investmentIncome)}</strong>
          </div>
          <div>
            <span>理财盈亏</span>
            <strong className={investmentProfit < 0 ? "expense" : ""}>{currency.format(investmentProfit)}</strong>
          </div>
        </div>
      )}
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

function formatMonthTitle(value: string) {
  const [year, month] = value.split("-");
  if (year === String(new Date().getFullYear())) return `${month}月`;
  return `${year}年${month}月`;
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

function SettingsView({
  categories,
  transactions,
  accounts,
  transferRules,
}: {
  categories: ReturnType<typeof useCategories>;
  transactions: Transaction[];
  accounts: Account[];
  transferRules: TransferRule[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [updateStatus, setUpdateStatus] = useState("");
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
  const [isTransferRulesOpen, setIsTransferRulesOpen] = useState(false);
  const [isCategorySettingsOpen, setIsCategorySettingsOpen] = useState(false);

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
          <h2>管理</h2>
        </div>
        <div className="settings-action-list">
          <button type="button" className="settings-action-button" onClick={() => setIsAccountSettingsOpen(true)}>
            <Wallet size={18} />
            <span>账户设置</span>
            <em>{accounts.length || defaultAccounts.length} 个</em>
          </button>
          <button type="button" className="settings-action-button" onClick={() => setIsTransferRulesOpen(true)}>
            <ArrowRightLeft size={18} />
            <span>周期记账</span>
            <em>{transferRules.length} 条</em>
          </button>
          <button type="button" className="settings-action-button" onClick={() => setIsCategorySettingsOpen(true)}>
            <Tags size={18} />
            <span>分类设置</span>
            <em>{categories.length} 个</em>
          </button>
        </div>
      </div>
      <Popup visible={isAccountSettingsOpen} onMaskClick={() => setIsAccountSettingsOpen(false)} bodyClassName="management-popup">
        <AccountSettingsPanel accounts={accounts} transactions={transactions} transferRules={transferRules} />
      </Popup>
      <Popup visible={isTransferRulesOpen} onMaskClick={() => setIsTransferRulesOpen(false)} bodyClassName="management-popup">
        <RecurringRulesPanel accounts={accounts} categories={categories} transferRules={transferRules} />
      </Popup>
      <Popup visible={isCategorySettingsOpen} onMaskClick={() => setIsCategorySettingsOpen(false)} bodyClassName="management-popup">
        <CategorySettingsPanel categories={categories} transactions={transactions} />
      </Popup>
    </section>
  );
}

function AccountSettingsPanel({
  accounts,
  transactions,
  transferRules,
}: {
  accounts: Account[];
  transactions: Transaction[];
  transferRules: TransferRule[];
}) {
  const [newAccount, setNewAccount] = useState("");
  const [newAccountKind, setNewAccountKind] = useState<AccountKind>("cash");
  const accountRecords: Account[] = accounts.length
    ? accounts
    : defaultAccounts.map((name) => ({ name, kind: inferAccountKind(name), createdAt: "" }));
  const accountNames = accountRecords.map((item) => item.name);

  async function addAccount(event: React.FormEvent) {
    event.preventDefault();
    const name = newAccount.trim();
    if (!name || accountNames.includes(name)) return;
    await db.accounts.add({ name, kind: newAccountKind, createdAt: new Date().toISOString() });
    setNewAccount("");
  }

  async function deleteAccount(id: number | undefined, dependencyCount: number) {
    if (!id || dependencyCount > 0) return;
    await db.accounts.delete(id);
  }

  return (
    <div className="management-panel">
      <div className="popup-title">账户设置</div>
      <form className="asset-add-form" onSubmit={addAccount}>
        <input placeholder="新增资产账户" value={newAccount} onChange={(event) => setNewAccount(event.target.value)} />
        <select value={newAccountKind} onChange={(event) => setNewAccountKind(event.target.value as AccountKind)}>
          <option value="cash">{accountKindLabel.cash}</option>
          <option value="investment">{accountKindLabel.investment}</option>
        </select>
        <button type="submit">添加</button>
      </form>
      <div className="asset-list">
        {accountRecords.map((account) => {
          const usageCount = transactions.filter((item) => transactionBelongsToAccount(item, account.name)).length;
          const ruleCount = transferRules.filter((rule) => (rule.account || rule.fromAccount) === account.name || rule.toAccount === account.name).length;
          const dependencyCount = usageCount + ruleCount;
          return (
            <article className="account-settings-row" key={account.name}>
              <div>
                <strong>{account.name}</strong>
                <span>
                  {usageCount} 笔记录 · {ruleCount} 条规则
                </span>
              </div>
              <div className="asset-actions">
                <select
                  className="asset-kind-select"
                  value={accountKindOf(account)}
                  disabled={!account.id}
                  onChange={(event) => account.id && db.accounts.update(account.id, { kind: event.target.value as AccountKind })}
                >
                  <option value="cash">{accountKindLabel.cash}</option>
                  <option value="investment">{accountKindLabel.investment}</option>
                </select>
                <button type="button" className="asset-delete" disabled={dependencyCount > 0} onClick={() => deleteAccount(account.id, dependencyCount)}>
                  删除
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

const recurringFrequencyLabel: Record<RecurringFrequency, string> = {
  daily: "每天",
  weekday: "工作日",
  weekend: "节假日",
  weekly: "每周",
  monthly: "每月",
  yearly: "每年",
};

function RecurringRulesPanel({
  accounts,
  categories,
  transferRules,
}: {
  accounts: Account[];
  categories: ReturnType<typeof useCategories>;
  transferRules: TransferRule[];
}) {
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  return (
    <div className="management-panel">
      <div className="popup-title">周期记账</div>
      <button type="button" className="secondary-button full-width-button" onClick={() => setIsEditorOpen(true)}>
        新建周期记账
      </button>
      <div className="transfer-rule-list recurring-rule-list">
        {transferRules.length === 0 ? (
          <div className="empty-state compact-empty">暂无周期记账</div>
        ) : (
          transferRules.map((rule) => (
            <article className="transfer-rule-row" key={rule.id}>
              <div>
                <strong>{formatRecurringRuleTitle(rule)}</strong>
                <span>{formatRecurringRuleSummary(rule)}</span>
              </div>
              <div className="asset-actions">
                <button type="button" className="asset-delete" onClick={() => rule.id && db.transferRules.update(rule.id, { enabled: !rule.enabled })}>
                  {rule.enabled ? "停用" : "启用"}
                </button>
                <button type="button" className="asset-delete" onClick={() => rule.id && db.transferRules.delete(rule.id)}>
                  删除
                </button>
              </div>
            </article>
          ))
        )}
      </div>
      <Popup visible={isEditorOpen} onMaskClick={() => setIsEditorOpen(false)} bodyClassName="management-popup recurring-editor-popup">
        <RecurringRuleEditor accounts={accounts} categories={categories} onDone={() => setIsEditorOpen(false)} />
      </Popup>
    </div>
  );
}

function RecurringRuleEditor({
  accounts,
  categories,
  onDone,
}: {
  accounts: Account[];
  categories: ReturnType<typeof useCategories>;
  onDone: () => void;
}) {
  const accountNames = accounts.length ? accounts.map((item) => item.name) : defaultAccounts;
  const [type, setType] = useState<TransactionType>("expense");
  const typeCategories = categories.filter((category) => category.type === type);
  const [category, setCategory] = useState(typeCategories[0]?.name ?? "");
  const [account, setAccount] = useState(accountNames[0] ?? "");
  const [toAccount, setToAccount] = useState(accountNames.find((item) => item !== (accountNames[0] ?? "")) ?? accountNames[0] ?? "");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<RecurringFrequency>("daily");
  const [daysText, setDaysText] = useState("");
  const [startDate, setStartDate] = useState(todayInputValue());
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");
  const categoryColumns = [typeCategories.map((item) => ({ label: item.name, value: item.name }))];
  const accountColumns = [accountNames.map((name) => ({ label: name, value: name }))];
  const frequencyColumns = [Object.entries(recurringFrequencyLabel).map(([value, label]) => ({ label, value }))];
  const startDateValue = new Date(`${startDate}T00:00:00`);
  const endDateValue = new Date(`${endDate || startDate}T00:00:00`);

  useEffect(() => {
    if (type === "transfer") return;
    if (!typeCategories.some((item) => item.name === category)) {
      setCategory(typeCategories[0]?.name ?? "");
    }
  }, [type, categories.length, category]);

  useEffect(() => {
    if (!accountNames.includes(account)) {
      setAccount(accountNames[0] ?? "");
    }
    if (!toAccount || !accountNames.includes(toAccount) || toAccount === account) {
      setToAccount(accountNames.find((name) => name !== (account || accountNames[0] || "")) ?? accountNames[0] ?? "");
    }
  }, [accountNames.join("|"), account, toAccount]);

  async function addRecurringRule(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0 || !account || !startDate) return;
    if (type !== "transfer" && !category) return;
    if (type === "transfer" && (!toAccount || account === toAccount)) return;
    await db.transferRules.add({
      type,
      category: type === "transfer" ? "转账" : category,
      account,
      toAccount: type === "transfer" ? toAccount : undefined,
      amount: Math.round(value * 100) / 100,
      frequency,
      days: parseRecurringDays(frequency, daysText),
      startDate,
      endDate: endDate || undefined,
      note: note.trim() || "周期记账",
      enabled: true,
      createdAt: new Date().toISOString(),
    });
    setAmount("");
    setNote("");
    await applyAutoTransfers();
    onDone();
  }

  return (
    <div className="management-panel">
      <div className="popup-title">新建周期记账</div>
      <form className="recurring-rule-form" onSubmit={addRecurringRule}>
        <div className="recurring-field">
          <span>类型</span>
          <div className="segmented compact-segmented">
            <button type="button" className={type === "expense" ? "selected" : ""} onClick={() => setType("expense")}>
              支出
            </button>
            <button type="button" className={type === "income" ? "selected" : ""} onClick={() => setType("income")}>
              收入
            </button>
            <button type="button" className={type === "transfer" ? "selected" : ""} onClick={() => setType("transfer")}>
              转账
            </button>
          </div>
        </div>
        <label className="recurring-field">
          <span>金额</span>
          <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
        <div className="recurring-choice-grid">
          {type !== "transfer" && (
            <Picker columns={categoryColumns} value={[category]} onConfirm={(value) => setCategory(String(value[0]))}>
              {(_, actions) => (
                <Button className="recurring-choice-button" color="primary" fill="solid" onClick={actions.open}>
                  {category || "选择分类"}
                </Button>
              )}
            </Picker>
          )}
          <Picker columns={accountColumns} value={[account]} onConfirm={(value) => setAccount(String(value[0]))}>
            {(_, actions) => (
              <Button className="recurring-choice-button" color="primary" fill="solid" onClick={actions.open}>
                {type === "transfer" ? `转出 ${account}` : account || "选择账户"}
              </Button>
            )}
          </Picker>
        </div>
        {type === "transfer" && (
          <Picker columns={accountColumns} value={[toAccount]} onConfirm={(value) => setToAccount(String(value[0]))}>
            {(_, actions) => (
              <Button className="recurring-choice-button" color="primary" fill="solid" onClick={actions.open}>
                转入 {toAccount || "选择账户"}
              </Button>
            )}
          </Picker>
        )}
        <div className="recurring-field">
          <span>重复</span>
          <Picker columns={frequencyColumns} value={[frequency]} onConfirm={(value) => setFrequency(value[0] as RecurringFrequency)}>
            {(_, actions) => (
              <Button className="recurring-choice-button" color="primary" fill="solid" onClick={actions.open}>
                {recurringFrequencyLabel[frequency]}
              </Button>
            )}
          </Picker>
        </div>
        {(frequency === "weekly" || frequency === "monthly" || frequency === "yearly") && (
          <label className="recurring-field">
            <span>{frequency === "weekly" ? "周几" : frequency === "monthly" ? "几号" : "日期"}</span>
            <input placeholder={recurringDaysPlaceholder(frequency)} value={daysText} onChange={(event) => setDaysText(event.target.value)} />
          </label>
        )}
        <div className="recurring-date-grid">
          <DatePicker title="开始日期" value={startDateValue} onConfirm={(value) => setStartDate(toDateInputValue(value))}>
            {(_, actions) => (
              <Button className="recurring-choice-button" color="primary" fill="solid" onClick={actions.open}>
                开始 {formatEntryDateLabel(startDate)}
              </Button>
            )}
          </DatePicker>
          <DatePicker title="结束日期" value={endDateValue} onConfirm={(value) => setEndDate(toDateInputValue(value))}>
            {(_, actions) => (
              <Button className="recurring-choice-button" color="primary" fill="solid" onClick={actions.open}>
                {endDate ? `结束 ${formatEntryDateLabel(endDate)}` : "无结束日期"}
              </Button>
            )}
          </DatePicker>
        </div>
        {endDate && (
          <button type="button" className="recurring-clear-button" onClick={() => setEndDate("")}>
            清除结束日期
          </button>
        )}
        <label className="recurring-field">
          <span>备注</span>
          <input placeholder="备注" value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <Button block color="primary" fill="solid" type="submit" className="recurring-submit-button">
          保存
        </Button>
      </form>
    </div>
  );
}

function parseRecurringDays(frequency: RecurringFrequency, value: string) {
  if (frequency === "daily" || frequency === "weekday" || frequency === "weekend") return undefined;
  const values = value
    .split(/[,\s，、]+/)
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item));
  if (frequency === "weekly") return values.filter((item) => item >= 0 && item <= 6);
  if (frequency === "monthly") return values.filter((item) => item >= 1 && item <= 31);
  if (frequency === "yearly") return values.filter((item) => item >= 101 && item <= 1231);
  return undefined;
}

function recurringDaysPlaceholder(frequency: RecurringFrequency) {
  if (frequency === "weekly") return "如 1,3,5；0=周日";
  if (frequency === "monthly") return "如 1,15,28";
  if (frequency === "yearly") return "如 0101,1001";
  return "";
}

function formatRecurringRuleTitle(rule: TransferRule) {
  const type = rule.type || "transfer";
  if (type === "transfer") return `${rule.account || rule.fromAccount || defaultAccounts[0]} → ${rule.toAccount || "未设置"}`;
  return `${typeLabel[type]} · ${rule.category}`;
}

function formatRecurringRuleSummary(rule: TransferRule) {
  const parts = [
    recurringFrequencyLabel[rule.frequency || "daily"],
    formatRecurringDays(rule),
    currency.format(rule.amount),
    `${rule.startDate} 起`,
    rule.endDate ? `${rule.endDate} 止` : "",
    rule.lastRunDate ? `已执行到 ${rule.lastRunDate}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

function formatRecurringDays(rule: TransferRule) {
  if (!rule.days?.length) return "";
  if (rule.frequency === "weekly") return rule.days.map((day) => ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][day] || `周${day}`).join("、");
  if (rule.frequency === "monthly") return rule.days.map((day) => `${day}号`).join("、");
  if (rule.frequency === "yearly") {
    return rule.days
      .map((day) => {
        const text = String(day).padStart(4, "0");
        return `${Number(text.slice(0, 2))}/${Number(text.slice(2, 4))}`;
      })
      .join("、");
  }
  return "";
}

function CategorySettingsPanel({ categories, transactions }: { categories: ReturnType<typeof useCategories>; transactions: Transaction[] }) {
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryType, setNewCategoryType] = useState<TransactionType>("expense");
  const [newCategoryColor, setNewCategoryColor] = useState("#6f7680");
  const [newCategoryIcon, setNewCategoryIcon] = useState("wallet");

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
    <div className="management-panel">
      <div className="popup-title">分类设置</div>
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
              <IconPicker value={category.icon || "wallet"} color={category.color} onChange={(icon) => category.id && db.categories.update(category.id, { icon })} />
              <div>
                <strong>{category.name}</strong>
                <span>
                  {typeLabel[category.type]} · {usageCount} 笔
                </span>
              </div>
              <ColorPicker value={category.color} onChange={(color) => category.id && db.categories.update(category.id, { color })} />
              <button type="button" className="category-delete" onClick={() => category.id && db.categories.delete(category.id)}>
                删除
              </button>
            </div>
          );
        })}
      </div>
    </div>
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
        style={{ backgroundColor: color }}
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
        style={{ backgroundColor: value }}
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
