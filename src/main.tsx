import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  Download,
  Home,
  Plus,
  Settings,
  Trash2,
  Upload,
  Wallet,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { db, exportBackup, importBackup, seedCategories, type BackupPayload, type Transaction, type TransactionType } from "./db";
import { currency, fileSafeStamp, getMonthRange, groupByDate, monthKey, shortDate, sumByType, todayInputValue } from "./utils";
import "./styles.css";

type View = "home" | "assets" | "stats" | "settings";

const typeLabel: Record<TransactionType, string> = {
  expense: "支出",
  income: "收入",
};

const accountOptions = ["现金", "微信", "支付宝", "银行卡"];

function App() {
  const [view, setView] = useState<View>("home");
  const [isEntryOpen, setIsEntryOpen] = useState(false);
  const [isEntryClosing, setIsEntryClosing] = useState(false);
  const isEntryOpenRef = useRef(false);
  const entryHistoryPushedRef = useRef(false);
  const [month, setMonth] = useState(monthKey());
  const categories = useLiveQuery(() => db.categories.orderBy("type").toArray(), [], []);
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
        {view === "home" && <HomeView items={monthItems} goAdd={openEntryPage} />}
        {view === "assets" && <AssetsView items={transactions} />}
        {view === "stats" && <StatsView items={monthItems} categories={categories} month={month} />}
        {view === "settings" && <SettingsView categories={categories} />}
      </section>

      {isEntryOpen && (
        <section className={`entry-page ${isEntryClosing ? "leaving" : ""}`} aria-labelledby="entry-title">
          <div className="entry-page-inner">
            <div className="sheet-title">
              <h2 id="entry-title">记一笔</h2>
              <button onClick={closeEntryPage}>关闭</button>
            </div>
            <EntryForm categories={categories} onDone={closeEntryPage} />
          </div>
        </section>
      )}

      <nav className="bottom-nav">
        <NavButton active={view === "home"} icon={<Home size={20} />} label="首页" onClick={() => setView("home")} />
        <NavButton active={view === "assets"} icon={<Wallet size={20} />} label="资产" onClick={() => setView("assets")} />
        <button className="add-fab" aria-label="记一笔" onClick={openEntryPage}>
          <Plus size={26} />
        </button>
        <NavButton active={view === "stats"} icon={<BarChart3 size={20} />} label="统计" onClick={() => setView("stats")} />
        <NavButton active={view === "settings"} icon={<Settings size={20} />} label="设置" onClick={() => setView("settings")} />
      </nav>
    </main>
  );

  function openEntryPage() {
    if (isEntryOpenRef.current) return;
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

function NavButton(props: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className={`nav-button ${props.active ? "active" : ""}`} onClick={props.onClick}>
      {props.icon}
      <span>{props.label}</span>
    </button>
  );
}

