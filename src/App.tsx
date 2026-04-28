import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Search, RefreshCw } from "lucide-react";
import { AuthPanel } from "./components/AuthPanel";
import { Scanner } from "./components/Scanner";
import { StockChart } from "./components/StockChart";
import { fetchStockData } from "./lib/api";
import { latestIndicators } from "./lib/indicators";
import { isSupabaseConfigured, supabase } from "./lib/supabaseClient";
import type { Candle, StockDataResponse } from "./lib/types";
import "./styles/app.css";

const quickUs = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "TSLA", "META", "SPY"];
const quickTw = ["2330", "2317", "2454", "2308", "2412", "0050", "2882", "1301"];

function currencyFormat(value: number | undefined, currency = "TWD") {
  if (value === undefined || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(value) + ` ${currency}`;
}

function StatCard({ title, value, subtitle, positive }: { title: string; value: string; subtitle?: string; positive?: boolean }) {
  return (
    <div className="statCard">
      <span>{title}</span>
      <strong className={positive === undefined ? "" : positive ? "green" : "red"}>{value}</strong>
      {subtitle && <small>{subtitle}</small>}
    </div>
  );
}

export default function App() {
  const [query, setQuery] = useState("AAPL");
  const [range, setRange] = useState("6mo");
  const [data, setData] = useState<StockDataResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState<User | null>(null);

  async function loadUser() {
    if (!supabase) return;
    const { data } = await supabase.auth.getUser();
    setUser(data.user);
  }

  useEffect(() => {
    loadUser();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  async function loadStock(symbol = query, selectedRange = range) {
  const safeSymbol = String(symbol || query || "AAPL").trim();

  if (!safeSymbol) {
    setError("請輸入股票代碼");
    return;
  }

  setLoading(true);
  setError("");

  try {
    const result = await fetchStockData(safeSymbol, selectedRange);
    setData(result);
    setQuery(result.requestedSymbol || safeSymbol);
  } catch (err) {
    console.error("loadStock failed", err);
    setError(err instanceof Error ? err.message : String(err));
  } finally {
    setLoading(false);
  }
}

  useEffect(() => {
    loadStock("AAPL", "6mo");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const indicators = useMemo(() => {
    if (!data?.candles?.length) return null;
    return latestIndicators(data.candles as Candle[]);
  }, [data]);

  const meta = data?.meta;
  const latest = indicators?.latest;
  const prev = indicators?.previous;
  const change = latest && prev ? latest.close - prev.close : meta?.regularMarketChange;
  const changePct = latest && prev && prev.close ? (change! / prev.close) * 100 : meta?.regularMarketChangePercent;

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>股票技術分析儀表板</h1>
          <p>支援美股、台股、即時技術指標分析</p>
        </div>
        <div className="searchBox">
          <div className="inputWrap">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadStock()}
              placeholder="輸入股票代碼（如 AAPL、2330）"
            />
          </div>
          <button onClick={() => loadStock()} disabled={loading}>搜尋</button>
          <button className="iconButton" onClick={() => loadStock()} title="重新整理"><RefreshCw size={18} /></button>
        </div>
      </header>

     <div className="rangeRow">
  {[
    { value: "1mo", label: "1個月" },
    { value: "3mo", label: "3個月" },
    { value: "6mo", label: "6個月" },
    { value: "1y", label: "1年" },
    { value: "2y", label: "2年" },
  ].map((item) => (
    <button
      key={item.value}
      className={range === item.value ? "active" : ""}
      onClick={() => {
        setRange(item.value);
        loadStock(query, item.value);
      }}
    >
      {item.label}
    </button>
  ))}
</div>
      <div className="quickRow">
        {quickUs.map((s) => <button key={s} onClick={() => loadStock(s)}>{s}</button>)}
      </div>
      <div className="quickRow">
        {quickTw.map((s) => <button key={s} onClick={() => loadStock(s)}>{s}</button>)}
      </div>

      {error && <div className="errorBox">{error}</div>}

      {data && (
        <>
          <section className="hero card">
  <div>
    <h2>
      {data.requestedSymbol} {meta?.name || ""}
    </h2>
  </div>

  <div className="priceBlock">
              <strong>{currencyFormat(latest?.close ?? meta?.regularMarketPrice, meta?.currency || "TWD")}</strong>
              {change !== undefined && changePct !== undefined && (
                <span className={change >= 0 ? "red" : "green"}>{change >= 0 ? "+" : ""}{change.toFixed(2)}（{changePct.toFixed(2)}%）</span>
              )}
            </div>
          </section>

          <section className="statsGrid">
            <StatCard title="RSI (14)" value={indicators?.rsi14?.toFixed(1) ?? "-"} subtitle="中性" />
            <StatCard title="MA20（月線）" value={indicators?.ma20?.toFixed(0) ?? "-"} subtitle={latest && indicators?.ma20 && latest.close > indicators.ma20 ? "價格 > MA20 ✓" : "價格 < MA20"} positive={latest && indicators?.ma20 ? latest.close > indicators.ma20 : undefined} />
            <StatCard title="MA60（季線）" value={indicators?.ma60?.toFixed(0) ?? "-"} subtitle={latest && indicators?.ma60 && latest.close > indicators.ma60 ? "價格 > MA60 ✓" : "價格 < MA60"} positive={latest && indicators?.ma60 ? latest.close > indicators.ma60 : undefined} />
            <StatCard title="漲跌幅" value={changePct !== undefined ? `${changePct.toFixed(2)}%` : "-"} positive={(changePct ?? 0) < 0} />
            <StatCard title="成交量" value={latest?.volume ? `${(latest.volume / 1_000_000).toFixed(1)}M` : "-"} />
            <StatCard title="幣種" value={meta?.currency || "-"} />
          </section>
        </>
      )}

      <AuthPanel user={user} onAuthChange={loadUser} />
      <Scanner user={user} />

      {data?.candles?.length ? <StockChart candles={data.candles} /> : <div className="card emptyChart">尚無圖表資料</div>}

      {!isSupabaseConfigured && <div className="warning">尚未設定 Supabase，股票資料與雲端同步功能需要 Edge Functions 才能完整運作。</div>}
    </main>
  );
}
