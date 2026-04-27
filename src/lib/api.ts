import type { Candle, Stock, StockDataResponse } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function getFunctionUrl(functionName: string) {
  if (!SUPABASE_URL) {
    throw new Error("尚未設定 VITE_SUPABASE_URL");
  }

  return `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/${functionName}`;
}

function getHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (SUPABASE_ANON_KEY) {
    headers.apikey = SUPABASE_ANON_KEY;
    headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  }

  return headers;
}

function normalizeSymbol(symbol: string) {
  return String(symbol || "").trim().toUpperCase();
}

function normalizeCandle(raw: any): Candle {
  return {
    time: String(raw.time || raw.date || raw.period || ""),
    open: Number(raw.open ?? raw.close ?? 0),
    high: Number(raw.high ?? raw.close ?? 0),
    low: Number(raw.low ?? raw.close ?? 0),
    close: Number(raw.close ?? 0),
    volume: Number(raw.volume ?? 0),
  };
}

function normalizeStockData(raw: any, requestedSymbol: string): StockDataResponse {
  if (!raw || raw.success === false) {
    throw new Error(raw?.message || raw?.error || "股票資料抓取失敗");
  }

  const symbol =
    raw.requestedSymbol ||
    raw.inputSymbol ||
    requestedSymbol;

  const yahooSymbol =
    raw.yahooSymbol ||
    raw.resolvedSymbol ||
    raw.symbol ||
    symbol;

  const name =
    raw.name ||
    raw.twStockName ||
    raw.meta?.name ||
    raw.meta?.longName ||
    raw.meta?.shortName ||
    symbol;

  const currency =
    raw.currency ||
    raw.meta?.currency ||
    "TWD";

  const exchangeName =
    raw.exchangeName ||
    raw.meta?.exchangeName ||
    "";

  const regularMarketPrice =
    raw.regularMarketPrice ??
    raw.meta?.regularMarketPrice;

  const regularMarketChange =
    raw.regularMarketChange ??
    raw.meta?.regularMarketChange;

  const regularMarketChangePercent =
    raw.regularMarketChangePercent ??
    raw.meta?.regularMarketChangePercent;

  const candles = Array.isArray(raw.candles)
    ? raw.candles.map(normalizeCandle).filter((c: Candle) => c.time && Number.isFinite(c.close))
    : [];

  return {
    success: true,
    requestedSymbol: symbol,
    yahooSymbol,
    meta: {
      symbol,
      yahooSymbol,
      name,
      currency,
      exchangeName,
      regularMarketPrice,
      regularMarketChange,
      regularMarketChangePercent,
    },
    candles,
    fallbackTried: raw.fallbackTried || raw.debug || [],
    message: raw.message,
  };
}

export async function fetchStockData(symbol: string, range = "6mo"): Promise<StockDataResponse> {
  const safeSymbol = normalizeSymbol(symbol);

  if (!safeSymbol) {
    throw new Error("請輸入股票代號");
  }

  const url = new URL(getFunctionUrl("get-stock-data"));
  url.searchParams.set("symbol", safeSymbol);
  url.searchParams.set("range", range);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: getHeaders(),
  });

  const text = await response.text();

  let json: any;

  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`股票資料回傳格式錯誤：${text.slice(0, 120)}`);
  }

  if (!response.ok) {
    throw new Error(json?.message || json?.error || `股票資料服務錯誤 HTTP ${response.status}`);
  }

  return normalizeStockData(json, safeSymbol);
}

export type HotStocksResponse = {
  success: boolean;
  stocks: Stock[];
  updatedAt?: string;
  message?: string;
  debug?: unknown;
};

function normalizeStock(raw: any): Stock | null {
  const symbol = normalizeSymbol(raw?.symbol || raw?.code || raw?.代號 || raw?.股票代號 || "");

  if (!symbol) return null;

  const name = String(
    raw?.name ||
    raw?.stockName ||
    raw?.名稱 ||
    raw?.股票名稱 ||
    raw?.公司名稱 ||
    symbol,
  ).trim();

  return {
    symbol,
    name,
  };
}

