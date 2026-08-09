import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { useLiveQuery } from "dexie-react-hooks";
import { App as CapacitorApp } from "@capacitor/app";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import {
  addSavedQuery,
  isAiConfigured,
  loadAiConfig,
  loadSavedQueries,
  persistSavedQueries,
  saveAiConfig,
  translateToQuery,
  type AiConfig,
  type AiChatTurn,
  type SavedQuery,
} from "./ai";
import { executeQuery, type QueryOutcome } from "./query";
import { Button, CenterPopup, DatePicker, Picker, Popup, TabBar } from "antd-mobile";
import "antd-mobile/bundle/style.css";
import type { Swiper as SwiperClass } from "swiper";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
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
  X,
  ChevronLeft,
  ChevronRight,
  Zap,
} from "lucide-react";
import { Bar, BarChart as RechartsBarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
  type Category,
  type RecurringFrequency,
  type Transaction,
  type TransactionType,
  type TransferRule,
} from "./db";
import { currency, fileSafeStamp, getMonthRange, groupByDate, monthKey, sumByType, todayInputValue } from "./utils";
import {
  downloadLatestCloudflareBackup,
  loadCloudflareBackupConfig,
  saveCloudflareBackupConfig,
  shouldRunAutoCloudflareBackup,
  uploadCloudflareBackup,
  type CloudflareBackupConfig,
} from "./cloudflare";
import {
  downloadLatestWebdavBackup,
  loadWebdavConfig,
  saveWebdavConfig,
  shouldRunAutoWebdavBackup,
  uploadWebdavBackup,
  type WebdavConfig,
} from "./webdav";
import "./styles.css";

// 由 vite.config.ts 在编译期注入（native 构建为 true，网页构建为 false）
declare const __CAPACITOR__: boolean;
declare const __APP_VERSION__: string;

type View = "home" | "assets" | "stats" | "settings";
type StatsMode = "month" | "year" | "all";

const activeHistoryPopupTokens = new Set<symbol>();
const viewOrder: View[] = ["home", "assets", "stats", "settings"];
const homeAccountFiltersStorageKey = "localMoneyHomeAccountFilters";
const themeColorStorageKey = "localMoneyThemeColor";
const defaultThemeColor = "#2f6f5e";
const themeColorOptions = ["#2f6f5e", "#4776b4", "#8b68b8", "#c24b5a", "#c28a2c", "#3a8d8f"];

const typeLabel: Record<TransactionType, string> = {
  expense: "支出",
  income: "收入",
  transfer: "转账",
};