function HomeView({ items, goAdd }: { items: Transaction[]; goAdd: () => void }) {
  const expense = sumByType(items, "expense");
  const income = sumByType(items, "income");

  return (
    <>
      <section className="summary-band">
        <div>
          <span>本月结余</span>
          <strong>{currency.format(income - expense)}</strong>
        </div>
        <button onClick={goAdd}>
          <Plus size={18} />
          记账
        </button>
      </section>
      <section className="metric-grid">
        <Metric icon={<ArrowDownCircle />} label="支出" value={currency.format(expense)} tone="expense" />
        <Metric icon={<ArrowUpCircle />} label="收入" value={currency.format(income)} tone="income" />
      </section>
      <section className="panel">
        <div className="section-title">
          <h2>本月明细</h2>
        </div>
        {items.length === 0 ? <EmptyState /> : <TransactionList items={items} />}
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

function EntryForm({ categories, onDone }: { categories: ReturnType<typeof useCategories>; onDone: () => void }) {
  const [type, setType] = useState<TransactionType>("expense");
  const typeCategories = categories.filter((category) => category.type === type);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(typeCategories[0]?.name ?? "");
  const [account, setAccount] = useState(accountOptions[0]);
  const [date, setDate] = useState(todayInputValue());
  const [note, setNote] = useState("");

  useEffect(() => {
    setCategory(typeCategories[0]?.name ?? "");
  }, [type, categories.length]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0 || !category) return;
    const now = new Date().toISOString();
    await db.transactions.add({
      type,
      amount: Math.round(value * 100) / 100,
      category,
      account,
      note: note.trim(),
      date,
      createdAt: now,
      updatedAt: now,
    });
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
      if (key === ".") {
        return current.includes(".") ? current : `${current || "0"}.`;
      }
      if (current.includes(".") && current.split(".")[1].length >= 2) {
        return current;
      }
      if (current === "0" && key !== ".") {
        return key;
      }
      return `${current}${key}`;
    });
  }

  function preventKeyboardSubmit(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
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
            <span />
            {item.name}
          </button>
        ))}
      </div>

      <div className="entry-bottom">
        <div className="entry-meta-grid">
          <div className="meta-left">
            <label className="field compact-field">
              <span>日期</span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label className="field compact-field">
              <span>账户</span>
              <select value={account} onChange={(event) => setAccount(event.target.value)}>
                {accountOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field note-field">
            <span>备注</span>
            <input placeholder="可选" value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
        </div>
        <label className="field amount-field">
          <span>金额</span>
          <output>{amount || "0.00"}</output>
        </label>
        <div className="number-pad" aria-label="金额数字键盘">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"].map((key) => (
            <button type="button" key={key} onClick={() => pressAmountKey(key)}>
              {key}
            </button>
          ))}
          <button type="button" onClick={() => pressAmountKey("backspace")}>
            退格
          </button>
          <button type="button" className="clear-key" onClick={() => pressAmountKey("clear")}>
            清空
          </button>
        </div>
        <button className="primary-button" type="submit">
          保存
        </button>
      </div>
    </form>
  );
}

function useCategories() {
  return useLiveQuery(() => db.categories.toArray(), [], []) ?? [];
}

function TransactionList({ items, compact = false }: { items: Transaction[]; compact?: boolean }) {
  const groups = groupByDate(items);
  return (
    <div className="transaction-list">
      {Object.entries(groups).map(([date, records]) => (
        <div className="day-group" key={date}>
          {!compact && <h3>{shortDate.format(new Date(date))}</h3>}
          {records.map((item) => (
            <article className="transaction-row" key={item.id}>
              <div className={`type-dot ${item.type}`} />
              <div className="row-main">
                <strong>{item.category}</strong>
                <span>{[item.account, item.note || typeLabel[item.type]].filter(Boolean).join(" · ")}</span>
              </div>
              <div className={`row-amount ${item.type}`}>
                {item.type === "expense" ? "-" : "+"}
                {currency.format(item.amount)}
              </div>
              {!compact && (
                <button className="icon-button danger" aria-label="删除" onClick={() => item.id && db.transactions.delete(item.id)}>
                  <Trash2 size={18} />
                </button>
              )}
            </article>
          ))}
        </div>
      ))}
    </div>
  );
}

function AssetsView({ items }: { items: Transaction[] }) {
  const rows = accountOptions.map((account) => {
    const accountItems = items.filter((item) => (item.account || accountOptions[0]) === account);
    const income = sumByType(accountItems, "income");
    const expense = sumByType(accountItems, "expense");
    return {
      account,
      income,
      expense,
      balance: income - expense,
      count: accountItems.length,
    };
  });
  const total = rows.reduce((sum, item) => sum + item.balance, 0);

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

function SettingsView({ categories }: { categories: ReturnType<typeof useCategories> }) {
  const fileRef = useRef<HTMLInputElement>(null);

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
        <div className="category-list">
          {categories.map((category) => (
            <span key={`${category.type}-${category.name}`} style={{ "--swatch": category.color } as React.CSSProperties}>
              {category.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function EmptyState() {
  return <div className="empty-state">暂无记录</div>;
}

createRoot(document.getElementById("root")!).render(<App />);