export async function fetchHotStocksFromEdge(): Promise<HotStocksResponse> {
  const url = getFunctionUrl("get-hot-stocks");

  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders(),
  });

  const text = await response.text();

  let json: any;

  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`熱門股資料回傳格式錯誤：${text.slice(0, 120)}`);
  }

  if (!response.ok) {
    throw new Error(json?.message || json?.error || `熱門股服務錯誤 HTTP ${response.status}`);
  }

  const rawStocks =
    Array.isArray(json?.stocks)
      ? json.stocks
      : Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json)
          ? json
          : [];

  const stocks = rawStocks
    .map(normalizeStock)
    .filter((item: Stock | null): item is Stock => Boolean(item));

  return {
    success: Boolean(json?.success ?? true),
    stocks,
    updatedAt: json?.updatedAt || json?.updated_at || json?.date,
    message: json?.message,
    debug: json?.debug,
  };
}

export type RevenueData = {
  symbol: string;
  name: string;
  period: string;
  source: string;
  monthlyRevenue: number | null;
  previousMonthRevenue: number | null;
  lastYearMonthRevenue: number | null;
  momPercent: number | null;
  yoyPercent: number | null;
  cumulativeRevenue: number | null;
  lastYearCumulativeRevenue: number | null;
  cumulativeYoyPercent: number | null;
  revenueScore: number;
  revenueLevel: string;
  revenueReasons: string[];
};

export type RevenueDataResponse = {
  success: boolean;
  functionVersion?: string;
  inputSymbol: string;
  revenue: RevenueData | null;
  history: RevenueData[];
  message?: string;
  debug?: unknown;
};

function normalizeRevenue(raw: any): RevenueData | null {
  if (!raw) return null;

  return {
    symbol: normalizeSymbol(raw.symbol || ""),
    name: String(raw.name || raw.symbol || "").trim(),
    period: String(raw.period || ""),
    source: String(raw.source || ""),
    monthlyRevenue: raw.monthlyRevenue ?? null,
    previousMonthRevenue: raw.previousMonthRevenue ?? null,
    lastYearMonthRevenue: raw.lastYearMonthRevenue ?? null,
    momPercent: raw.momPercent ?? null,
    yoyPercent: raw.yoyPercent ?? null,
    cumulativeRevenue: raw.cumulativeRevenue ?? null,
    lastYearCumulativeRevenue: raw.lastYearCumulativeRevenue ?? null,
    cumulativeYoyPercent: raw.cumulativeYoyPercent ?? null,
    revenueScore: Number(raw.revenueScore ?? 0),
    revenueLevel: String(raw.revenueLevel || "營收未知"),
    revenueReasons: Array.isArray(raw.revenueReasons) ? raw.revenueReasons.map(String) : [],
  };
}

export async function fetchRevenueData(symbol: string): Promise<RevenueDataResponse> {
  const safeSymbol = normalizeSymbol(symbol);

  if (!safeSymbol) {
    throw new Error("請輸入股票代號");
  }

  const url = new URL(getFunctionUrl("get-revenue-data"));
  url.searchParams.set("symbol", safeSymbol);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: getHeaders(),
  });

  const text = await response.text();

  let json: any;

  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`營收資料回傳格式錯誤：${text.slice(0, 120)}`);
  }

  if (!response.ok) {
    throw new Error(json?.message || json?.error || `營收資料服務錯誤 HTTP ${response.status}`);
  }

  const revenue = normalizeRevenue(json?.revenue);
  const history = Array.isArray(json?.history)
    ? json.history.map(normalizeRevenue).filter((item: RevenueData | null): item is RevenueData => Boolean(item))
    : [];

  return {
    success: Boolean(json?.success),
    functionVersion: json?.functionVersion,
    inputSymbol: json?.inputSymbol || safeSymbol,
    revenue,
    history,
    message: json?.message,
    debug: json?.debug,
  };
}