function readHomeAccountFilters() {
  if (typeof window === "undefined") return [];
  try {
    const value = window.localStorage.getItem(homeAccountFiltersStorageKey);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function readThemeColor() {
  if (typeof window === "undefined") return defaultThemeColor;
  return window.localStorage.getItem(themeColorStorageKey) || defaultThemeColor;
}

function cleanupNativeServiceWorker() {
  let cleaned = false;
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => {
      if (registrations.length) {
        cleaned = true;
        return Promise.all(registrations.map((registration) => registration.unregister()));
      }
    })
    .then(() => {
      if (!("caches" in window)) return;
      return caches.keys().then((keys) => {
        if (keys.length) {
          cleaned = true;
          return Promise.all(keys.map((key) => caches.delete(key)));
        }
      });
    })
    .then(() => {
      // 旧 SW 仍可能控制着当前页面，清理成功后刷新一次，让页面脱离 SW 从本地资源重新加载。
      if (cleaned && !window.sessionStorage.getItem("localMoneySwCleanupDone")) {
        window.sessionStorage.setItem("localMoneySwCleanupDone", "1");
        window.location.reload();
      }
    })
    .catch(() => undefined);
}

function applyThemeColor(color: string) {
  document.documentElement.style.setProperty("--theme-primary", color);
  document.documentElement.style.setProperty("--adm-color-primary", color);
}

applyThemeColor(readThemeColor());
if (__CAPACITOR__) {
  // native 构建专属标记：样式里据此给状态栏区域铺不透明背景
  document.body.classList.add("native-shell");
}

function App() {
  const [view, setView] = useState<View>("home");
  const viewRef = useRef<View>("home");
  const swiperRef = useRef<SwiperClass | null>(null);
  const [isEntryOpen, setIsEntryOpen] = useState(false);
  const [isEntryClosing, setIsEntryClosing] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const isEntryOpenRef = useRef(false);
  const entryHistoryPushedRef = useRef(false);
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const isAiChatOpenRef = useRef(false);
  const aiChatHistoryPushedRef = useRef(false);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>(loadSavedQueries);
  const fabLongPressTimerRef = useRef<number | undefined>(undefined);
  const fabSuppressClickRef = useRef(false);
  const autoWebdavBackupStartedRef = useRef(false);
  const autoCloudflareBackupStartedRef = useRef(false);
  const [statsMode, setStatsMode] = useState<StatsMode>("month");
  const [statsMonth, setStatsMonth] = useState(monthKey());
  const [statsYear, setStatsYear] = useState(String(new Date().getFullYear()));
  const [homeAccountFilters, setHomeAccountFilters] = useState<string[]>(readHomeAccountFilters);
  const [themeColor, setThemeColor] = useState(readThemeColor);
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
      if (__CAPACITOR__) {
        // 原生 App 内资源已打包进 APK，不需要 Service Worker，反而会带来旧缓存问题
        cleanupNativeServiceWorker();
      } else {
        navigator.serviceWorker.register("/public-sw.js").catch(() => undefined);
      }
    }
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!__CAPACITOR__) return;
    // 安卓返回键：有应用内状态（弹层/记一笔页/非首页）时回退一页，
    // 让现有 popstate 逻辑处理；在首页且无状态时才退出到桌面。
    CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      const hasAppState =
        isEntryOpenRef.current ||
        isAiChatOpenRef.current ||
        viewRef.current !== "home" ||
        activeHistoryPopupTokens.size > 0;
      if (canGoBack || hasAppState) {
        window.history.back();
      } else {
        // 首页无状态时退到后台而不是销毁 Activity，和按主页键一致，重开不会重新加载
        CapacitorApp.minimizeApp();
      }
    });
  }, []);

  useEffect(() => {
    isEntryOpenRef.current = isEntryOpen;
  }, [isEntryOpen]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    window.localStorage.setItem(homeAccountFiltersStorageKey, JSON.stringify(homeAccountFilters));
  }, [homeAccountFilters]);

  useEffect(() => {
    applyThemeColor(themeColor);
    window.localStorage.setItem(themeColorStorageKey, themeColor);
  }, [themeColor]);

  useEffect(() => {
    if (!isDataReady || autoWebdavBackupStartedRef.current) return;
    const config = loadWebdavConfig();
    if (!shouldRunAutoWebdavBackup(config)) return;
    autoWebdavBackupStartedRef.current = true;
    exportBackup()
      .then((payload) => uploadWebdavBackup(config, payload))
      .then(() => {
        saveWebdavConfig({ ...config, lastAutoBackupDate: todayInputValue() });
      })
      .catch(() => {
        autoWebdavBackupStartedRef.current = false;
      });
  }, [isDataReady]);

  useEffect(() => {
    if (!isDataReady || autoCloudflareBackupStartedRef.current) return;
    const config = loadCloudflareBackupConfig();
    const today = todayInputValue();
    if (!shouldRunAutoCloudflareBackup(config, today)) return;
    autoCloudflareBackupStartedRef.current = true;
    exportBackup()
      .then((payload) => uploadCloudflareBackup(config, payload))
      .then(() => {
        saveCloudflareBackupConfig({ ...config, lastAutoBackupDate: today });
      })
      .catch(() => {
        autoCloudflareBackupStartedRef.current = false;
      });
  }, [isDataReady]);

  useEffect(() => {
    function handlePopState(event: PopStateEvent) {
      const state = event.state && typeof event.state === "object" ? event.state : {};
      if (activeHistoryPopupTokens.size > 0) {
        return;
      }
    if (isEntryOpenRef.current) {
      if (state.localMoneyEntry) return;
      animateEntryClose();
      return;
    }
    if (isAiChatOpenRef.current) {
      if (state.localMoneyAiChat) return;
      isAiChatOpenRef.current = false;
      setIsAiChatOpen(false);
      return;
    }
    const stateView = state.localMoneyView as View | undefined;
      if (stateView) {
        switchView(stateView);
        return;
      }
      if (viewRef.current !== "home") {
        switchView("home");
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
    if (homeAccountFilters.length === 0) return currentMonthItems;
    return currentMonthItems.filter((item) => homeAccountFilters.some((account) => transactionBelongsToAccount(item, account)));
  }, [homeAccountFilters, currentMonthItems]);
  const homeDetailItems = transactions;
  const statsItems = useMemo(() => {
    if (statsMode === "month") {
      const range = getMonthRange(statsMonth);
      return transactions.filter((item) => item.date >= range.start && item.date <= range.end);
    }
    if (statsMode === "all") return transactions;
    return transactions.filter((item) => item.date.startsWith(`${statsYear}-`));
  }, [statsMode, statsMonth, statsYear, transactions]);

  useEffect(() => {
    swiperRef.current?.update();
    swiperRef.current?.updateAutoHeight(0);
  }, [view, isDataReady, homeItems.length, homeDetailItems.length, statsItems.length, accounts.length, categories.length, transferRules.length]);

  useEffect(() => {
    function updateLayout() {
      window.requestAnimationFrame(() => {
        swiperRef.current?.update();
        swiperRef.current?.updateAutoHeight(180);
      });
    }

    window.addEventListener("localMoneyLayoutChange", updateLayout);
    return () => window.removeEventListener("localMoneyLayoutChange", updateLayout);
  }, []);

  return (
    <main className="app-shell">
      <header className={`topbar ${view === "stats" ? "stats-topbar" : ""}`}>
        <div>
          <h1 key={view} className="topbar-title">
            {titleForView(view)}
          </h1>
        </div>
        {view === "home" && isDataReady && (
          <HomeAccountFilterControls
            className="topbar-animated"
            accounts={accounts}
            accountFilters={homeAccountFilters}
            setAccountFilters={setHomeAccountFilters}
          />
        )}
        {view === "stats" && (
          <div className="stats-controls-row">
            <StatsPeriodControls
              className="topbar-animated"
              mode={statsMode}
              setMode={setStatsMode}
              month={statsMonth}
              setMonth={setStatsMonth}
              year={statsYear}
              setYear={setStatsYear}
            />
            <Button className="stats-control-button" color="primary" fill="solid" onClick={() => openAiChat()}>
              AI统计
            </Button>
          </div>
        )}
      </header>

      <section className="content">
        <Swiper
          className="view-swiper"
          autoHeight
          initialSlide={viewOrder.indexOf(view)}
          noSwipingSelector=".adm-popup, .adm-picker, .adm-date-picker, .stats-flow-chart"
          onSwiper={(swiper) => {
            swiperRef.current = swiper;
          }}
          onSlideChange={(swiper) => {
            const nextView = viewOrder[swiper.activeIndex];
            if (nextView && nextView !== viewRef.current) navigateView(nextView);
          }}
        >
          {viewOrder.map((item) => (
            <SwiperSlide key={item}>
              <div className="view-panel">{renderView(item)}</div>
            </SwiperSlide>
          ))}
        </Swiper>
      </section>

      {isEntryOpen && (
        <section className={`entry-page ${isEntryClosing ? "leaving" : ""}`} aria-labelledby="entry-title">
          <div className="entry-page-inner">
            <div className="sheet-title">
              <h2 id="entry-title">{editingTransaction ? "修改一笔" : "记一笔"}</h2>
              <button className="entry-close-button" aria-label="关闭" onClick={closeEntryPage}>
                <X size={22} />
              </button>
            </div>
            {isDataReady ? (
              <EntryForm categories={categories} accounts={accounts} transaction={editingTransaction} onDone={closeEntryPage} />
            ) : (
              <LoadingState />
            )}
          </div>
        </section>
      )}

      {isAiChatOpen && (
        <section className="entry-page ai-chat-page" aria-labelledby="ai-chat-title">
          <div className="ai-chat-header">
            <h2 id="ai-chat-title">AI 查询</h2>
            <button className="entry-close-button" aria-label="关闭" onClick={closeAiChat}>
              <X size={22} />
            </button>
          </div>
          <AiChatView
            transactions={transactions}
            categories={categories}
            accounts={accounts}
            savedQueries={savedQueries}
            onAddSavedQuery={handleAddSavedQuery}
            onDeleteSavedQuery={handleDeleteSavedQuery}
          />
        </section>
      )}

      <nav className="bottom-nav">
        <TabBar className="main-tabbar" activeKey={view} onChange={(key) => navigateView(key as View)}>
          <TabBar.Item key="home" icon={<Home size={20} />} title="首页" />
          <TabBar.Item key="assets" icon={<Wallet size={20} />} title="资产" />
          <TabBar.Item key="stats" icon={<BarChart3 size={20} />} title="统计" />
          <TabBar.Item key="settings" icon={<Settings size={20} />} title="设置" />
        </TabBar>
        <button
          className="add-fab"
          aria-label="记一笔（长按打开 AI 统计）"
          disabled={!isDataReady}
          onClick={() => {
            if (fabSuppressClickRef.current) {
              fabSuppressClickRef.current = false;
              return;
            }
            openEntryPage();
          }}
          onPointerDown={startFabLongPress}
          onPointerUp={clearFabLongPress}
          onPointerLeave={clearFabLongPress}
          onPointerCancel={clearFabLongPress}
          onContextMenu={(event) => event.preventDefault()}
        >
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

  function openAiChat() {
    if (isAiChatOpenRef.current || !isDataReady) return;
    window.history.pushState({ localMoneyAiChat: true }, "", window.location.href);
    aiChatHistoryPushedRef.current = true;
    isAiChatOpenRef.current = true;
    setIsAiChatOpen(true);
  }

  function closeAiChat() {
    const shouldPopHistory = aiChatHistoryPushedRef.current;
    isAiChatOpenRef.current = false;
    aiChatHistoryPushedRef.current = false;
    setIsAiChatOpen(false);
    if (shouldPopHistory) {
      window.history.back();
    }
  }

  function clearFabLongPress() {
    if (fabLongPressTimerRef.current !== undefined) {
      window.clearTimeout(fabLongPressTimerRef.current);
      fabLongPressTimerRef.current = undefined;
    }
  }

  function startFabLongPress() {
    clearFabLongPress();
    fabLongPressTimerRef.current = window.setTimeout(() => {
      fabLongPressTimerRef.current = undefined;
      fabSuppressClickRef.current = true;
      openAiChat();
    }, 500);
  }

  function updateSavedQueries(updater: (current: SavedQuery[]) => SavedQuery[]) {
    setSavedQueries((current) => {
      const next = updater(current);
      persistSavedQueries(next);
      return next;
    });
  }

  function handleAddSavedQuery(name: string, query: string) {
    updateSavedQueries((current) => addSavedQuery(current, name, query));
  }

  function handleDeleteSavedQuery(id: string) {
    updateSavedQueries((current) => current.filter((item) => item.id !== id));
  }

  function navigateView(nextView: View) {
    if (nextView === viewRef.current) return;
    if (nextView === "home") {
      const state = window.history.state && typeof window.history.state === "object" ? { ...window.history.state } : {};
      delete state.localMoneyView;
      window.history.replaceState(state, "", window.location.href);
      switchView("home");
      return;
    }

    const state = window.history.state && typeof window.history.state === "object" ? { ...window.history.state } : {};
    state.localMoneyView = nextView;
    if (viewRef.current === "home") {
      window.history.pushState(state, "", window.location.href);
    } else {
      window.history.replaceState(state, "", window.location.href);
    }
    switchView(nextView);
  }

  function switchView(nextView: View) {
    const currentView = viewRef.current;
    if (nextView === currentView) return;
    viewRef.current = nextView;
    setView(nextView);
    swiperRef.current?.slideTo(viewOrder.indexOf(nextView));
  }

  function renderView(targetView: View) {
    if (!isDataReady) return <LoadingState />;
    if (targetView === "home") {
      return (
        <HomeView
          items={homeItems}
            detailItems={homeDetailItems}
            categories={categories}
            goAdd={() => openEntryPage()}
            goEdit={openEntryPage}
          />
      );
    }
    if (targetView === "assets") return <AssetsView items={transactions} accounts={accounts} />;
    if (targetView === "stats") {
      return (
        <StatsView
          items={statsItems}
          allItems={transactions}
          categories={categories}
          accounts={accounts}
          mode={statsMode}
          month={statsMonth}
          year={statsYear}
          goEdit={openEntryPage}
          savedQueries={savedQueries}
        />
      );
    }
    return <SettingsView categories={categories} transactions={transactions} accounts={accounts} transferRules={transferRules} themeColor={themeColor} setThemeColor={setThemeColor} />;
  }

  function closeEntryPage() {
    const shouldPopHistory = entryHistoryPushedRef.current;
    isEntryOpenRef.current = false;
    animateEntryClose();
    if (shouldPopHistory) {
      entryHistoryPushedRef.current = false;
      window.history.back();
    }
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

type AccountBalanceRow = {
  account: string;
  income: number;
  expense: number;
  transferIn: number;
  transferOut: number;
  balance: number;
  count: number;
  id?: number;
  kind: AccountKind;
};

function buildAccountBalanceRows(items: Transaction[], accounts: Account[]): AccountBalanceRow[] {
  const accountRecords: Account[] = accounts.length
    ? accounts
    : defaultAccounts.map((name) => ({ name, kind: inferAccountKind(name), createdAt: "" }));
  return accountRecords.map((accountRecord) => {
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
}

function defaultAccountForCategory(categories: Pick<Category, "name" | "defaultAccount">[], categoryName: string, accountNames: string[]) {
  const defaultAccount = categories.find((item) => item.name === categoryName)?.defaultAccount;
  return defaultAccount && accountNames.includes(defaultAccount) ? defaultAccount : undefined;
}

function useHistoryBackedPopup(visible: boolean, setVisible: (visible: boolean) => void, stateKey: string) {
  const visibleRef = useRef(visible);
  const pushedRef = useRef(false);
  const popupTokenRef = useRef(Symbol(stateKey));

  useEffect(() => {
    visibleRef.current = visible;
    if (visible) {
      activeHistoryPopupTokens.add(popupTokenRef.current);
    } else {
      activeHistoryPopupTokens.delete(popupTokenRef.current);
    }
    if (visible && !pushedRef.current) {
      const currentState = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
      window.history.pushState({ ...currentState, [stateKey]: true }, "", window.location.href);
      pushedRef.current = true;
    }
    return () => {
      activeHistoryPopupTokens.delete(popupTokenRef.current);
    };
  }, [visible, stateKey]);

  useEffect(() => {
    function handlePopState(event: PopStateEvent) {
      const state = event.state && typeof event.state === "object" ? event.state : {};
      if (visibleRef.current && !state[stateKey]) {
        visibleRef.current = false;
        pushedRef.current = false;
        setVisible(false);
      }
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [setVisible, stateKey]);

  return () => {
    const shouldPopHistory = pushedRef.current;
    visibleRef.current = false;
    pushedRef.current = false;
    setVisible(false);
    if (shouldPopHistory) {
      window.history.back();
      return;
    }
  };
}

type BackedPickerProps = Omit<React.ComponentProps<typeof Picker>, "visible" | "onClose"> & {
  historyKey: string;
};

function BackedPicker({ historyKey, children, ...props }: BackedPickerProps) {
  const [visible, setVisible] = useState(false);
  const close = useHistoryBackedPopup(visible, setVisible, historyKey);

  return (
    <Picker {...props} visible={visible} onClose={close}>
      {children
        ? (items, actions) =>
            children(items, {
              ...actions,
              open: () => setVisible(true),
              close,
              toggle: () => (visible ? close() : setVisible(true)),
            })
        : undefined}
    </Picker>
  );
}

type BackedDatePickerProps = Omit<React.ComponentProps<typeof DatePicker>, "visible" | "onClose"> & {
  historyKey: string;
};

type RecurringRuleDraft = {
  type: TransactionType;
  amount: string;
  category: string;
  account: string;
  toAccount: string;
  startDate: string;
  note: string;
};

type EntryRecurringConfig = {
  frequency: RecurringFrequency;
  days?: number[];
};

type TymeCalendarModule = Pick<typeof import("tyme4ts"), "SolarDay">;

type EntryDateActionPickerProps = {
  label: string;
  value: string;
  onConfirmDate: (value: string) => void;
  onConfirmRecurring: (config: EntryRecurringConfig) => void;
};

function BackedDatePicker({ historyKey, children, ...props }: BackedDatePickerProps) {
  const [visible, setVisible] = useState(false);
  const close = useHistoryBackedPopup(visible, setVisible, historyKey);

  return (
    <DatePicker {...props} visible={visible} onClose={close}>
      {children
        ? (value, actions) =>
            children(value, {
              ...actions,
              open: () => setVisible(true),
              close,
              toggle: () => (visible ? close() : setVisible(true)),
            })
        : undefined}
    </DatePicker>
  );
}

function SingleMonthCalendar({
  value,
  onChange,
  className,
  tyme,
}: {
  value: Date;
  onChange: (value: Date) => void;
  className?: string;
  tyme: TymeCalendarModule | null;
}) {
  const [monthDate, setMonthDate] = useState(() => firstDayOfMonth(value));

  useEffect(() => {
    setMonthDate(firstDayOfMonth(value));
  }, [value.getFullYear(), value.getMonth()]);

  function changeMonth(offset: number) {
    setMonthDate((current) => {
      const next = new Date(current);
      next.setMonth(next.getMonth() + offset);
      return firstDayOfMonth(next);
    });
  }

  return (
    <div className={`single-month-calendar ${className || ""}`.trim()}>
      <div className="single-month-calendar-header">
        <button type="button" aria-label="上个月" onClick={() => changeMonth(-1)}>
          <ChevronLeft size={18} />
        </button>
        <strong>
          {monthDate.getFullYear()}年{monthDate.getMonth() + 1}月
        </strong>
        <button type="button" aria-label="下个月" onClick={() => changeMonth(1)}>
          <ChevronRight size={18} />
        </button>
      </div>
      <CalendarMonthGrid
        monthDate={monthDate}
        selectedDays={isSameMonth(value, monthDate) ? [value.getDate()] : []}
        onToggleDay={(day) => onChange(new Date(monthDate.getFullYear(), monthDate.getMonth(), day))}
        tyme={tyme}
      />
    </div>
  );
}

function YearlyDateCalendar({
  value,
  days,
  onToggleDate,
  tyme,
}: {
  value: Date;
  days: number[];
  onToggleDate: (date: Date) => void;
  tyme: TymeCalendarModule | null;
}) {
  const [monthDate, setMonthDate] = useState(() => firstDayOfMonth(value));
  const selectedDays = days
    .filter((item) => Math.floor(item / 100) === monthDate.getMonth() + 1)
    .map((item) => item % 100);

  function changeMonth(offset: number) {
    setMonthDate((current) => {
      const next = new Date(current);
      next.setMonth(next.getMonth() + offset);
      return firstDayOfMonth(next);
    });
  }

  return (
    <div className="single-month-calendar recurring-yearly-calendar">
      <div className="single-month-calendar-header">
        <button type="button" aria-label="上个月" onClick={() => changeMonth(-1)}>
          <ChevronLeft size={18} />
        </button>
        <strong>{monthDate.getMonth() + 1}月</strong>
        <button type="button" aria-label="下个月" onClick={() => changeMonth(1)}>
          <ChevronRight size={18} />
        </button>
      </div>
      <CalendarMonthGrid monthDate={monthDate} selectedDays={selectedDays} onToggleDay={(day) => onToggleDate(new Date(monthDate.getFullYear(), monthDate.getMonth(), day))} tyme={tyme} />
    </div>
  );
}

function CalendarMonthGrid({
  monthDate,
  selectedDays,
  onToggleDay,
  tyme,
}: {
  monthDate: Date;
  selectedDays: number[];
  onToggleDay: (day: number) => void;
  tyme: TymeCalendarModule | null;
}) {
  const leadingEmptyCells = firstDayOfMonth(monthDate).getDay();
  const daysInMonth = lastDayOfMonth(monthDate).getDate();

  return (
    <>
      <div className="custom-calendar-weekdays">
        {["日", "一", "二", "三", "四", "五", "六"].map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
      <div className="custom-calendar-grid">
        {Array.from({ length: leadingEmptyCells }, (_, index) => (
          <span key={`empty-${index}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const cellInfo = getCalendarCellInfo(monthDate.getFullYear(), monthDate.getMonth() + 1, day, tyme);
          return (
            <button
              type="button"
              key={day}
              className={[selectedDays.includes(day) ? "selected" : "", cellInfo.holidayKind ? `calendar-${cellInfo.holidayKind}` : ""].filter(Boolean).join(" ")}
              onClick={() => onToggleDay(day)}
            >
              <span className="custom-calendar-day">{day}</span>
              <span className="custom-calendar-sub">{cellInfo.label}</span>
              {cellInfo.holidayBadge && <em>{cellInfo.holidayBadge}</em>}
            </button>
          );
        })}
      </div>
    </>
  );
}

function getCalendarCellInfo(year: number, month: number, day: number, tyme: TymeCalendarModule | null) {
  if (!tyme) {
    return {
      label: "",
      holidayBadge: "",
      holidayKind: "",
    };
  }
  const solarDay = tyme.SolarDay.fromYmd(year, month, day);
  const lunarDay = solarDay.getLunarDay();
  const termDay = solarDay.getTermDay();
  const legalHoliday = solarDay.getLegalHoliday();
  const holiday = legalHoliday && !legalHoliday.isWork() ? legalHoliday.getName() : null;
  const festival = [solarDay.getFestival()?.getName(), lunarDay.getFestival()?.getName(), termDay.getDayIndex() === 0 ? termDay.getSolarTerm() : null]
    .filter(Boolean)
    .map(String)[0];
  const lunarLabel = lunarDay.getName() === "初一" ? lunarDay.getLunarMonth().getName() : lunarDay.getName();
  return {
    label: festival || lunarLabel,
    holidayBadge: legalHoliday ? (legalHoliday.isWork() ? "班" : "休") : "",
    holidayKind: legalHoliday ? (legalHoliday.isWork() ? "workday" : "holiday") : "",
  };
}

function MonthlyDayCalendar({
  days,
  onToggleDay,
  tyme,
}: {
  days: number[];
  onToggleDay: (day: number) => void;
  tyme: TymeCalendarModule | null;
}) {
  return (
    <div className="single-month-calendar monthly-day-calendar">
      <div className="single-month-calendar-header monthly-day-calendar-header">
        <strong>每月</strong>
      </div>
      <CalendarMonthGrid monthDate={new Date(2024, 0, 1)} selectedDays={days} onToggleDay={onToggleDay} tyme={tyme} />
    </div>
  );
}

function EntryDateActionPicker({ label, value, onConfirmDate, onConfirmRecurring }: EntryDateActionPickerProps) {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<"date" | "recurring">("date");
  const [frequency, setFrequency] = useState<RecurringFrequency>("daily");
  const [weeklyDays, setWeeklyDays] = useState<number[]>([]);
  const [monthlyDays, setMonthlyDays] = useState<number[]>([]);
  const [yearlyDays, setYearlyDays] = useState<number[]>([]);
  const [calendarTyme, setCalendarTyme] = useState<TymeCalendarModule | null>(null);
  const close = useHistoryBackedPopup(visible, setVisible, "localMoneyEntryDateActionPicker");
  const dateValue = new Date(`${value}T00:00:00`);
  const currentWeekday = dateValue.getDay();
  const currentMonthDay = dateValue.getDate();
  const currentYearDay = toRecurringYearDay(dateValue);

  useEffect(() => {
    if (!visible) return;
    setWeeklyDays((current) => (current.length ? current : [currentWeekday]));
    setMonthlyDays((current) => (current.length ? current : [currentMonthDay]));
    setYearlyDays((current) => (current.length ? current : [currentYearDay]));
  }, [visible, currentWeekday, currentMonthDay, currentYearDay]);

  useEffect(() => {
    if (!visible || calendarTyme) return;
    let isActive = true;
    import("tyme4ts").then((module) => {
      if (isActive) setCalendarTyme({ SolarDay: module.SolarDay });
    });
    return () => {
      isActive = false;
    };
  }, [visible, calendarTyme]);

  function closeAndReset() {
    setMode("date");
    close();
  }

  function toggleNumber(values: number[], valueToToggle: number) {
    return values.includes(valueToToggle) ? values.filter((item) => item !== valueToToggle) : [...values, valueToToggle].sort((a, b) => a - b);
  }

  function recurringConfigForSubmit(): EntryRecurringConfig {
    if (frequency === "weekly") return { frequency, days: weeklyDays.length ? weeklyDays : [currentWeekday] };
    if (frequency === "monthly") return { frequency, days: monthlyDays.length ? monthlyDays : [currentMonthDay] };
    if (frequency === "yearly") return { frequency, days: yearlyDays.length ? yearlyDays : [currentYearDay] };
    return { frequency };
  }

  return (
    <>
      <Button className="choice-button" color="primary" fill="solid" onClick={() => setVisible(true)}>
        {label}
      </Button>
      <CenterPopup
        visible={visible}
        onMaskClick={closeAndReset}
        style={{ "--max-width": "360px", "--min-width": "min(92vw, 360px)", "--border-radius": "16px", "--background-color": "#f7f3ec" } as React.CSSProperties}
      >
        <div className="entry-date-picker-panel">
          <div className="popup-title">{mode === "date" ? "选择日期" : "周期记账"}</div>
          {mode === "date" ? (
            <>
              <SingleMonthCalendar
                value={dateValue}
                tyme={calendarTyme}
                onChange={(next) => {
                  onConfirmDate(toDateInputValue(next));
                  closeAndReset();
                }}
              />
              <Button className="entry-date-recurring-button" color="primary" fill="outline" onClick={() => setMode("recurring")}>
                周期记账
              </Button>
            </>
          ) : (
            <>
              <div className="segmented compact-segmented recurring-quick-segmented">
                {(["daily", "weekday", "weekend", "weekly", "monthly", "yearly"] as RecurringFrequency[]).map((item) => (
                  <button type="button" key={item} className={frequency === item ? "selected" : ""} onClick={() => setFrequency(item)}>
                    {recurringFrequencyLabel[item]}
                  </button>
                ))}
              </div>
              {frequency === "weekly" && (
                <div className="recurring-config-section">
                  <span>每周哪几天</span>
                  <div className="recurring-chip-grid recurring-chip-grid-weekday">
                    {["周日", "周一", "周二", "周三", "周四", "周五", "周六"].map((item, index) => (
                      <button type="button" key={item} className={weeklyDays.includes(index) ? "selected" : ""} onClick={() => setWeeklyDays((current) => toggleNumber(current, index))}>
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {frequency === "monthly" && (
                <div className="recurring-config-section">
                  <span>每月哪几号</span>
                  <MonthlyDayCalendar days={monthlyDays} onToggleDay={(day) => setMonthlyDays((current) => toggleNumber(current, day))} tyme={calendarTyme} />
                </div>
              )}
              {frequency === "yearly" && (
                <div className="recurring-config-section">
                  <span>每年日期</span>
                  <YearlyDateCalendar
                    value={dateValue}
                    days={yearlyDays}
                    tyme={calendarTyme}
                    onToggleDate={(next) => setYearlyDays((current) => toggleNumber(current, toRecurringYearDay(next)))}
                  />
                  <div className="recurring-yearly-summary">{formatRecurringConfigSummary({ frequency, days: yearlyDays.length ? yearlyDays : [currentYearDay] })}</div>
                </div>
              )}
              <div className="recurring-action-row">
                <Button block fill="outline" type="button" className="recurring-cancel-button" onClick={() => setMode("date")}>
                  返回
                </Button>
                <Button
                  block
                  color="primary"
                  fill="solid"
                  type="button"
                  className="recurring-submit-button"
                  onClick={() => {
                    onConfirmRecurring(recurringConfigForSubmit());
                    closeAndReset();
                  }}
                >
                  保存
                </Button>
              </div>
            </>
          )}
        </div>
      </CenterPopup>
    </>
  );
}

function AccountSelectButton({ value, accounts, onChange, className }: { value: string; accounts: string[]; onChange: (value: string) => void; className: string }) {
  function switchToNextAccount() {
    if (!accounts.length) return;
    const currentIndex = accounts.indexOf(value);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % accounts.length : 0;
    onChange(accounts[nextIndex]);
  }

  return (
    <Button className={className} color="primary" fill="solid" onClick={switchToNextAccount}>
      {value || "选择账户"}
    </Button>
  );
}

function TransferAccountSelect({
  label,
  value,
  accounts,
  onChange,
}: {
  label: string;
  value: string;
  accounts: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="transfer-account-select">
      <span>{label}</span>
      <div className="transfer-account-options">
        {accounts.map((account) => (
          <button type="button" key={account} className={value === account ? "selected" : ""} onClick={() => onChange(account)}>
            {account}
          </button>
        ))}
      </div>
    </div>
  );
}

function HomeAccountFilterControls({
  className,
  accounts,
  accountFilters,
  setAccountFilters,
}: {
  className?: string;
  accounts: Account[];
  accountFilters: string[];
  setAccountFilters: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const accountNames = accounts.length ? accounts.map((item) => item.name) : defaultAccounts;

  function toggleAccountFilter(account: string) {
    setAccountFilters((current) => (current.includes(account) ? current.filter((item) => item !== account) : [...current, account]));
  }

  return (
    <div className={`topbar-account-filter ${className ?? ""}`}>
      {accountNames.map((account) => (
        <Button
          className={`stats-control-button account-filter-button ${accountFilters.includes(account) ? "selected" : "unselected"}`}
          color="primary"
          fill="solid"
          key={account}
          onClick={() => toggleAccountFilter(account)}
        >
          {account}
        </Button>
      ))}
    </div>
  );
}

function HomeView({
  items,
  detailItems,
  categories,
  goAdd,
  goEdit,
}: {
  items: Transaction[];
  detailItems: Transaction[];
  categories: ReturnType<typeof useCategories>;
  goAdd: () => void;
  goEdit: (transaction: Transaction) => void;
}) {
  const expense = sumByType(items, "expense");
  const income = sumByType(items, "income");
  const [isAlmanacOpen, setIsAlmanacOpen] = useState(false);

  return (
    <div className="home-view">
      <section className="metric-grid">
        <Metric label="本月支出" value={currency.format(expense)} tone="expense" />
        <Metric label="本月收入" value={currency.format(income)} tone="income" />
      </section>
      <section className="panel detail-panel">
        <TodayAlmanacHeader isOpen={isAlmanacOpen} setIsOpen={setIsAlmanacOpen} />
        {detailItems.length === 0 ? <EmptyState /> : <VirtualTransactionList items={detailItems} categories={categories} goEdit={goEdit} />}
      </section>
    </div>
  );
}

type AiChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  query?: string;
  outcome?: QueryOutcome;
  error?: string;
  saved?: boolean;
  failed?: boolean;
};

function nextChatId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const aiChatHistoryStorageKey = "localMoneyAiChatHistory";
const statsHiddenSavedQueriesStorageKey = "localMoneyStatsHiddenSavedQueries";

function loadHiddenSavedQueryIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(statsHiddenSavedQueriesStorageKey) || "[]") as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
}

function persistHiddenSavedQueryIds(ids: Set<string>) {
  window.localStorage.setItem(statsHiddenSavedQueriesStorageKey, JSON.stringify([...ids]));
}

type StoredChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  query?: string;
  saved?: boolean;
  outcome?: QueryOutcome;
};

function loadChatHistory(): StoredChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(aiChatHistoryStorageKey) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is StoredChatMessage =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as StoredChatMessage).id === "string" &&
        ((item as StoredChatMessage).role === "user" || (item as StoredChatMessage).role === "assistant") &&
        typeof (item as StoredChatMessage).text === "string"
    );
  } catch {
    return [];
  }
}

// 缓存结果时限制体积：列表/分组最多缓存前 10 条，其余结果原样缓存
function cacheOutcome(outcome: QueryOutcome | undefined): QueryOutcome | undefined {
  if (!outcome) return undefined;
  if (outcome.kind === "list") {
    return { kind: "list", items: outcome.items.slice(0, 10), total: outcome.items.length };
  }
  if (outcome.kind === "group") {
    return { kind: "group", groups: outcome.groups.slice(0, 10) };
  }
  return outcome;
}

function buildChatHistory(messages: AiChatMessage[]): AiChatTurn[] {
  const history: AiChatTurn[] = [];
  for (const message of messages.slice(-19)) {
    if (message.role === "user") {
      history.push({ role: "user", content: message.text });
    } else if (message.query) {
      history.push({ role: "assistant", content: `查询：${message.query}` });
    }
  }
  return history;
}

function AiChatView({
  transactions,
  categories,
  accounts,
  savedQueries,
  onAddSavedQuery,
  onDeleteSavedQuery,
}: {
  transactions: Transaction[];
  categories: ReturnType<typeof useCategories>;
  accounts: Account[];
  savedQueries: SavedQuery[];
  onAddSavedQuery: (name: string, query: string) => void;
  onDeleteSavedQuery: (id: string) => void;
}) {
  // 只恢复对话文本与 DSL，不重跑查询
  const [messages, setMessages] = useState<AiChatMessage[]>(() => loadChatHistory());
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [savingForId, setSavingForId] = useState<string | null>(null);
  const [savingName, setSavingName] = useState("");
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [copiedQueryId, setCopiedQueryId] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<number | undefined>(undefined);
  const suppressClickRef = useRef(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const categoryNames = categories.map((item) => item.name);
  const accountNames = accounts.length ? accounts.map((item) => item.name) : defaultAccounts;

  function scrollToBottom() {
    const container = messagesRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  // 打开弹窗时滚到最新消息；新消息/加载中状态变化时也自动滚到底部
  useEffect(() => {
    const frame = window.requestAnimationFrame(scrollToBottom);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending]);

  function runQuery(query: string): { outcome?: QueryOutcome; error?: string } {
    const result = executeQuery(query, transactions, categoryNames);
    if ("error" in result) return { error: result.error };
    return { outcome: result.outcome };
  }

  useEffect(() => {
    const stored = messages.map(({ id, role, text, query, saved, outcome }) => ({
      id,
      role,
      text,
      query,
      saved,
      outcome: cacheOutcome(outcome),
    }));
    window.localStorage.setItem(aiChatHistoryStorageKey, JSON.stringify(stored.slice(-100)));
  }, [messages]);

  function clearLongPress() {
    if (longPressTimerRef.current !== undefined) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = undefined;
    }
  }

  function startLongPress(messageId: string) {
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = undefined;
      suppressClickRef.current = true;
      setSelectedIds((current) => {
        const next = new Set(current);
        next.add(messageId);
        return next;
      });
    }, 500);
  }

  function handleMessageClick(messageId: string) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (selectedIds.size === 0) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }

  function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`删除选中的 ${selectedIds.size} 条消息？`)) return;
    setMessages((current) => current.filter((item) => !selectedIds.has(item.id)));
    setSelectedIds(new Set());
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  useEffect(() => () => clearLongPress(), []);

  function appendMessage(message: AiChatMessage) {
    setMessages((current) => [...current, message]);
  }

  async function handleSend() {
    const question = input.trim();
    if (!question || isSending) return;
    const config = loadAiConfig();
    if (!isAiConfigured(config)) {
      appendMessage({
        id: nextChatId(),
        role: "assistant",
        text: "请先在「设置 → AI 查询」里配置 API 地址、密钥和模型。",
      });
      return;
    }
    setInput("");
    setIsSending(true);
    appendMessage({ id: nextChatId(), role: "user", text: question });
    try {
      const history = buildChatHistory(messages);
      const { query, empty } = await translateToQuery(config, question, categoryNames, accountNames, history);
      if (empty) {
        appendMessage({
          id: nextChatId(),
          role: "assistant",
          text: "（AI 没有返回有效内容，请重试或检查 AI 配置）",
          failed: true,
        });
        return;
      }
      if (!query) {
        appendMessage({
          id: nextChatId(),
          role: "assistant",
          text: "我只支持查询类问题，例如：这个月餐饮花了多少、最近一年月均水电费。",
        });
        return;
      }
      const { outcome, error } = runQuery(query);
      appendMessage({
        id: nextChatId(),
        role: "assistant",
        text: error ? `（查询解析失败：${error}）` : "",
        query: error ? undefined : query,
        outcome: error ? undefined : outcome,
        failed: error ? true : undefined,
      });
    } catch (error) {
      appendMessage({
        id: nextChatId(),
        role: "assistant",
        text: error instanceof Error ? error.message : "请求失败，请检查 AI 配置",
        failed: true,
      });
    } finally {
      setIsSending(false);
    }
  }

  function handleRunSaved(saved: SavedQuery) {
    const { outcome, error } = runQuery(saved.query);
    appendMessage({
      id: nextChatId(),
      role: "assistant",
      text: error ? `调用收藏「${saved.name}」失败：${error}` : `调用收藏「${saved.name}」`,
      query: error ? undefined : saved.query,
      outcome: error ? undefined : outcome,
    });
  }

  async function handleRetry(failedId: string) {
    if (retryingId) return;
    const failedIndex = messages.findIndex((message) => message.id === failedId);
    if (failedIndex < 0) return;
    let question = "";
    let userCount = 0;
    const history: AiChatTurn[] = [];
    for (let index = failedIndex - 1; index >= 0; index--) {
      const message = messages[index];
      if (message.role !== "user") continue;
      if (userCount === 0) {
        question = message.text;
      } else if (userCount <= 2) {
        history.unshift({ role: "user", content: message.text });
      } else {
        break;
      }
      userCount++;
    }
    if (!question) return;
    const config = loadAiConfig();
    if (!isAiConfigured(config)) {
      appendMessage({
        id: nextChatId(),
        role: "assistant",
        text: "请先在「设置 → AI 查询」里配置 API 地址、密钥和模型。",
      });
      return;
    }
    setRetryingId(failedId);
    try {
      const { query, empty } = await translateToQuery(config, question, categoryNames, accountNames, history);
      if (empty) {
        appendMessage({
          id: nextChatId(),
          role: "assistant",
          text: "（AI 没有返回有效内容，请重试或检查 AI 配置）",
          failed: true,
        });
        return;
      }
      if (!query) {
        appendMessage({
          id: nextChatId(),
          role: "assistant",
          text: "我只支持查询类问题，例如：这个月餐饮花了多少、最近一年月均水电费。",
        });
        return;
      }
      const { outcome, error } = runQuery(query);
      appendMessage({
        id: nextChatId(),
        role: "assistant",
        text: error ? `（查询解析失败：${error}）` : "",
        query: error ? undefined : query,
        outcome: error ? undefined : outcome,
        failed: error ? true : undefined,
      });
    } catch (error) {
      appendMessage({
        id: nextChatId(),
        role: "assistant",
        text: error instanceof Error ? error.message : "请求失败，请检查 AI 配置",
        failed: true,
      });
    } finally {
      setRetryingId(null);
    }
  }

  async function copyQuery(messageId: string, query: string) {
    try {
      await navigator.clipboard.writeText(query);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = query;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopiedQueryId(messageId);
    window.setTimeout(() => setCopiedQueryId((current) => (current === messageId ? null : current)), 1500);
  }

  function handleSaveQuery(messageId: string, query: string) {
    const name = savingName.trim();
    if (!name) return;
    onAddSavedQuery(name, query);
    setSavingForId(null);
    setSavingName("");
    setMessages((current) => current.map((item) => (item.id === messageId ? { ...item, saved: true } : item)));
  }

  function handleDeleteSaved(id: string) {
    onDeleteSavedQuery(id);
  }

  return (
    <div className="ai-chat-view">
      {savedQueries.length > 0 && (
        <div className="saved-queries">
          <div className="saved-queries-title">收藏的查询</div>
          <div className="saved-query-list">
            {savedQueries.map((item) => (
              <div className="saved-query-chip" key={item.id}>
                <button className="saved-query-run" onClick={() => handleRunSaved(item)}>
                  {item.name}
                </button>
                <button className="saved-query-delete" aria-label="删除" onClick={() => handleDeleteSaved(item.id)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="ai-messages" ref={messagesRef}>
        {messages.length === 0 && <div className="ai-empty">用自然语言问，例如：这个月吃饭花了多少？</div>}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`ai-message ai-message-${message.role} ${selectedIds.has(message.id) ? "ai-message-selected" : ""}`}
            onClick={() => handleMessageClick(message.id)}
            onPointerDown={() => {
              if (savingForId !== message.id) startLongPress(message.id);
            }}
            onPointerUp={clearLongPress}
            onPointerLeave={clearLongPress}
            onPointerCancel={clearLongPress}
            onContextMenu={(event) => event.preventDefault()}
          >
            {message.text && <div className="ai-message-text">{message.text}</div>}
            {message.query && (
              <div className="ai-query-block">
                <code>{message.query}</code>
                <button className="ai-copy-query" onClick={() => copyQuery(message.id, message.query!)}>
                  {copiedQueryId === message.id ? "已复制" : "复制"}
                </button>
                {!message.saved && (
                  <button
                    className="ai-save-query"
                    onClick={() => {
                      setSavingForId(message.id);
                      setSavingName("");
                    }}
                  >
                    收藏
                  </button>
                )}
              </div>
            )}
            {savingForId === message.id && !message.saved && message.query && (
              <div className="ai-save-form">
                <input
                  value={savingName}
                  placeholder="给这个查询起个名字"
                  onChange={(event) => setSavingName(event.target.value)}
                />
                <button onClick={() => handleSaveQuery(message.id, message.query!)}>保存</button>
              </div>
            )}
            {message.outcome && <AiOutcomeView outcome={message.outcome} />}
            {message.failed && (
              <div className="ai-retry-row">
                <button disabled={retryingId !== null} onClick={() => void handleRetry(message.id)}>
                  {retryingId === message.id ? "正在重试..." : "重试"}
                </button>
              </div>
            )}
          </div>
        ))}
        {isSending && <div className="ai-message ai-message-assistant ai-thinking">正在查询...</div>}
      </div>
      {selectedIds.size > 0 && (
        <div className="ai-select-toolbar">
          <span>已选 {selectedIds.size} 条</span>
          <button onClick={handleDeleteSelected}>删除</button>
          <button onClick={clearSelection}>取消</button>
        </div>
      )}
      <div className="ai-input-row">
        <input
          value={input}
          placeholder="用自然语言问，比如：上个月交通花了多少"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void handleSend();
          }}
        />
        <button disabled={isSending || !input.trim()} onClick={() => void handleSend()}>
          发送
        </button>
      </div>
    </div>
  );
}

function AiOutcomeView({ outcome }: { outcome: QueryOutcome }) {
  if (outcome.kind === "list") {
    const expense = sumByType(outcome.items as Transaction[], "expense");
    const income = sumByType(outcome.items as Transaction[], "income");
    return (
      <div className="ai-result-list">
        <div className="ai-result-summary">
          共 {outcome.total ?? outcome.items.length} 笔 · 支出 {currency.format(expense)} · 收入 {currency.format(income)}
        </div>
        {outcome.items.slice(0, 30).map((item, index) => (
          <div className="ai-result-row" key={`${(item as Transaction).id ?? ""}-${index}`}>
            <span className="ai-result-date">{item.date}</span>
            <span className="ai-result-category">{item.category}</span>
            <span className="ai-result-note">{item.note || ""}</span>
            <span
              className={`ai-result-amount ${item.type === "expense" ? "amount-expense" : item.type === "income" ? "amount-income" : ""}`}
            >
              {item.type === "income" ? "+" : item.type === "expense" ? "-" : ""}
              {currency.format(item.amount)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (outcome.kind === "extreme") {
    if (!outcome.transaction) return <div className="ai-outcome-empty">没有符合条件的记录</div>;
    const item = outcome.transaction as Transaction;
    return (
      <div className="ai-outcome-card">
        <div className="ai-result-row">
          <span className="ai-result-date">{item.date}</span>
          <span className="ai-result-category">{item.category}</span>
          <span className="ai-result-note">{item.note || ""}</span>
          <span className="ai-result-amount amount-expense">{currency.format(item.amount)}</span>
        </div>
      </div>
    );
  }

  if (outcome.kind === "sum" || outcome.kind === "average") {
    return (
      <div className="ai-outcome-big">
        {currency.format(outcome.amount)}
        <span>
          {outcome.kind === "sum" ? "合计" : "平均"} · 共 {outcome.count} 笔
        </span>
      </div>
    );
  }

  if (outcome.kind === "arithmetic") {
    return (
      <div className="ai-outcome-big">
        {currency.format(outcome.value)}
      </div>
    );
  }

  if (outcome.kind === "count") {
    return (
      <div className="ai-outcome-big">
        {outcome.count}
        <span>共 {outcome.count} 笔</span>
      </div>
    );
  }

  if (outcome.kind === "top-month") {
    if (!outcome.key) return <div className="ai-outcome-empty">没有符合条件的记录</div>;
    return (
      <div className="ai-outcome-big">
        {outcome.key}
        <span>
          合计 {currency.format(outcome.amount)} · {outcome.count} 笔
        </span>
      </div>
    );
  }

  if (outcome.groups.length === 0) return <div className="ai-outcome-empty">没有符合条件的记录</div>;
  return (
    <div className="ai-result-list">
      {outcome.groups.map((group, index) => (
        <div className={`ai-group-row ${index === 0 ? "ai-group-top" : ""}`} key={group.key}>
          <span className="ai-result-category">{group.key}</span>
          <span className="ai-result-note">{group.count} 笔</span>
          <span className="ai-result-amount">{currency.format(group.amount)}</span>
        </div>
      ))}
    </div>
  );
}

function savedQueryOutcomeSummary(outcome: QueryOutcome): string {
  switch (outcome.kind) {
    case "list": {
      const expense = sumByType(outcome.items as Transaction[], "expense");
      const income = sumByType(outcome.items as Transaction[], "income");
      const parts = [`${outcome.total ?? outcome.items.length} 笔`];
      if (expense) parts.push(`支出${currency.format(expense)}`);
      if (income) parts.push(`收入${currency.format(income)}`);
      return parts.join(" · ");
    }
    case "extreme":
      return outcome.transaction ? currency.format(outcome.transaction.amount) : "无记录";
    case "sum":
      return currency.format(outcome.amount);
    case "arithmetic":
      return currency.format(outcome.value);
    case "average":
      return `平均 ${currency.format(outcome.amount)}`;
    case "count":
      return `${outcome.count} 笔`;
    case "group": {
      const top = outcome.groups[0];
      return top ? `${outcome.groups.length} 组 · 最高 ${top.key}` : "无记录";
    }
    case "top-month":
      return outcome.key ? `${outcome.key} · ${currency.format(outcome.amount)}` : "无记录";
  }
}

type TodayAlmanac = {
  solar: string;
  weekday: string;
  lunar: string;
  festival: string;
  nextHoliday: string;
  pillars: string[];
  recommends: string;
  avoids: string;
};

function TodayAlmanacHeader({
  isOpen,
  setIsOpen,
}: {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const [info, setInfo] = useState<TodayAlmanac>(() => buildFallbackTodayAlmanac());
  const latestAlmanacKeyRef = useRef(almanacRefreshKey());

  useEffect(() => {
    window.requestAnimationFrame(() => window.dispatchEvent(new Event("localMoneyLayoutChange")));
  }, [isOpen]);

  useEffect(() => {
    let isActive = true;
    let refreshTimer: number | undefined;

    async function loadAlmanac() {
      try {
        const { LegalHoliday, SolarDay } = await import("tyme4ts");
        const now = new Date();
        const solarDay = SolarDay.fromYmd(now.getFullYear(), now.getMonth() + 1, now.getDate());
        const lunarDay = solarDay.getLunarDay();
        const termDay = solarDay.getTermDay();
        const pillars = String(lunarDay.getThreePillars()).split(" ");
        const currentHour = lunarDay.getHours()[now.getHours() === 23 ? 12 : Math.floor((now.getHours() + 1) / 2)];
        const hourPillar = currentHour ? String(currentHour.getSixtyCycle()) : "";
        const festival = [
          solarDay.getFestival()?.getName(),
          lunarDay.getFestival()?.getName(),
          termDay.getDayIndex() === 0 ? termDay.getSolarTerm() : null,
        ]
          .filter(Boolean)
          .map(String)
          .join("、");
        if (!isActive) return;
        setInfo({
          solar: formatTodaySolar(now),
          weekday: new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(now),
          lunar: `${lunarDay.getLunarMonth().getName()}${lunarDay.getName()}`,
          festival,
          nextHoliday: findNextLegalHolidayLabel(now, LegalHoliday),
          pillars: [...pillars, hourPillar].filter(Boolean),
          recommends: lunarDay.getRecommends().map(String).join(" "),
          avoids: lunarDay.getAvoids().map(String).join(" "),
        });
        latestAlmanacKeyRef.current = almanacRefreshKey(now);
      } catch {
        if (isActive) setInfo(buildFallbackTodayAlmanac());
      }
    }

    function startForegroundRefreshTimer() {
      window.clearInterval(refreshTimer);
      refreshTimer = window.setInterval(() => {
        refreshIfAlmanacStale();
      }, 60 * 1000);
    }

    function refreshIfAlmanacStale() {
      if (document.visibilityState === "hidden") return;
      if (latestAlmanacKeyRef.current !== almanacRefreshKey()) {
        loadAlmanac();
      }
      startForegroundRefreshTimer();
    }

    loadAlmanac();
    startForegroundRefreshTimer();
    document.addEventListener("visibilitychange", refreshIfAlmanacStale);
    window.addEventListener("focus", refreshIfAlmanacStale);
    window.addEventListener("pageshow", refreshIfAlmanacStale);
    return () => {
      isActive = false;
      window.clearInterval(refreshTimer);
      document.removeEventListener("visibilitychange", refreshIfAlmanacStale);
      window.removeEventListener("focus", refreshIfAlmanacStale);
      window.removeEventListener("pageshow", refreshIfAlmanacStale);
    };
  }, []);

  return (
    <section className={`today-almanac ${isOpen ? "open" : ""}`}>
      <button type="button" className="today-almanac-trigger" onClick={() => setIsOpen((current) => !current)}>
        <div>
          <h2>{info.solar}</h2>
          <span>{info.weekday}</span>
        </div>
        <p>{[!isOpen ? info.lunar : "", info.festival, info.nextHoliday].filter(Boolean).join(" · ")}</p>
      </button>
      <div className="huangli-collapse" aria-hidden={!isOpen}>
        <div className="huangli-widget">
          <div>
            <i>{info.lunar}</i>
            <ul>
              <li>年</li>
              <li>月</li>
              <li>日</li>
              <li>时</li>
            </ul>
            <ol>
              {info.pillars.map((pillar, index) => (
                <li key={`${index}-stem`}>{pillar.slice(0, 1)}</li>
              ))}
              {info.pillars.map((pillar, index) => (
                <li key={`${index}-branch`}>{pillar.slice(1, 2)}</li>
              ))}
            </ol>
            <b>{info.recommends || "无"}</b>
            <p>{info.avoids || "无"}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function buildFallbackTodayAlmanac(): TodayAlmanac {
  const now = new Date();
  return {
    solar: formatTodaySolar(now),
    weekday: new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(now),
    lunar: "正在加载农历",
    festival: "",
    nextHoliday: "",
    pillars: ["", "", "", ""],
    recommends: "正在加载",
    avoids: "正在加载",
  };
}

function findNextLegalHolidayLabel(now: Date, LegalHoliday: typeof import("tyme4ts").LegalHoliday) {
  const todayHoliday = LegalHoliday.fromYmd(now.getFullYear(), now.getMonth() + 1, now.getDate());
  if (todayHoliday && !todayHoliday.isWork()) return "";

  for (let offset = 1; offset <= 370; offset += 1) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    const holiday = LegalHoliday.fromYmd(candidate.getFullYear(), candidate.getMonth() + 1, candidate.getDate());
    if (holiday && !holiday.isWork()) {
      return `距${holiday.getName()} ${offset}天`;
    }
  }
  return "";
}

function formatTodaySolar(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
  }).format(date);
}

type VirtualTransactionRow =
  | { type: "month"; key: string; month: string }
  | { type: "date"; key: string; date: string; records: Transaction[] }
  | { type: "transaction"; key: string; item: Transaction };

const baseVirtualRowHeights: Record<VirtualTransactionRow["type"], number> = {
  month: 42,
  date: 58,
  transaction: 96,
};

function getTransactionRowHeight() {
  if (typeof window === "undefined") return baseVirtualRowHeights.transaction;
  if (window.innerWidth <= 430) return 86;
  if (window.innerWidth <= 520) return 92;
  return baseVirtualRowHeights.transaction;
}

function useTransactionRowHeight() {
  const [height, setHeight] = useState(getTransactionRowHeight);

  useEffect(() => {
    function updateHeight() {
      setHeight(getTransactionRowHeight());
    }

    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  return height;
}

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
  const closeSelectedItem = useHistoryBackedPopup(Boolean(selectedItem), (visible) => {
    if (!visible) setSelectedItem(null);
  }, "localMoneyVirtualTransactionDetail");
  const [viewport, setViewport] = useState({ scrollY: 0, height: 0, top: 0 });
  const listRef = useRef<HTMLDivElement>(null);
  const transactionRowHeight = useTransactionRowHeight();
  const virtualRowHeights = useMemo(
    () => ({
      ...baseVirtualRowHeights,
      transaction: transactionRowHeight,
    }),
    [transactionRowHeight],
  );

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
  }, [rows, virtualRowHeights]);

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
    closeSelectedItem();
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
      {selectedItem?.id &&
        createPortal(
          <div className="detail-overlay" role="presentation">
            <button className="detail-backdrop" aria-label="关闭详情" onClick={closeSelectedItem} />
            <section className="detail-card floating" role="dialog" aria-modal="true" aria-label="账单详情">
              <div className="detail-grid">
                <span>类型</span>
                <strong>{typeLabel[selectedItem.type]}</strong>
                <span>金额</span>
                <strong className="amount-value">{currency.format(selectedItem.amount)}</strong>
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
                    closeSelectedItem();
                    window.setTimeout(() => goEdit(item), 80);
                  }}
                >
                  修改
                </button>
              </div>
            </section>
          </div>,
          document.body,
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
      <div className="timeline-stamp">
        <time>{formatRecordTime(item)}</time>
      </div>
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
  const initialCategory = transaction?.category ?? typeCategories[0]?.name ?? "";
  const initialDefaultAccount = defaultAccountForCategory(typeCategories, initialCategory, accountNames);
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : "");
  const [category, setCategory] = useState(initialCategory);
  const [account, setAccount] = useState(transaction?.account ?? initialDefaultAccount ?? accountNames[0]);
  const [toAccount, setToAccount] = useState(transaction?.toAccount ?? accountNames.find((item) => item !== (transaction?.account ?? accountNames[0])) ?? accountNames[0]);
  const [date, setDate] = useState(transaction?.date ?? todayInputValue());
  const [note, setNote] = useState(transaction?.note ?? "");
  const [entryRecurringConfig, setEntryRecurringConfig] = useState<EntryRecurringConfig | null>(null);

  useEffect(() => {
    if (type === "transfer") return;
    if (!typeCategories.some((item) => item.name === category)) {
      selectCategory(typeCategories[0]?.name ?? "", typeCategories);
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
    if (entryRecurringConfig) {
      const saved = await createRecurringRuleFromEntryDraft({
        type,
        amount,
        category,
        account,
        toAccount,
        date,
        note,
        frequency: entryRecurringConfig.frequency,
        days: entryRecurringConfig.days,
      });
      if (saved) onDone();
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
    onDone();
  }

  function selectCategory(name: string, sourceCategories = typeCategories) {
    setCategory(name);
    const nextDefaultAccount = defaultAccountForCategory(sourceCategories, name, accountNames);
    if (nextDefaultAccount) {
      setAccount(nextDefaultAccount);
    }
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
      const target = event.target;
      if (target instanceof HTMLInputElement && target.name === "note" && evaluateAmountExpression(amount) > 0) {
        return;
      }
      event.preventDefault();
    }
  }

  const entryRecurringSummary = entryRecurringConfig ? formatRecurringConfigSummary(entryRecurringConfig) : "";
  const dateLabel = entryRecurringSummary || formatEntryDateLabel(date);
  const dateValue = new Date(`${date}T00:00:00`);
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
          <TransferAccountSelect
            label="转出"
            value={account}
            accounts={accountNames}
            onChange={setAccount}
          />
          <TransferAccountSelect
            label="转入"
            value={toAccount}
            accounts={accountNames}
            onChange={setToAccount}
          />
        </div>
      ) : (
        <div className="category-grid">
          {typeCategories.map((item) => (
            <button
              type="button"
              key={`${item.type}-${item.name}`}
              className={category === item.name ? "selected" : ""}
              onClick={() => selectCategory(item.name)}
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
              <EntryDateActionPicker
                label={dateLabel}
                value={date}
                onConfirmDate={(nextDate) => {
                  setDate(nextDate);
                  setEntryRecurringConfig(null);
                }}
                onConfirmRecurring={setEntryRecurringConfig}
              />
            </div>
            {type !== "transfer" && (
              <div className="choice-wrap">
                <AccountSelectButton
                  value={account}
                  accounts={accountNames}
                  onChange={setAccount}
                  className="choice-button"
                />
              </div>
            )}
          </div>
          <label className="field note-field">
            <input name="note" placeholder="备注" value={note} onChange={(event) => setNote(event.target.value)} />
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
          <button type="button" className="clear-key" onClick={() => pressAmountKey("clear")}>
            清空
          </button>
          <button type="button" onClick={() => pressAmountKey("0")}>
            0
          </button>
          <button type="button" onClick={() => pressAmountKey(".")}>
            .
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

async function createRecurringRuleFromEntryDraft(draft: {
  type: TransactionType;
  amount: string;
  category: string;
  account: string;
  toAccount: string;
  date: string;
  note: string;
  frequency: RecurringFrequency;
  days?: number[];
}) {
  const value = evaluateAmountExpression(draft.amount);
  const today = todayInputValue();
  if (!value || value <= 0 || !draft.account || !draft.date) return false;
  if (draft.type !== "transfer" && !draft.category) return false;
  if (draft.type === "transfer" && (!draft.toAccount || draft.account === draft.toAccount)) return false;
  await db.transferRules.add({
    type: draft.type,
    category: draft.type === "transfer" ? "转账" : draft.category,
    account: draft.account,
    toAccount: draft.type === "transfer" ? draft.toAccount : undefined,
    amount: Math.round(value * 100) / 100,
    frequency: draft.frequency,
    days: draft.days?.length ? draft.days : undefined,
    startDate: draft.date,
    lastRunDate: draft.date <= today ? today : undefined,
    note: draft.note.trim() || "周期记账",
    enabled: true,
    createdAt: new Date().toISOString(),
  });
  await applyAutoTransfers();
  return true;
}

function toDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function firstDayOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function lastDayOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0);
}

function isSameMonth(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
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

function toRecurringYearDay(value: Date) {
  return Number(`${String(value.getMonth() + 1).padStart(2, "0")}${String(value.getDate()).padStart(2, "0")}`);
}

function formatRecurringConfigSummary(config: EntryRecurringConfig) {
  const rule = {
    frequency: config.frequency,
    days: config.days,
  } as TransferRule;
  const dayText = formatRecurringDays(rule);
  return [recurringFrequencyLabel[config.frequency], dayText].filter(Boolean).join(" ");
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
  const closeSelectedItem = useHistoryBackedPopup(Boolean(selectedItem), (visible) => {
    if (!visible) setSelectedItem(null);
  }, "localMoneyTransactionDetail");
  const groups = groupByDate(items);

  function selectItem(item: Transaction) {
    if (!item.id) return;
    setSelectedItem(item);
  }

  async function deleteItem(id: number) {
    await db.transactions.delete(id);
    closeSelectedItem();
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
                  <div className="timeline-stamp">
                    <time>{formatRecordTime(item)}</time>
                  </div>
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
      {selectedItem?.id &&
        createPortal(
          <div className="detail-overlay" role="presentation">
            <button className="detail-backdrop" aria-label="关闭详情" onClick={closeSelectedItem} />
            <section className="detail-card floating" role="dialog" aria-modal="true" aria-label="账单详情">
              <div className="detail-grid">
                <span>类型</span>
                <strong>{typeLabel[selectedItem.type]}</strong>
                <span>金额</span>
                <strong className="amount-value">{currency.format(selectedItem.amount)}</strong>
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
                    closeSelectedItem();
                    window.setTimeout(() => goEdit(item), 80);
                  }}
                >
                  修改
                </button>
              </div>
            </section>
          </div>,
          document.body,
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

function formatCompactAmount(value: number) {
  if (Math.abs(value) >= 10000) return `${Math.round(value / 1000) / 10}万`;
  return formatAmountPlain(value);
}

function fitStatsAmountStyle(value: number): React.CSSProperties {
  const length = currency.format(value).length;
  const fontSize = length >= 16 ? 9 : length >= 14 ? 10 : length >= 12 ? 12 : 14;
  return { fontSize };
}

const dayMs = 24 * 60 * 60 * 1000;

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function inclusiveDayCount(start: string, end: string) {
  return Math.max(1, Math.floor((parseLocalDate(end).getTime() - parseLocalDate(start).getTime()) / dayMs) + 1);
}

function statsAverageDayCount(mode: StatsMode, month: string, year: string, items: Transaction[]) {
  const today = todayInputValue();
  if (mode === "month") {
    const range = getMonthRange(month);
    const end = month === monthKey() ? today : range.end;
    return inclusiveDayCount(range.start, end);
  }
  if (mode === "year") {
    const start = `${year}-01-01`;
    const end = year === String(new Date().getFullYear()) ? today : `${year}-12-31`;
    return inclusiveDayCount(start, end);
  }
  const dates = items.map((item) => item.date).sort();
  if (!dates.length) return 1;
  return inclusiveDayCount(dates[0], dates[dates.length - 1]);
}

function formatAssetRunway(totalBalance: number, dailyExpense: number) {
  if (totalBalance <= 0) return "0 天";
  if (dailyExpense <= 0) return "∞";
  const days = Math.floor(totalBalance / dailyExpense);
  return days > 9999 ? ">9999 天" : `${days} 天`;
}

function almanacRefreshKey(date = new Date()) {
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const hourIndex = date.getHours() === 23 ? 12 : Math.floor((date.getHours() + 1) / 2);
  return `${day}-${hourIndex}`;
}

function buildAssetRunwayMetrics(items: Transaction[], accounts: Account[]) {
  const accountKindByName = new Map(accounts.map((account) => [account.name, accountKindOf(account)]));
  const ordinaryItems = items
    .filter((item) => item.type !== "transfer")
    .filter((item) => (accountKindByName.get(item.account || defaultAccounts[0]) ?? inferAccountKind(item.account || defaultAccounts[0])) !== "investment");
  const averageDayCount = statsAverageDayCount("all", monthKey(), String(new Date().getFullYear()), ordinaryItems);
  const dailyExpense = sumByType(ordinaryItems, "expense") / averageDayCount;
  const dailyIncome = sumByType(ordinaryItems, "income") / averageDayCount;
  const totalBalance = buildAccountBalanceRows(items, accounts).reduce((sum, item) => sum + item.balance, 0);
  return {
    dailyExpense,
    dailyIncome,
    runway: formatAssetRunway(totalBalance, dailyExpense),
  };
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
  const rows = buildAccountBalanceRows(items, accounts);
  const total = rows.reduce((sum, item) => sum + item.balance, 0);
  const cashTotal = rows.filter((item) => item.kind === "cash").reduce((sum, item) => sum + item.balance, 0);
  const investmentTotal = rows.filter((item) => item.kind === "investment").reduce((sum, item) => sum + item.balance, 0);
  const totalAbsBalance = rows.reduce((sum, item) => sum + Math.abs(item.balance), 0);
  const runway = buildAssetRunwayMetrics(items, accounts);

  return (
    <section className="settings-stack">
      <div className="summary-band asset-summary">
        <div>
          <span>总资产</span>
          <strong>{currency.format(total)}</strong>
        </div>
      </div>
      <div className="asset-runway-card">
        <div className="asset-runway-grid">
          <span>
            <em>日均支出</em>
            <strong className="expense" title={`${currency.format(runway.dailyExpense)} / 天`} style={fitStatsAmountStyle(runway.dailyExpense)}>{currency.format(runway.dailyExpense)}</strong>
          </span>
          <span>
            <em>日均收入</em>
            <strong title={`${currency.format(runway.dailyIncome)} / 天`} style={fitStatsAmountStyle(runway.dailyIncome)}>{currency.format(runway.dailyIncome)}</strong>
          </span>
          <span>
            <em>0 收入能活</em>
            <strong>{runway.runway}</strong>
          </span>
        </div>
      </div>
      <div className="panel">
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
                style={{ "--swatch": row.kind === "investment" ? "#4776b4" : "var(--theme-primary)" } as React.CSSProperties}
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
  allItems,
  categories,
  accounts,
  mode,
  month,
  year,
  goEdit,
  savedQueries,
}: {
  items: Transaction[];
  allItems: Transaction[];
  categories: ReturnType<typeof useCategories>;
  accounts: Account[];
  mode: StatsMode;
  month: string;
  year: string;
  goEdit: (transaction: Transaction) => void;
  savedQueries: SavedQuery[];
}) {
  const [hiddenSavedIds, setHiddenSavedIds] = useState<Set<string>>(() => loadHiddenSavedQueryIds());
  const categoryNames = categories.map((item) => item.name);

  // 收藏被删除（如在聊天页）后，清理统计页隐藏列表中已失效的 ID
  useEffect(() => {
    setHiddenSavedIds((current) => {
      const validIds = new Set(savedQueries.map((item) => item.id));
      const pruned = new Set([...current].filter((id) => validIds.has(id)));
      if (pruned.size !== current.size) {
        persistHiddenSavedQueryIds(pruned);
        return pruned;
      }
      return current;
    });
  }, [savedQueries]);
  const savedQueryResults = useMemo(
    () =>
      savedQueries.map((saved) => {
        const result = executeQuery(saved.query, allItems, categoryNames);
        if ("error" in result) return { saved, error: result.error };
        return { saved, outcome: result.outcome };
      }),
    [savedQueries, allItems, categoryNames]
  );

  function hideSavedQuery(id: string) {
    setHiddenSavedIds((current) => {
      const next = new Set(current);
      next.add(id);
      persistHiddenSavedQueryIds(next);
      return next;
    });
  }

  function restoreHiddenSavedQueries() {
    setHiddenSavedIds(new Set());
    persistHiddenSavedQueryIds(new Set());
  }
  const accountKindByName = new Map(accounts.map((account) => [account.name, accountKindOf(account)]));
  const allNonTransferItems = allItems.filter((item) => item.type !== "transfer");
  const allOrdinaryItems = allNonTransferItems.filter((item) => (accountKindByName.get(item.account || defaultAccounts[0]) ?? inferAccountKind(item.account || defaultAccounts[0])) !== "investment");
  const allInvestmentItems = allNonTransferItems.filter((item) => (accountKindByName.get(item.account || defaultAccounts[0]) ?? inferAccountKind(item.account || defaultAccounts[0])) === "investment");
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
  const flowData = buildStatsFlowData(mode === "year" ? allOrdinaryItems : ordinaryItems, mode, month, year);
  const investmentProfitData = buildInvestmentProfitData(mode === "year" ? allInvestmentItems : investmentItems, mode, month, year);

  return (
    <section className="stats-page">
      <div className="stats-summary">
        <div>
          <span>支出</span>
          <strong className="expense" title={currency.format(expenseTotal)} style={fitStatsAmountStyle(expenseTotal)}>{currency.format(expenseTotal)}</strong>
        </div>
        <div>
          <span>收入</span>
          <strong title={currency.format(incomeTotal)} style={fitStatsAmountStyle(incomeTotal)}>{currency.format(incomeTotal)}</strong>
        </div>
        <div>
          <span>结余</span>
          <strong className={incomeTotal - expenseTotal < 0 ? "expense" : ""} title={currency.format(incomeTotal - expenseTotal)} style={fitStatsAmountStyle(incomeTotal - expenseTotal)}>{currency.format(incomeTotal - expenseTotal)}</strong>
        </div>
      </div>
      {investmentItems.length > 0 && (
        <div className="stats-summary investment-stats-summary">
          <div>
            <span>理财支出</span>
            <strong className="expense" title={currency.format(investmentExpense)} style={fitStatsAmountStyle(investmentExpense)}>{currency.format(investmentExpense)}</strong>
          </div>
          <div>
            <span>理财收入</span>
            <strong title={currency.format(investmentIncome)} style={fitStatsAmountStyle(investmentIncome)}>{currency.format(investmentIncome)}</strong>
          </div>
          <div>
            <span>理财盈亏</span>
            <strong className={investmentProfit < 0 ? "expense" : ""} title={currency.format(investmentProfit)} style={fitStatsAmountStyle(investmentProfit)}>{currency.format(investmentProfit)}</strong>
          </div>
        </div>
      )}
      {savedQueries.length > 0 && (
        <div className="panel stats-saved-card">
          <div className="section-title">
            <h2>收藏的查询</h2>
          </div>
          <div className="saved-query-rows">
            {savedQueryResults.filter(({ saved }) => !hiddenSavedIds.has(saved.id)).map(({ saved, outcome, error }) => (
              <div className="saved-query-row" key={saved.id}>
                <div className="saved-query-info">
                  <strong>{saved.name}</strong>
                  <span>{saved.query}</span>
                </div>
                {error ? (
                  <em className="saved-query-summary saved-query-error">查询无效</em>
                ) : outcome ? (
                  <em className="saved-query-summary">{savedQueryOutcomeSummary(outcome)}</em>
                ) : null}
                <button className="saved-query-row-delete" aria-label="在统计页隐藏" onClick={() => hideSavedQuery(saved.id)}>
                  ×
                </button>
              </div>
            ))}
          </div>
          {hiddenSavedIds.size > 0 && (
            <button className="saved-query-restore" onClick={restoreHiddenSavedQueries}>
              恢复隐藏的查询
            </button>
          )}
        </div>
      )}
      <StatsCategorySection
        title="支出分类"
        total={expenseTotal}
        data={expenseData}
        items={ordinaryItems.filter((item) => item.type === "expense")}
        categories={categories}
        goEdit={goEdit}
      />
      <StatsCategorySection
        title="收入分类"
        total={incomeTotal}
        data={incomeData}
        items={ordinaryItems.filter((item) => item.type === "income")}
        categories={categories}
        goEdit={goEdit}
      />
      {mode !== "month" && <StatsFlowBarSection data={flowData} />}
      {mode !== "month" && investmentItems.length > 0 && <InvestmentProfitBarSection data={investmentProfitData} />}
    </section>
  );
}

function StatsPeriodControls({
  className,
  mode,
  setMode,
  month,
  setMonth,
  year,
  setYear,
}: {
  className?: string;
  mode: StatsMode;
  setMode: (mode: StatsMode) => void;
  month: string;
  setMonth: (month: string) => void;
  year: string;
  setYear: (year: string) => void;
}) {
  const dateValue = mode === "month" ? new Date(`${month}-01T00:00:00`) : new Date(`${year}-01-01T00:00:00`);
  const dateLabel = mode === "month" ? formatStatsMonthLabel(month) : mode === "year" ? year : "全部";

  return (
    <div className={`stats-controls ${className ?? ""}`}>
      {mode === "all" ? (
        <Button className="stats-control-button inert" color="primary" fill="solid">
          {dateLabel}
        </Button>
      ) : (
        <BackedDatePicker
          historyKey="localMoneyStatsDatePicker"
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
        </BackedDatePicker>
      )}
      <Button
        className="stats-control-button"
        color="primary"
        fill="solid"
        onClick={() => setMode(nextStatsMode(mode))}
      >
        {statsModeLabel[mode]}
      </Button>
    </div>
  );
}

const statsModeLabel: Record<StatsMode, string> = {
  month: "按月统计",
  year: "按年统计",
  all: "全部统计",
};

function nextStatsMode(mode: StatsMode): StatsMode {
  if (mode === "month") return "year";
  if (mode === "year") return "all";
  return "month";
}

function getRecentYearMonths(endMonth: string) {
  const [year, month] = endMonth.split("-").map(Number);
  const end = new Date(year, month - 1, 1);
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(end);
    date.setMonth(end.getMonth() - 11 + index);
    return monthKey(date);
  });
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

type StatsDetailSort = "dateDesc" | "amountDesc";

type StatsFlowDatum = {
  key: string;
  label: string;
  income: number;
  expense: number;
};

type InvestmentProfitDatum = {
  key: string;
  label: string;
  profit: number;
};

function buildStatsFlowData(items: Transaction[], mode: StatsMode, month: string, year: string): StatsFlowDatum[] {
  if (mode === "month") {
    const range = getMonthRange(month);
    const endDay = Number(range.end.slice(-2));
    return Array.from({ length: endDay }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      const date = `${month}-${day}`;
      return buildStatsFlowDatum(date, `${index + 1}`, items.filter((item) => item.date === date));
    });
  }
  if (mode === "year") {
    return getRecentYearMonths(month).map((key) => buildStatsFlowDatum(key, formatStatsMonthLabel(key), items.filter((item) => item.date.startsWith(`${key}-`))));
  }

  const years = [...new Set(items.map((item) => item.date.slice(0, 4)))].sort();
  return years.map((itemYear) => buildStatsFlowDatum(itemYear, `${itemYear}`, items.filter((item) => item.date.startsWith(`${itemYear}-`))));
}

function buildStatsFlowDatum(key: string, label: string, items: Transaction[]): StatsFlowDatum {
  return {
    key,
    label,
    income: Math.round(sumByType(items, "income") * 100) / 100,
    expense: Math.round(sumByType(items, "expense") * 100) / 100,
  };
}

function StatsFlowBarSection({ data }: { data: StatsFlowDatum[] }) {
  const hasData = data.some((item) => item.income > 0 || item.expense > 0);

  return (
    <section className="panel stats-flow-panel">
      <div className="section-title stats-section-title">
        <h2>收支趋势</h2>
      </div>
      {!hasData ? (
        <EmptyState />
      ) : (
        <div className="stats-flow-chart">
          <ResponsiveContainer width="100%" height={220}>
            <RechartsBarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#eee7dc" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#77807b", fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: "#77807b", fontSize: 11 }} tickFormatter={formatCompactAmount} />
              <Tooltip
                trigger="hover"
                formatter={(value: number) => currency.format(value)}
                labelFormatter={(label) => `${label}`}
              />
              <Bar dataKey="income" name="收入" fill="#2f7d62" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="支出" fill="#c94f3f" radius={[4, 4, 0, 0]} />
            </RechartsBarChart>
          </ResponsiveContainer>
          <div className="stats-flow-legend" aria-hidden="true">
            <span className="income">收入</span>
            <span className="expense">支出</span>
          </div>
        </div>
      )}
    </section>
  );
}

function buildInvestmentProfitData(items: Transaction[], mode: StatsMode, month: string, year: string): InvestmentProfitDatum[] {
  if (mode === "month") {
    const range = getMonthRange(month);
    const endDay = Number(range.end.slice(-2));
    return Array.from({ length: endDay }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      const date = `${month}-${day}`;
      return buildInvestmentProfitDatum(date, `${index + 1}`, items.filter((item) => item.date === date));
    });
  }
  if (mode === "year") {
    return getRecentYearMonths(month).map((key) => buildInvestmentProfitDatum(key, formatStatsMonthLabel(key), items.filter((item) => item.date.startsWith(`${key}-`))));
  }

  const years = [...new Set(items.map((item) => item.date.slice(0, 4)))].sort();
  return years.map((itemYear) => buildInvestmentProfitDatum(itemYear, `${itemYear}`, items.filter((item) => item.date.startsWith(`${itemYear}-`))));
}

function buildInvestmentProfitDatum(key: string, label: string, items: Transaction[]): InvestmentProfitDatum {
  return {
    key,
    label,
    profit: Math.round((sumByType(items, "income") - sumByType(items, "expense")) * 100) / 100,
  };
}

function InvestmentProfitBarSection({ data }: { data: InvestmentProfitDatum[] }) {
  const hasData = data.some((item) => item.profit !== 0);

  return (
    <section className="panel stats-flow-panel">
      <div className="section-title stats-section-title">
        <h2>理财盈亏</h2>
      </div>
      {!hasData ? (
        <EmptyState />
      ) : (
        <div className="stats-flow-chart">
          <ResponsiveContainer width="100%" height={210}>
            <RechartsBarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#eee7dc" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#77807b", fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: "#77807b", fontSize: 11 }} tickFormatter={formatCompactAmount} />
              <Tooltip trigger="hover" formatter={(value: number) => currency.format(value)} labelFormatter={(label) => `${label}`} />
              <Bar dataKey="profit" name="盈亏" fill="#4776b4" radius={[4, 4, 0, 0]} />
            </RechartsBarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

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

function StatsCategorySection({
  title,
  total,
  data,
  items,
  categories,
  goEdit,
}: {
  title: string;
  total: number;
  data: CategoryStat[];
  items: Transaction[];
  categories: ReturnType<typeof useCategories>;
  goEdit: (transaction: Transaction) => void;
}) {
  const defaultVisibleCount = 6;
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryStat | null>(null);
  const [isDetailClosing, setIsDetailClosing] = useState(false);
  const [detailSort, setDetailSort] = useState<StatsDetailSort>("dateDesc");
  const [isDetailMenuOpen, setIsDetailMenuOpen] = useState(false);
  const closeSelectedCategory = useHistoryBackedPopup(Boolean(selectedCategory), (visible) => {
    if (!visible) animateSelectedCategoryClose();
  }, `localMoneyStatsCategoryDetail${title}`);
  const chartData = data.length ? data : [{ name: "暂无", value: 1, percent: 0, color: "#f0f1f4", icon: "wallet" }];
  const dataSignature = data.map((item) => `${item.name}:${item.value}`).join("|");
  const hasMore = data.length > defaultVisibleCount;
  const visibleData = isExpanded || !hasMore ? data : data.slice(0, defaultVisibleCount);
  const detailItems = selectedCategory ? sortStatsDetailItems(items.filter((item) => item.category === selectedCategory.name), detailSort) : [];

  useEffect(() => {
    setIsExpanded(false);
  }, [title, dataSignature]);

  useEffect(() => {
    window.requestAnimationFrame(() => window.dispatchEvent(new Event("localMoneyLayoutChange")));
  }, [isExpanded]);

  function openSelectedCategory(item: CategoryStat) {
    setIsDetailClosing(false);
    setDetailSort("dateDesc");
    setIsDetailMenuOpen(false);
    setSelectedCategory(item);
  }

  function animateSelectedCategoryClose() {
    setIsDetailClosing(true);
    setIsDetailMenuOpen(false);
    window.setTimeout(() => {
      setSelectedCategory(null);
      setIsDetailClosing(false);
    }, 220);
  }

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
                  <Pie data={chartData} dataKey="value" innerRadius={46} outerRadius={78} paddingAngle={2} isAnimationActive={false}>
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
            {visibleData.map((item) => (
              <button type="button" className="stats-rank-row clickable" key={item.name} onClick={() => openSelectedCategory(item)}>
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
              </button>
            ))}
          </div>
          {hasMore && (
            <button
              type="button"
              className="stats-more-button"
              onClick={() => setIsExpanded((current) => !current)}
            >
              {isExpanded ? "收起" : `查看更多（${data.length - defaultVisibleCount}）`}
            </button>
          )}
          {selectedCategory &&
            createPortal(
              <section className={`stats-detail-page ${isDetailClosing ? "leaving" : ""}`} aria-labelledby="stats-detail-title">
                <div className="stats-detail-inner">
                  <div className="sheet-title">
                    <div>
                      <h2 id="stats-detail-title">{selectedCategory.name}</h2>
                      <p>{`${formatAmountPlain(selectedCategory.value)} · ${selectedCategory.percent.toFixed(2)}% · ${detailItems.length} 笔`}</p>
                    </div>
                    <div className="stats-detail-menu-wrap">
                      <button type="button" className="stats-detail-menu-button" aria-label="更多操作" onClick={() => setIsDetailMenuOpen((current) => !current)}>
                        <span />
                        <span />
                        <span />
                      </button>
                      {isDetailMenuOpen && (
                        <div className="stats-detail-menu" role="menu">
                          <button
                            type="button"
                            className={detailSort === "dateDesc" ? "selected" : ""}
                            onClick={() => {
                              setDetailSort("dateDesc");
                              setIsDetailMenuOpen(false);
                            }}
                          >
                            时间排序
                          </button>
                          <button
                            type="button"
                            className={detailSort === "amountDesc" ? "selected" : ""}
                            onClick={() => {
                              setDetailSort("amountDesc");
                              setIsDetailMenuOpen(false);
                            }}
                          >
                            金额排序
                          </button>
                          <button type="button" onClick={closeSelectedCategory}>
                            关闭
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <TransactionList items={detailItems} categories={categories} goEdit={goEdit} />
                </div>
              </section>,
              document.body,
            )}
        </>
      )}
    </section>
  );
}

function sortStatsDetailItems(items: Transaction[], sort: StatsDetailSort) {
  return [...items].sort((a, b) => {
    if (sort === "amountDesc") return b.amount - a.amount;
    const aTime = new Date(a.createdAt || `${a.date}T00:00:00`).getTime();
    const bTime = new Date(b.createdAt || `${b.date}T00:00:00`).getTime();
    return bTime - aTime;
  });
}

function SettingsView({
  categories,
  transactions,
  accounts,
  transferRules,
  themeColor,
  setThemeColor,
}: {
  categories: ReturnType<typeof useCategories>;
  transactions: Transaction[];
  accounts: Account[];
  transferRules: TransferRule[];
  themeColor: string;
  setThemeColor: (color: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [updateStatus, setUpdateStatus] = useState("");
  const [updateUrl, setUpdateUrl] = useState("");
  const [aiConfig, setAiConfig] = useState<AiConfig>(loadAiConfig);
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const [webdavStatus, setWebdavStatus] = useState("");
  const [webdavConfig, setWebdavConfig] = useState<WebdavConfig>(loadWebdavConfig);
  const [isWebdavSettingsOpen, setIsWebdavSettingsOpen] = useState(false);
  const [cloudflareStatus, setCloudflareStatus] = useState("");
  const [cloudflareConfig, setCloudflareConfig] = useState<CloudflareBackupConfig>(loadCloudflareBackupConfig);
  const [isCloudflareSettingsOpen, setIsCloudflareSettingsOpen] = useState(false);
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
  const [isTransferRulesOpen, setIsTransferRulesOpen] = useState(false);
  const [isCategorySettingsOpen, setIsCategorySettingsOpen] = useState(false);
  const closeAccountSettings = useHistoryBackedPopup(isAccountSettingsOpen, setIsAccountSettingsOpen, "localMoneyAccountSettings");
  const closeTransferRules = useHistoryBackedPopup(isTransferRulesOpen, setIsTransferRulesOpen, "localMoneyRecurringRules");
  const closeCategorySettings = useHistoryBackedPopup(isCategorySettingsOpen, setIsCategorySettingsOpen, "localMoneyCategorySettings");

  useEffect(() => {
    saveWebdavConfig(webdavConfig);
  }, [webdavConfig]);

  useEffect(() => {
    saveAiConfig(aiConfig);
  }, [aiConfig]);

  useEffect(() => {
    saveCloudflareBackupConfig(cloudflareConfig);
  }, [cloudflareConfig]);

  useEffect(() => {
    window.requestAnimationFrame(() => window.dispatchEvent(new Event("localMoneyLayoutChange")));
  }, [
    isWebdavSettingsOpen,
    webdavStatus,
    webdavConfig.lastAutoBackupDate,
    isCloudflareSettingsOpen,
    cloudflareStatus,
    cloudflareConfig.lastAutoBackupDate,
  ]);

  async function downloadBackup() {
    setExportStatus("");
    try {
      const payload = await exportBackup();
      const json = JSON.stringify(payload, null, 2);
      const fileName = `local-money-${fileSafeStamp()}.json`;
      if (__CAPACITOR__) {
        // App 内 WebView 不支持 a[download]，改为写入缓存目录并调起系统分享
        const result = await Filesystem.writeFile({
          path: fileName,
          data: json,
          directory: Directory.Cache,
        });
        await Share.share({
          title: "账本备份",
          files: [result.uri],
          dialogTitle: "导出 JSON 备份",
        });
      } else {
        const blob = new Blob([json], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(link.href);
      }
    } catch (error) {
      setExportStatus(error instanceof Error ? `导出失败：${error.message}` : "导出失败");
    }
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const payload = JSON.parse(await file.text()) as BackupPayload;
    await importBackup(payload);
    event.target.value = "";
  }

  async function backupToWebdav() {
    try {
      setWebdavStatus("正在备份到 WebDAV...");
      const payload = await exportBackup();
      await uploadWebdavBackup(webdavConfig, payload);
      const nextConfig = { ...webdavConfig, lastAutoBackupDate: todayInputValue() };
      setWebdavConfig(nextConfig);
      saveWebdavConfig(nextConfig);
      setWebdavStatus("WebDAV 备份完成");
    } catch (error) {
      setWebdavStatus(error instanceof Error ? error.message : "WebDAV 备份失败");
    }
  }

  async function restoreFromWebdav() {
    if (!window.confirm("从 WebDAV 恢复会覆盖当前本地数据，确定继续吗？")) return;
    try {
      setWebdavStatus("正在从 WebDAV 恢复...");
      const payload = await downloadLatestWebdavBackup(webdavConfig);
      await importBackup(payload);
      setWebdavStatus("WebDAV 恢复完成");
    } catch (error) {
      setWebdavStatus(error instanceof Error ? error.message : "WebDAV 恢复失败");
    }
  }

  async function backupToCloudflare() {
    try {
      setCloudflareStatus("正在备份到 Cloudflare...");
      const payload = await exportBackup();
      await uploadCloudflareBackup(cloudflareConfig, payload);
      const nextConfig = { ...cloudflareConfig, lastAutoBackupDate: todayInputValue() };
      setCloudflareConfig(nextConfig);
      saveCloudflareBackupConfig(nextConfig);
      setCloudflareStatus("Cloudflare 备份完成");
    } catch (error) {
      setCloudflareStatus(error instanceof Error ? error.message : "Cloudflare 备份失败");
    }
  }

  async function restoreFromCloudflare() {
    if (!window.confirm("从 Cloudflare 恢复会覆盖当前本地数据，确定继续吗？")) return;
    try {
      setCloudflareStatus("正在从 Cloudflare 恢复...");
      const payload = await downloadLatestCloudflareBackup(cloudflareConfig);
      await importBackup(payload);
      setCloudflareStatus("Cloudflare 恢复完成");
    } catch (error) {
      setCloudflareStatus(error instanceof Error ? error.message : "Cloudflare 恢复失败");
    }
  }

  async function checkForUpdates() {
    if (__CAPACITOR__) {
      setUpdateUrl("");
      try {
        setUpdateStatus("正在检查 GitHub 更新...");
        const response = await fetch("https://api.github.com/repos/zYeoman/SimpLedger/releases/latest");
        if (response.status === 404) {
          setUpdateStatus("GitHub 上还没有发布版本");
          return;
        }
        if (!response.ok) throw new Error(`请求失败（${response.status}）`);
        const release = (await response.json()) as { tag_name?: string; html_url?: string };
        const tagName = typeof release.tag_name === "string" ? release.tag_name : "";
        if (!tagName) {
          setUpdateStatus("未找到版本信息");
          return;
        }
        if (!isNewerVersion(tagName, __APP_VERSION__)) {
          setUpdateStatus(`当前已是最新版本（${__APP_VERSION__}）`);
          return;
        }
        setUpdateStatus(`发现新版本 ${tagName}（当前 ${__APP_VERSION__}）`);
        if (typeof release.html_url === "string") {
          setUpdateUrl(release.html_url);
        }
      } catch (error) {
        setUpdateStatus(error instanceof Error ? `检查更新失败：${error.message}` : "检查更新失败");
      }
      return;
    }
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
        <div className="theme-color-settings">
          <span>主题颜色</span>
          <div>
            {themeColorOptions.map((color) => (
              <button
                type="button"
                key={color}
                className={themeColor === color ? "selected" : ""}
                aria-label={`主题颜色 ${color}`}
                style={{ "--swatch": color } as React.CSSProperties}
                onClick={() => setThemeColor(color)}
              />
            ))}
          </div>
        </div>
        {updateStatus && <p className="setting-hint">{updateStatus}</p>}
        {updateUrl && (
          <a className="secondary-button update-button" href={updateUrl}>
            前往 GitHub 下载新版本
          </a>
        )}
      </div>
      <div className="panel">
        <div className="section-title">
          <h2>AI 查询</h2>
        </div>
        <button
          type="button"
          className={`settings-action-button webdav-config-button ${isAiSettingsOpen ? "open" : ""}`}
          onClick={() => setIsAiSettingsOpen((current) => !current)}
        >
          <Settings size={18} />
          <span>AI 配置</span>
          <em>{isAiConfigured(aiConfig) ? "已配置" : "未配置"}</em>
        </button>
        {isAiSettingsOpen && (
          <div className="webdav-settings">
            <label className="field webdav-field">
              <span>API 地址</span>
              <input
                placeholder="https://api.openai.com/v1"
                value={aiConfig.endpoint}
                onChange={(event) => setAiConfig((current) => ({ ...current, endpoint: event.target.value }))}
              />
            </label>
            <label className="field webdav-field">
              <span>API Key</span>
              <input
                type="password"
                placeholder="sk-..."
                value={aiConfig.apiKey}
                onChange={(event) => setAiConfig((current) => ({ ...current, apiKey: event.target.value }))}
              />
            </label>
            <label className="field webdav-field">
              <span>模型</span>
              <input
                placeholder="模型 ID"
                value={aiConfig.model}
                onChange={(event) => setAiConfig((current) => ({ ...current, model: event.target.value }))}
              />
            </label>
          </div>
        )}
        <p className="setting-hint">密钥只保存在本机，请求直接发往你填写的地址；请确认信任该服务商。</p>
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
        {exportStatus && <p className="setting-hint">{exportStatus}</p>}
        <div className="button-row webdav-action-row">
          <button className="secondary-button" onClick={backupToWebdav}>
            <Upload size={18} />
            备份到 WebDAV
          </button>
          <button className="secondary-button" onClick={restoreFromWebdav}>
            <Download size={18} />
            从 WebDAV 恢复
          </button>
        </div>
        <button
          type="button"
          className={`settings-action-button webdav-config-button ${isWebdavSettingsOpen ? "open" : ""}`}
          onClick={() => setIsWebdavSettingsOpen((current) => !current)}
        >
          <Settings size={18} />
          <span>WebDAV 设置</span>
          <em>{`${webdavConfig.url.trim() ? "已配置" : "未配置"} · ${webdavConfig.autoBackup ? "自动备份" : "手动备份"}`}</em>
        </button>
        {isWebdavSettingsOpen && (
          <div className="webdav-settings">
            <label className="field webdav-field">
              <span>WebDAV 地址</span>
              <input
                placeholder="https://example.com/dav/backups"
                value={webdavConfig.url}
                onChange={(event) => setWebdavConfig((current) => ({ ...current, url: event.target.value }))}
              />
            </label>
            <div className="webdav-auth-grid">
              <label className="field webdav-field">
                <span>用户名</span>
                <input
                  autoComplete="username"
                  value={webdavConfig.username}
                  onChange={(event) => setWebdavConfig((current) => ({ ...current, username: event.target.value }))}
                />
              </label>
              <label className="field webdav-field">
                <span>密码</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={webdavConfig.password}
                  onChange={(event) => setWebdavConfig((current) => ({ ...current, password: event.target.value }))}
                />
              </label>
            </div>
            <label className="webdav-toggle">
              <input
                type="checkbox"
                checked={webdavConfig.autoBackup}
                onChange={(event) => setWebdavConfig((current) => ({ ...current, autoBackup: event.target.checked }))}
              />
              <span>每天首次打开自动备份</span>
            </label>
          </div>
        )}
        {webdavConfig.lastAutoBackupDate && <p className="setting-hint">上次自动备份：{webdavConfig.lastAutoBackupDate}</p>}
        {webdavStatus && <p className="setting-hint">{webdavStatus}</p>}
        <div className="button-row webdav-action-row">
          <button className="secondary-button" onClick={backupToCloudflare}>
            <Upload size={18} />
            备份到 Cloudflare
          </button>
          <button className="secondary-button" onClick={restoreFromCloudflare}>
            <Download size={18} />
            从 Cloudflare 恢复
          </button>
        </div>
        <button
          type="button"
          className={`settings-action-button webdav-config-button ${isCloudflareSettingsOpen ? "open" : ""}`}
          onClick={() => setIsCloudflareSettingsOpen((current) => !current)}
        >
          <Settings size={18} />
          <span>Cloudflare 设置</span>
          <em>{`${cloudflareConfig.endpoint.trim() && cloudflareConfig.token.trim() ? "已配置" : "未配置"} · ${
            cloudflareConfig.autoBackup ? "自动备份" : "手动备份"
          }`}</em>
        </button>
        {isCloudflareSettingsOpen && (
          <div className="webdav-settings">
            <label className="field webdav-field">
              <span>Worker 地址</span>
              <input
                placeholder="https://local-money-backup.example.workers.dev"
                value={cloudflareConfig.endpoint}
                onChange={(event) => setCloudflareConfig((current) => ({ ...current, endpoint: event.target.value }))}
              />
            </label>
            <label className="field webdav-field">
              <span>备份令牌</span>
              <input
                type="password"
                autoComplete="current-password"
                value={cloudflareConfig.token}
                onChange={(event) => setCloudflareConfig((current) => ({ ...current, token: event.target.value }))}
              />
            </label>
            <label className="webdav-toggle">
              <input
                type="checkbox"
                checked={cloudflareConfig.autoBackup}
                onChange={(event) => setCloudflareConfig((current) => ({ ...current, autoBackup: event.target.checked }))}
              />
              <span>每天首次打开自动备份</span>
            </label>
          </div>
        )}
        {cloudflareConfig.lastAutoBackupDate && <p className="setting-hint">Cloudflare 上次自动备份：{cloudflareConfig.lastAutoBackupDate}</p>}
        {cloudflareStatus && <p className="setting-hint">{cloudflareStatus}</p>}
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
      <Popup visible={isAccountSettingsOpen} onMaskClick={closeAccountSettings} bodyClassName="management-popup">
        <AccountSettingsPanel accounts={accounts} transactions={transactions} transferRules={transferRules} categories={categories} />
      </Popup>
      <Popup visible={isTransferRulesOpen} onMaskClick={closeTransferRules} bodyClassName="management-popup">
        <RecurringRulesPanel accounts={accounts} categories={categories} transferRules={transferRules} />
      </Popup>
      <Popup visible={isCategorySettingsOpen} onMaskClick={closeCategorySettings} bodyClassName="management-popup">
        <CategorySettingsPanel categories={categories} transactions={transactions} accounts={accounts} />
      </Popup>
    </section>
  );
}

function AccountSettingsPanel({
  accounts,
  transactions,
  transferRules,
  categories,
}: {
  accounts: Account[];
  transactions: Transaction[];
  transferRules: TransferRule[];
  categories: ReturnType<typeof useCategories>;
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
        <AccountKindToggle value={newAccountKind} onChange={setNewAccountKind} />
        <button type="submit">添加</button>
      </form>
      <div className="asset-list">
        {accountRecords.map((account) => {
          const usageCount = transactions.filter((item) => transactionBelongsToAccount(item, account.name)).length;
          const ruleCount = transferRules.filter((rule) => (rule.account || rule.fromAccount) === account.name || rule.toAccount === account.name).length;
          const categoryCount = categories.filter((category) => category.defaultAccount === account.name).length;
          const dependencyCount = usageCount + ruleCount + categoryCount;
          return (
            <article className="account-settings-row" key={account.name}>
              <div>
                <strong>{account.name}</strong>
                <span>
                  {usageCount} 笔记录 · {ruleCount} 条规则
                  {categoryCount > 0 ? ` · ${categoryCount} 个默认分类` : ""}
                </span>
              </div>
              <div className="asset-actions">
                <AccountKindToggle
                  value={accountKindOf(account)}
                  disabled={!account.id}
                  onChange={(kind) => account.id && db.accounts.update(account.id, { kind })}
                />
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

function AccountKindToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: AccountKind;
  onChange: (value: AccountKind) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`account-kind-toggle ${disabled ? "disabled" : ""}`} aria-label="账户类型">
      {(["cash", "investment"] as AccountKind[]).map((kind) => (
        <button type="button" key={kind} className={value === kind ? "selected" : ""} disabled={disabled} onClick={() => onChange(kind)}>
          {accountKindLabel[kind]}
        </button>
      ))}
    </div>
  );
}

const recurringFrequencyLabel: Record<RecurringFrequency, string> = {
  daily: "每天",
  weekday: "工作日",
  weekend: "休息日",
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
  const closeEditor = useHistoryBackedPopup(isEditorOpen, setIsEditorOpen, "localMoneyRecurringEditor");

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
      <Popup visible={isEditorOpen} onMaskClick={closeEditor} bodyClassName="management-popup recurring-editor-popup">
        <RecurringRuleEditor accounts={accounts} categories={categories} onDone={closeEditor} />
      </Popup>
    </div>
  );
}

function RecurringRuleEditor({
  accounts,
  categories,
  initialDraft,
  onDone,
}: {
  accounts: Account[];
  categories: ReturnType<typeof useCategories>;
  initialDraft?: RecurringRuleDraft;
  onDone: () => void;
}) {
  const accountNames = accounts.length ? accounts.map((item) => item.name) : defaultAccounts;
  const [type, setType] = useState<TransactionType>(initialDraft?.type ?? "expense");
  const typeCategories = categories.filter((category) => category.type === type);
  const initialCategory = initialDraft?.category && typeCategories.some((item) => item.name === initialDraft.category) ? initialDraft.category : typeCategories[0]?.name ?? "";
  const [category, setCategory] = useState(initialCategory);
  const [account, setAccount] = useState(initialDraft?.account || (defaultAccountForCategory(typeCategories, initialCategory, accountNames) ?? accountNames[0] ?? ""));
  const [toAccount, setToAccount] = useState(initialDraft?.toAccount || (accountNames.find((item) => item !== (initialDraft?.account || (accountNames[0] ?? ""))) ?? accountNames[0] ?? ""));
  const [amount, setAmount] = useState(initialDraft?.amount ?? "");
  const [frequency, setFrequency] = useState<RecurringFrequency>("daily");
  const [daysText, setDaysText] = useState("");
  const [startDate, setStartDate] = useState(initialDraft?.startDate ?? todayInputValue());
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState(initialDraft?.note ?? "");
  const categoryColumns = [typeCategories.map((item) => ({ label: item.name, value: item.name }))];
  const frequencyColumns = [Object.entries(recurringFrequencyLabel).map(([value, label]) => ({ label, value }))];
  const startDateValue = new Date(`${startDate}T00:00:00`);
  const endDateValue = new Date(`${endDate || startDate}T00:00:00`);

  useEffect(() => {
    if (type === "transfer") return;
    if (!typeCategories.some((item) => item.name === category)) {
      selectRecurringCategory(typeCategories[0]?.name ?? "", typeCategories);
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

  function selectRecurringCategory(name: string, sourceCategories = typeCategories) {
    setCategory(name);
    const nextDefaultAccount = defaultAccountForCategory(sourceCategories, name, accountNames);
    if (nextDefaultAccount) {
      setAccount(nextDefaultAccount);
    }
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
            <BackedPicker historyKey="localMoneyRecurringCategoryPicker" columns={categoryColumns} value={[category]} onConfirm={(value) => selectRecurringCategory(String(value[0]))}>
              {(_, actions) => (
                <Button className="recurring-choice-button" color="primary" fill="solid" onClick={actions.open}>
                  {category || "选择分类"}
                </Button>
              )}
            </BackedPicker>
          )}
          {type === "transfer" ? (
            <TransferAccountSelect label="转出" value={account} accounts={accountNames} onChange={setAccount} />
          ) : (
            <AccountSelectButton value={account} accounts={accountNames} onChange={setAccount} className="recurring-choice-button" />
          )}
          {type === "transfer" && (
            <TransferAccountSelect label="转入" value={toAccount} accounts={accountNames} onChange={setToAccount} />
          )}
        </div>
        <div className="recurring-field">
          <span>重复</span>
          <BackedPicker historyKey="localMoneyRecurringFrequencyPicker" columns={frequencyColumns} value={[frequency]} onConfirm={(value) => setFrequency(value[0] as RecurringFrequency)}>
            {(_, actions) => (
              <Button className="recurring-choice-button" color="primary" fill="solid" onClick={actions.open}>
                {recurringFrequencyLabel[frequency]}
              </Button>
            )}
          </BackedPicker>
        </div>
        {(frequency === "weekly" || frequency === "monthly" || frequency === "yearly") && (
          <label className="recurring-field">
            <span>{frequency === "weekly" ? "周几" : frequency === "monthly" ? "几号" : "日期"}</span>
            <input placeholder={recurringDaysPlaceholder(frequency)} value={daysText} onChange={(event) => setDaysText(event.target.value)} />
          </label>
        )}
        <div className="recurring-date-grid">
          <BackedDatePicker historyKey="localMoneyRecurringStartDatePicker" title="开始日期" value={startDateValue} onConfirm={(value) => setStartDate(toDateInputValue(value))}>
            {(_, actions) => (
              <Button className="recurring-choice-button" color="primary" fill="solid" onClick={actions.open}>
                开始 {formatEntryDateLabel(startDate)}
              </Button>
            )}
          </BackedDatePicker>
          <BackedDatePicker historyKey="localMoneyRecurringEndDatePicker" title="结束日期" value={endDateValue} onConfirm={(value) => setEndDate(toDateInputValue(value))}>
            {(_, actions) => (
              <Button className="recurring-choice-button" color="primary" fill="solid" onClick={actions.open}>
                {endDate ? `结束 ${formatEntryDateLabel(endDate)}` : "无结束日期"}
              </Button>
            )}
          </BackedDatePicker>
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
        <div className="recurring-action-row">
          <Button block fill="outline" type="button" className="recurring-cancel-button" onClick={onDone}>
            取消
          </Button>
          <Button block color="primary" fill="solid" type="submit" className="recurring-submit-button">
            保存
          </Button>
        </div>
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

function parseVersionNumbers(version: string): number[] {
  return version
    .replace(/^v/, "")
    .split(".")
    .map((part) => {
      const match = part.match(/\d+/);
      return match ? Number(match[0]) : 0;
    });
}

function isNewerVersion(releaseVersion: string, currentVersion: string): boolean {
  const release = parseVersionNumbers(releaseVersion);
  const current = parseVersionNumbers(currentVersion);
  const length = Math.max(release.length, current.length);
  for (let index = 0; index < length; index++) {
    const releasePart = release[index] ?? 0;
    const currentPart = current[index] ?? 0;
    if (releasePart !== currentPart) return releasePart > currentPart;
  }
  return false;
}

function CategorySettingsPanel({
  categories,
  transactions,
  accounts,
}: {
  categories: ReturnType<typeof useCategories>;
  transactions: Transaction[];
  accounts: Account[];
}) {
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryManageType, setCategoryManageType] = useState<Extract<TransactionType, "expense" | "income">>("expense");
  const [newCategoryColor, setNewCategoryColor] = useState("#6f7680");
  const [newCategoryIcon, setNewCategoryIcon] = useState("wallet");
  const [newCategoryDefaultAccount, setNewCategoryDefaultAccount] = useState("");
  const accountNames = accounts.length ? accounts.map((item) => item.name) : defaultAccounts;
  const visibleCategories = categories.filter((category) => category.type === categoryManageType);

  async function addCategory(event: React.FormEvent) {
    event.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    const exists = categories.some((category) => category.name === name && category.type === categoryManageType);
    if (exists) return;
    await db.categories.add({
      name,
      type: categoryManageType,
      color: newCategoryColor,
      icon: newCategoryIcon,
      defaultAccount: newCategoryDefaultAccount || undefined,
    });
    setNewCategoryName("");
  }

  return (
    <div className="management-panel">
      <div className="popup-title">分类设置</div>
      <div className="category-manage-tabs">
        <button type="button" className={categoryManageType === "expense" ? "selected" : ""} onClick={() => setCategoryManageType("expense")}>
          支出
        </button>
        <button type="button" className={categoryManageType === "income" ? "selected" : ""} onClick={() => setCategoryManageType("income")}>
          收入
        </button>
      </div>
      <form className="category-add-form" onSubmit={addCategory}>
        <input placeholder="新增分类" value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} />
        <CategoryDefaultAccountButton value={newCategoryDefaultAccount} accounts={accountNames} onChange={setNewCategoryDefaultAccount} />
        <ColorPicker value={newCategoryColor} onChange={setNewCategoryColor} />
        <IconPicker value={newCategoryIcon} color={newCategoryColor} onChange={setNewCategoryIcon} />
        <button type="submit">添加</button>
      </form>
      <div className="category-editor-list">
        {visibleCategories.map((category) => {
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
              <CategoryDefaultAccountButton
                value={category.defaultAccount ?? ""}
                accounts={accountNames}
                onChange={(defaultAccount) => category.id && db.categories.update(category.id, { defaultAccount: defaultAccount || undefined })}
              />
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

function CategoryDefaultAccountButton({
  value,
  accounts,
  onChange,
}: {
  value: string;
  accounts: string[];
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const close = useHistoryBackedPopup(visible, setVisible, "localMoneyCategoryDefaultAccountPopup");

  return (
    <>
      <button type="button" className={`category-default-account-button ${value ? "selected" : ""}`} onClick={() => setVisible(true)}>
        {value || "默认账户"}
      </button>
      <Popup visible={visible} onMaskClick={close} bodyClassName="account-select-popup">
        <div className="popup-title">默认账户</div>
        <div className="account-option-list">
          <button
            type="button"
            className={!value ? "selected" : ""}
            onClick={() => {
              onChange("");
              close();
            }}
          >
            不指定
          </button>
          {accounts.map((account) => (
            <button
              type="button"
              key={account}
              className={value === account ? "selected" : ""}
              onClick={() => {
                onChange(account);
                close();
              }}
            >
              {account}
            </button>
          ))}
        </div>
      </Popup>
    </>
  );
}

function IconPicker({ value, color, onChange }: { value: string; color: string; onChange: (value: string) => void }) {
  const [visible, setVisible] = useState(false);
  const close = useHistoryBackedPopup(visible, setVisible, "localMoneyIconPicker");

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
      <Popup visible={visible} onMaskClick={close} bodyClassName="icon-picker-popup">
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
                close();
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
  const close = useHistoryBackedPopup(visible, setVisible, "localMoneyColorPicker");

  return (
    <>
      <button
        type="button"
        className="color-picker-trigger"
        aria-label="选择颜色"
        style={{ backgroundColor: value }}
        onClick={() => setVisible(true)}
      />
      <Popup visible={visible} onMaskClick={close} bodyClassName="color-picker-popup">
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
                close();
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
