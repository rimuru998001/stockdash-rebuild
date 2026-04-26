import { getSupabaseUrl } from "./supabaseClient";
import type { Candle, StockDataResponse } from "./types";

function functionUrl(name: string) {
  const url = getSupabaseUrl().replace(/\/$/, "");
  if (!url) throw new Error("尚未設定 VITE_SUPABASE_URL");
  return `${url}/functions/v1/${name}`;
}

function getAuthHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (anonKey) {
    headers.apikey = anonKey;
    headers.Authorization = `Bearer ${anonKey}`;
  }

  return headers;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  return 0;
}

function normalizeCandles(rawCandles: any[]): Candle[] {
  if (!Array.isArray(rawCandles)) return [];

  return rawCandles
    .map((c) => {
      const time = String(c.time ?? c.date ?? "").trim();

      return {
        time,
        open: toNumber(c.open),
        high: toNumber(c.high),
        low: toNumber(c.low),
        close: toNumber(c.close),
        volume: toNumber(c.volume),
      };
    })
    .filter((c) => {
      return (
        c.time &&
        Number.isFinite(c.open) &&
        Number.isFinite(c.high) &&
        Number.isFinite(c.low) &&
        Number.isFinite(c.close)
      );
    })
    .sort((a, b) => a.time.localeCompare(b.time));
}

function normalizeStockData(raw: any, fallbackSymbol: string): StockDataResponse {
  const requestedSymbol = String(
    raw.requestedSymbol ?? raw.inputSymbol ?? fallbackSymbol ?? "AAPL"
  ).trim();

  const yahooSymbol = String(
    raw.yahooSymbol ?? raw.resolvedSymbol ?? requestedSymbol
  ).trim();

  const name = String(raw.meta?.name ?? raw.name ?? yahooSymbol).trim();

  const currency = String(raw.meta?.currency ?? raw.currency ?? "").trim();

  const exchangeName = String(
    raw.meta?.exchangeName ?? raw.exchangeName ?? ""
  ).trim();

  const normalizedCandles = normalizeCandles(raw.candles ?? []);

  const regularMarketPrice =
    raw.meta?.regularMarketPrice ??
    raw.regularMarketPrice ??
    normalizedCandles[normalizedCandles.length - 1]?.close;

  const previousClose =
    raw.meta?.previousClose ??
    raw.previousClose ??
    normalizedCandles[normalizedCandles.length - 2]?.close;

  const regularMarketChange =
    regularMarketPrice !== undefined && previousClose !== undefined
      ? Number(regularMarketPrice) - Number(previousClose)
      : undefined;

  const regularMarketChangePercent =
    regularMarketChange !== undefined && previousClose
      ? (regularMarketChange / Number(previousClose)) * 100
      : undefined;

  return {
    success: Boolean(raw.success),
    requestedSymbol,
    yahooSymbol,
    meta: {
      symbol: requestedSymbol,
      yahooSymbol,
      name,
      currency,
      exchangeName,
      regularMarketPrice:
        regularMarketPrice !== undefined ? Number(regularMarketPrice) : undefined,
      regularMarketChange,
      regularMarketChangePercent,
    },
    candles: normalizedCandles,
    fallbackTried: raw.fallbackTried,
    message: raw.message,
  };
}

export async function fetchStockData(
  symbol: string,
  range = "6mo"
): Promise<StockDataResponse> {
  const safeSymbol = String(symbol || "AAPL").trim();

  if (!safeSymbol) {
    throw new Error("請輸入股票代碼");
  }

  const response = await fetch(functionUrl("get-stock-data"), {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      symbol: safeSymbol,
      range,
    }),
  });

  const text = await response.text();

  let raw: any;

  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`股票資料解析失敗：${text.slice(0, 200)}`);
  }

  const data = normalizeStockData(raw, safeSymbol);

  if (!response.ok || !data.success) {
    throw new Error(data.message || `股票資料取得失敗 HTTP ${response.status}`);
  }

  if (!data.candles.length) {
    throw new Error("股票資料沒有可用的 K 線資料");
  }

  return data;
}

export async function fetchHotStocksFromEdge() {
  const response = await fetch(functionUrl("get-hot-stocks"), {
    method: "GET",
    headers: getAuthHeaders(),
  });

  const text = await response.text();

  let data: any;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`熱門股服務解析失敗：${text.slice(0, 200)}`);
  }

  if (!response.ok || !Array.isArray(data.stocks)) {
    throw new Error(data.message || `熱門股服務失敗 HTTP ${response.status}`);
  }

  return data as {
    success: boolean;
    source: string;
    updatedAt: string;
    stocks: any[];
    message?: string;
  };
}