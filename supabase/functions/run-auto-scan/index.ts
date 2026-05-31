export {};

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
  serve: (
    handler: (req: Request) => Response | Promise<Response>,
  ) => void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json; charset=utf-8",
};

type Stock = {
  symbol: string;
  name: string;
};

type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type StockAiAnalysis = {
  summary: string;
  riskPoints: string[];
  actionNote: string;
};

type StockAiAnalysisMap = Record<string, StockAiAnalysis>;

type AlertGroupType = "strong" | "watch" | "risk";

type RecentAlert = {
  finalScore: number | null;
  createdAt: string | null;
};

type ScanResult = {
  symbol: string;
  name: string;

  close: number;
  rsi14: number | null;
  ma20: number | null;
  ma60: number | null;
  volumeRatio: number | null;
  return20d: number | null;
  distanceFromLow52w: number | null;

  technicalScore: number;
  moneyFlowScore: number;
  riskPenalty: number;
  revenueScore: number | null;
  holderScore: number | null;

  revenueLevel: string | null;
  holderLevel: string | null;

  revenueYoY: number | null;
  cumulativeRevenueYoY: number | null;
  largeHolderRatio: number | null;
  whaleHolderRatio: number | null;
  retailHolderRatio: number | null;

  finalScore: number;
  finalCategory: string;
  riskLevel: string;
  warningFlags: string[];
  reasons: string[];
};

const BATCH_SIZE = 10;
const MAX_STRONG_ALERTS = 5;
const MAX_WATCH_ALERTS = 6;
const MAX_RISK_ALERTS = 2;
const MAX_BATCH_TOP_ALERTS = 3;

function getFunctionUrl(functionName: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL");
  }

  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/${functionName}`;
}

function getRestUrl(path: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL");
  }

  return `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`;
}

function getHeaders() {
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (anonKey) {
    headers.apikey = anonKey;
    headers.Authorization = `Bearer ${anonKey}`;
  }

  return headers;
}

function getDatabaseHeaders() {
  const apiKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_ANON_KEY");

  if (!apiKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY");
  }

  return {
    "Content-Type": "application/json",
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
  };
}

function cleanSymbol(symbol: string) {
  return String(symbol || "")
    .trim()
    .toUpperCase()
    .replace(".TW", "")
    .replace(".TWO", "");
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function avg(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sma(values: number[], period: number) {
  if (values.length < period) return null;
  return avg(values.slice(-period));
}

function calcRsi(closes: number[], period = 14) {
  if (closes.length <= period) return null;

  const recent = closes.slice(-(period + 1));
  let gain = 0;
  let loss = 0;

  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i] - recent[i - 1];

    if (diff >= 0) gain += diff;
    else loss += Math.abs(diff);
  }

  const avgGain = gain / period;
  const avgLoss = loss / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;

  return 100 - 100 / (1 + rs);
}

function normalizeCandle(raw: any): Candle | null {
  const time = String(raw?.time || raw?.date || raw?.period || "");
  const close = Number(raw?.close ?? 0);

  if (!time || !Number.isFinite(close) || close <= 0) return null;

  return {
    time,
    open: Number(raw?.open ?? close),
    high: Number(raw?.high ?? close),
    low: Number(raw?.low ?? close),
    close,
    volume: Number(raw?.volume ?? 0),
  };
}

async function fetchJson(functionName: string, params: Record<string, string> = {}) {
  const url = new URL(getFunctionUrl(functionName));

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: getHeaders(),
  });

  const text = await response.text();

  let json: any;

  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${functionName} 回傳格式錯誤：${text.slice(0, 120)}`);
  }

  if (!response.ok) {
    throw new Error(
      json?.message || json?.error || `${functionName} HTTP ${response.status}`,
    );
  }

  return json;
}

function normalizeHotPoolStock(item: any): Stock | null {
  const symbol = cleanSymbol(item?.symbol || item?.code || item?.代號 || "");
  const name = String(
    item?.name ||
      item?.stockName ||
      item?.名稱 ||
      item?.股票名稱 ||
      item?.公司名稱 ||
      item?.symbol ||
      symbol,
  ).trim();

  if (!symbol) return null;

  return {
    symbol,
    name: name || symbol,
  };
}

async function fetchCachedHotPool() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const url = new URL(getRestUrl("hot_pool_cache"));

    url.searchParams.set("select", "symbol,name,rank");
    url.searchParams.set("pool_date", `eq.${today}`);
    url.searchParams.set("order", "rank.asc");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: getDatabaseHeaders(),
    });

    const rows = await response.json().catch(() => null);

    if (!response.ok) {
      console.warn("hot_pool_cache lookup failed", rows);
      return null;
    }

    if (!Array.isArray(rows) || rows.length === 0) return null;

    const stocks = rows
      .map(normalizeHotPoolStock)
      .filter((item: Stock | null): item is Stock => Boolean(item));

    return stocks.length > 0 ? stocks : null;
  } catch (error) {
    console.warn(
      "hot_pool_cache lookup skipped",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

async function fetchHotPool() {
  const cachedStocks = await fetchCachedHotPool();

  if (cachedStocks && cachedStocks.length > 0) {
    return cachedStocks;
  }

  const json = await fetchJson("get-hot-stocks");

  const rawStocks = Array.isArray(json?.stocks)
    ? json.stocks
    : Array.isArray(json?.data)
      ? json.data
      : [];

  const stocks: Stock[] = rawStocks
    .map(normalizeHotPoolStock)
    .filter((item: Stock | null): item is Stock => Boolean(item));

  return stocks;
}

async function fetchCandles(symbol: string) {
  const json = await fetchJson("get-stock-data", {
    symbol,
    range: "1y",
  });

  const candles = Array.isArray(json?.candles)
    ? json.candles
        .map(normalizeCandle)
        .filter((item: Candle | null): item is Candle => Boolean(item))
    : [];

  return {
    name:
      json?.name ||
      json?.twStockName ||
      json?.meta?.name ||
      json?.meta?.longName ||
      json?.meta?.shortName ||
      symbol,
    candles,
  };
}

async function fetchRevenue(symbol: string) {
  try {
    const json = await fetchJson("get-revenue-data", { symbol });
    const revenue = json?.revenue;

    if (!revenue) return null;

    return {
      revenueScore: Number(revenue?.revenueScore ?? 0),
      revenueLevel: String(revenue?.revenueLevel || "營收未知"),
      revenueYoY:
        revenue?.yoyPercent === null || revenue?.yoyPercent === undefined
          ? null
          : Number(revenue.yoyPercent),
      cumulativeRevenueYoY:
        revenue?.cumulativeYoyPercent === null ||
        revenue?.cumulativeYoyPercent === undefined
          ? null
          : Number(revenue.cumulativeYoyPercent),
      reasons: Array.isArray(revenue?.revenueReasons)
        ? revenue.revenueReasons.map(String)
        : [],
    };
  } catch (error) {
    return {
      revenueScore: null,
      revenueLevel: "營收取得失敗",
      revenueYoY: null,
      cumulativeRevenueYoY: null,
      reasons: ["營收資料取得失敗"],
    };
  }
}

async function fetchHolder(symbol: string) {
  try {
    const json = await fetchJson("get-holder-data", { symbol });
    const holder = json?.holder;

    if (!holder) return null;

    return {
      holderScore: Number(holder?.holderScore ?? 0),
      holderLevel: String(holder?.holderLevel || "籌碼未知"),
      largeHolderRatio:
        holder?.largeHolderRatio === null || holder?.largeHolderRatio === undefined
          ? null
          : Number(holder.largeHolderRatio),
      whaleHolderRatio:
        holder?.whaleHolderRatio === null || holder?.whaleHolderRatio === undefined
          ? null
          : Number(holder.whaleHolderRatio),
      retailHolderRatio:
        holder?.retailHolderRatio === null || holder?.retailHolderRatio === undefined
          ? null
          : Number(holder.retailHolderRatio),
      reasons: Array.isArray(holder?.reasons) ? holder.reasons.map(String) : [],
    };
  } catch (error) {
    return {
      holderScore: null,
      holderLevel: "籌碼取得失敗",
      largeHolderRatio: null,
      whaleHolderRatio: null,
      retailHolderRatio: null,
      reasons: ["籌碼資料取得失敗"],
    };
  }
}

function calcTechnical(candles: Candle[]) {
  const valid = candles.filter(
    (c) =>
      Number.isFinite(c.close) &&
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.volume),
  );

  if (valid.length < 60) {
    return null;
  }

  const last = valid[valid.length - 1];
  const closes = valid.map((c) => c.close);

  const ma5 = sma(closes, 5);
  const ma20 = sma(closes, 20);
  const ma60 = sma(closes, 60);
  const rsi14 = calcRsi(closes, 14);

  const recent20 = valid.slice(-20);
  const recent5 = valid.slice(-5);

  const avgVol20 =
    recent20.reduce((sum, c) => sum + (c.volume || 0), 0) / recent20.length;
  const avgVol5 =
    recent5.reduce((sum, c) => sum + (c.volume || 0), 0) / recent5.length;

  const latestVolume = last.volume || 0;
  const volumeRatio = avgVol20 > 0 ? latestVolume / avgVol20 : null;
  const volumeRatio5to20 = avgVol20 > 0 ? avgVol5 / avgVol20 : null;

  const high20 = Math.max(...recent20.map((c) => c.high));
  const low52w = Math.min(...valid.map((c) => c.low));
  const high52w = Math.max(...valid.map((c) => c.high));

  const close20dAgo = valid.length >= 21 ? valid[valid.length - 21].close : null;

  const return20d =
    close20dAgo && close20dAgo > 0
      ? ((last.close - close20dAgo) / close20dAgo) * 100
      : null;

  const distanceFromLow52w =
    low52w > 0 ? ((last.close - low52w) / low52w) * 100 : null;

  const distanceFromHigh52w =
    high52w > 0 ? ((last.close - high52w) / high52w) * 100 : null;

  const reasons: string[] = [];
  const warningFlags: string[] = [];

  let technicalScore = 0;
  let moneyFlowScore = 0;
  let riskPenalty = 0;

  const activeDays20 = recent20.filter((c) => (c.volume || 0) > 0).length;

  const MIN_LATEST_VOLUME = 100_000;
  const MIN_AVG_VOLUME_20 = 100_000;

  const liquidityBad =
    latestVolume < MIN_LATEST_VOLUME ||
    avgVol20 < MIN_AVG_VOLUME_20 ||
    activeDays20 < 15;

  if (liquidityBad) {
    return {
      close: last.close,
      ma20,
      ma60,
      rsi14,
      volumeRatio,
      return20d,
      distanceFromLow52w,
      distanceFromHigh52w,
      technicalScore: 0,
      moneyFlowScore: 0,
      riskPenalty: 100,
      baseScore: 0,
      baseCategory: "排除",
      riskLevel: "極高",
      warningFlags: ["流動性不足"],
      reasons: [
        "流動性不足，排除掃描",
        `最新成交量 ${Math.round(latestVolume).toLocaleString()}`,
        `20日均量 ${Math.round(avgVol20).toLocaleString()}`,
      ],
    };
  }

  if (ma20 !== null && last.close > ma20) {
    technicalScore += 10;
    reasons.push("價格站上20MA");
  }

  if (ma60 !== null && last.close > ma60) {
    technicalScore += 8;
    reasons.push("價格站上60MA");
  }

  if (ma5 !== null && ma20 !== null && ma5 > ma20) {
    technicalScore += 9;
    reasons.push("5MA > 20MA，短線趨勢轉強");
  }

  if (last.close > high20) {
    technicalScore += 10;
    reasons.push("突破20日高點");
  }

  if (rsi14 !== null && rsi14 >= 50 && rsi14 <= 68) {
    technicalScore += 10;
    reasons.push("RSI 50~68，動能健康");
  } else if (rsi14 !== null && rsi14 > 68 && rsi14 <= 75) {
    technicalScore += 4;
    riskPenalty += 4;
    reasons.push("RSI 偏強但接近過熱");
  } else if (rsi14 !== null && rsi14 > 75) {
    riskPenalty += 14;
    warningFlags.push("RSI過熱");
    reasons.push("RSI > 75，短線過熱");
  }

  technicalScore = Math.min(35, technicalScore);

  if (volumeRatio !== null && volumeRatio >= 3) {
    moneyFlowScore += 18;
    reasons.push(`成交量強烈放大，量比 ${volumeRatio.toFixed(2)}x`);
  } else if (volumeRatio !== null && volumeRatio >= 2) {
    moneyFlowScore += 14;
    reasons.push(`成交量明顯放大，量比 ${volumeRatio.toFixed(2)}x`);
  } else if (volumeRatio !== null && volumeRatio >= 1.3) {
    moneyFlowScore += 9;
    reasons.push(`成交量溫和放大，量比 ${volumeRatio.toFixed(2)}x`);
  }

  if (volumeRatio5to20 !== null && volumeRatio5to20 >= 1.5) {
    moneyFlowScore += 7;
    reasons.push("5日均量高於20日均量，資金有延續跡象");
  }

  moneyFlowScore = Math.min(25, moneyFlowScore);

  if ((return20d ?? 0) > 45) {
    riskPenalty += 18;
    warningFlags.push("20日急漲");
    reasons.push("近20日漲幅過大，短線過熱");
  } else if ((return20d ?? 0) > 30) {
    riskPenalty += 8;
    warningFlags.push("短線偏熱");
    reasons.push("近20日漲幅偏大");
  }

  if ((distanceFromLow52w ?? 0) > 350) {
    riskPenalty += 22;
    warningFlags.push("遠離年低");
    reasons.push("距年低漲幅過大，已非低位黑馬");
  } else if ((distanceFromLow52w ?? 0) > 200) {
    riskPenalty += 12;
    warningFlags.push("位階偏高");
    reasons.push("股價已大幅遠離低位");
  }

  if ((distanceFromHigh52w ?? -100) > -10) {
    riskPenalty += 6;
    reasons.push("接近一年高點，追高風險提高");
  }

  const baseScore = clamp(Math.round(technicalScore + moneyFlowScore + 40 - riskPenalty));

  let baseCategory = "觀察名單";
  let riskLevel = "中";

  const baseMomentum =
    technicalScore >= 20 &&
    moneyFlowScore >= 10 &&
    ma20 !== null &&
    last.close > ma20;

  if (riskPenalty >= 35) {
    baseCategory = "高風險異動";
    riskLevel = "極高";
  } else if (baseMomentum && moneyFlowScore >= 18 && technicalScore >= 25) {
    baseCategory = "資金異動";
    riskLevel = "中";
  } else if (baseMomentum && baseScore >= 75 && (return20d ?? 0) < 35) {
    baseCategory = "真黑馬";
    riskLevel = "中低";
  } else if (baseMomentum && baseScore >= 70) {
    baseCategory = "趨勢續攻";
    riskLevel = "中";
  } else if (baseMomentum && ((distanceFromLow52w ?? 0) > 200)) {
    baseCategory = "高位強勢";
    riskLevel = "高";
  }

  return {
    close: last.close,
    ma20,
    ma60,
    rsi14,
    volumeRatio,
    return20d,
    distanceFromLow52w,
    distanceFromHigh52w,
    technicalScore,
    moneyFlowScore,
    riskPenalty,
    baseScore,
    baseCategory,
    riskLevel,
    warningFlags,
    reasons,
  };
}

function calcFinal(args: {
  baseScore: number;
  baseCategory: string;
  riskLevel: string;
  technicalScore: number;
  moneyFlowScore: number;
  riskPenalty: number;
  revenueScore: number | null;
  holderScore: number | null;
  revenueYoY: number | null;
  cumulativeRevenueYoY: number | null;
}) {
  const revenueNormalized =
    args.revenueScore != null ? (args.revenueScore / 30) * 100 : 40;

  const holderNormalized =
    args.holderScore != null ? (args.holderScore / 30) * 100 : 45;

  let finalScore = Math.round(
    args.baseScore * 0.55 + revenueNormalized * 0.25 + holderNormalized * 0.2,
  );

  if (args.revenueScore != null && args.revenueScore <= 5) finalScore -= 8;
  if (args.holderScore != null && args.holderScore <= 5) finalScore -= 5;

  if (args.riskLevel === "極高" || args.baseCategory === "高風險異動") {
    finalScore -= 15;
  }

  if (args.riskPenalty >= 30) finalScore -= 10;

  finalScore = clamp(finalScore);

  const revenueStrong = (args.revenueScore ?? 0) >= 18;
  const holderStrong = (args.holderScore ?? 0) >= 18;

  let finalCategory = args.baseCategory;

  if (args.baseCategory === "排除") {
    finalCategory = "排除";
  } else if (args.riskLevel === "極高" || args.baseCategory === "高風險異動") {
    finalCategory = "高風險異動";
  } else if (
    args.baseCategory === "資金異動" &&
    (revenueStrong || holderStrong) &&
    finalScore >= 72
  ) {
    finalCategory = "真黑馬候選";
  } else if (
    args.baseCategory === "真黑馬" &&
    revenueStrong &&
    holderStrong &&
    finalScore >= 75
  ) {
    finalCategory = "真黑馬";
  } else if (
    args.baseCategory === "高位強勢" &&
    (revenueStrong || holderStrong)
  ) {
    finalCategory = "高位成長";
  }

  return {
    finalScore,
    finalCategory,
  };
}

function shouldDeepScan(technical: ReturnType<typeof calcTechnical>) {
  if (!technical) return false;
  if (technical.baseCategory === "排除") return false;

  return (
    technical.baseScore >= 55 ||
    technical.moneyFlowScore >= 14 ||
    technical.technicalScore >= 25
  );
}

function buildResult(args: {
  stock: Stock;
  name: string;
  technical: NonNullable<ReturnType<typeof calcTechnical>>;
  revenue: Awaited<ReturnType<typeof fetchRevenue>>;
  holder: Awaited<ReturnType<typeof fetchHolder>>;
}) {
  const revenueScore = args.revenue?.revenueScore ?? null;
  const holderScore = args.holder?.holderScore ?? null;

  const final = calcFinal({
    baseScore: args.technical.baseScore,
    baseCategory: args.technical.baseCategory,
    riskLevel: args.technical.riskLevel,
    technicalScore: args.technical.technicalScore,
    moneyFlowScore: args.technical.moneyFlowScore,
    riskPenalty: args.technical.riskPenalty,
    revenueScore,
    holderScore,
    revenueYoY: args.revenue?.revenueYoY ?? null,
    cumulativeRevenueYoY: args.revenue?.cumulativeRevenueYoY ?? null,
  });

  const warningFlags = [...args.technical.warningFlags];

  if (revenueScore !== null && revenueScore <= 5) warningFlags.push("營收偏弱");
  if (holderScore !== null && holderScore <= 5) warningFlags.push("籌碼分散");
  if (holderScore !== null && holderScore >= 24) warningFlags.push("籌碼集中");

  const reasons = [
    ...args.technical.reasons,
    ...(args.revenue?.reasons || []).map((reason: string) => `營收：${reason}`),
    ...(args.holder?.reasons || []).map((reason: string) => `籌碼：${reason}`),
  ];

  return {
    symbol: args.stock.symbol,
    name: args.stock.name || args.name || args.stock.symbol,

    close: args.technical.close,
    rsi14: args.technical.rsi14,
    ma20: args.technical.ma20,
    ma60: args.technical.ma60,
    volumeRatio: args.technical.volumeRatio,
    return20d: args.technical.return20d,
    distanceFromLow52w: args.technical.distanceFromLow52w,

    technicalScore: args.technical.baseScore,
    moneyFlowScore: args.technical.moneyFlowScore,
    riskPenalty: args.technical.riskPenalty,

    revenueScore,
    holderScore,

    revenueLevel: args.revenue?.revenueLevel ?? null,
    holderLevel: args.holder?.holderLevel ?? null,

    revenueYoY: args.revenue?.revenueYoY ?? null,
    cumulativeRevenueYoY: args.revenue?.cumulativeRevenueYoY ?? null,
    largeHolderRatio: args.holder?.largeHolderRatio ?? null,
    whaleHolderRatio: args.holder?.whaleHolderRatio ?? null,
    retailHolderRatio: args.holder?.retailHolderRatio ?? null,

    finalScore: final.finalScore,
    finalCategory: final.finalCategory,
    riskLevel: args.technical.riskLevel,
    warningFlags: Array.from(new Set(warningFlags)),
    reasons,
  } satisfies ScanResult;
}

function shouldIncludeRecentAlert(
  result: ScanResult,
  recentAlerts: Map<string, RecentAlert>,
) {
  const recent = recentAlerts.get(result.symbol);

  if (!recent) return true;
  if (recent.finalScore === null || !Number.isFinite(recent.finalScore)) {
    return false;
  }

  return result.finalScore >= recent.finalScore + 5;
}

function splitAlertGroups(
  results: ScanResult[],
  recentAlerts = new Map<string, RecentAlert>(),
) {
  const sorted = results.slice().sort((a, b) => b.finalScore - a.finalScore);

  const batchTop = sorted.slice(0, MAX_BATCH_TOP_ALERTS);

  const strong = sorted
    .filter(
      (r) =>
        r.finalScore >= 82 &&
        ["真黑馬", "真黑馬候選"].includes(r.finalCategory) &&
        r.riskLevel !== "極高" &&
        ((r.holderScore ?? 0) >= 18 || (r.revenueScore ?? 0) >= 18),
    )
    .filter((r) => shouldIncludeRecentAlert(r, recentAlerts))
    .slice(0, MAX_STRONG_ALERTS);

  const strongKeys = new Set(strong.map((r) => r.symbol));

  const watch = sorted
    .filter(
      (r) =>
        !strongKeys.has(r.symbol) &&
        r.finalScore >= 68 &&
        ["資金異動", "趨勢續攻", "高位成長", "觀察名單"].includes(
          r.finalCategory,
        ) &&
        r.riskLevel !== "極高",
    )
    .filter((r) => shouldIncludeRecentAlert(r, recentAlerts))
    .slice(0, MAX_WATCH_ALERTS);

  const usedKeys = new Set([...strong, ...watch].map((r) => r.symbol));

  const risk = sorted
    .filter(
      (r) =>
        !usedKeys.has(r.symbol) &&
        (r.finalCategory === "高風險異動" ||
          r.warningFlags.some((flag) =>
            ["RSI過熱", "20日急漲", "遠離年低", "位階偏高"].includes(flag),
          )),
    )
    .filter((r) => shouldIncludeRecentAlert(r, recentAlerts))
    .slice(0, MAX_RISK_ALERTS);

  return {
    batchTop,
    strong,
    watch,
    risk,
  };
}

async function fetchRecentAlertHistory(symbols: string[]) {
  const uniqueSymbols = Array.from(
    new Set(symbols.map(cleanSymbol).filter(Boolean)),
  );
  const recentAlerts = new Map<string, RecentAlert>();

  if (uniqueSymbols.length === 0) return recentAlerts;

  try {
    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const inSymbols = uniqueSymbols.join(",");
    const url = new URL(getRestUrl("alert_history"));

    url.searchParams.set("select", "symbol,final_score,created_at");
    url.searchParams.set("symbol", `in.(${inSymbols})`);
    url.searchParams.set("created_at", `gte.${since}`);
    url.searchParams.set("order", "created_at.desc");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: getDatabaseHeaders(),
    });

    const rows = await response.json().catch(() => null);

    if (!response.ok) {
      console.warn("alert_history recent lookup failed", rows);
      return recentAlerts;
    }

    if (!Array.isArray(rows)) return recentAlerts;

    rows.forEach((row: any) => {
      const symbol = cleanSymbol(row?.symbol || "");

      if (!symbol || recentAlerts.has(symbol)) return;

      recentAlerts.set(symbol, {
        finalScore:
          row?.final_score === null || row?.final_score === undefined
            ? null
            : Number(row.final_score),
        createdAt:
          row?.created_at === null || row?.created_at === undefined
            ? null
            : String(row.created_at),
      });
    });
  } catch (error) {
    console.warn(
      "alert_history recent lookup skipped",
      error instanceof Error ? error.message : String(error),
    );
  }

  return recentAlerts;
}

async function writeAlertHistory(
  groups: ReturnType<typeof splitAlertGroups>,
  batch: number,
) {
  const groupEntries: Array<[AlertGroupType, ScanResult[]]> = [
    ["strong", groups.strong],
    ["watch", groups.watch],
    ["risk", groups.risk],
  ];

  const rows = groupEntries.flatMap(([alertType, results]) =>
    results.map((result) => ({
      symbol: result.symbol,
      name: result.name,
      final_category: result.finalCategory,
      final_score: result.finalScore,
      alert_type: alertType,
      batch,
    })),
  );

  if (rows.length === 0) return;

  try {
    const response = await fetch(getRestUrl("alert_history"), {
      method: "POST",
      headers: {
        ...getDatabaseHeaders(),
        Prefer: "return=minimal",
      },
      body: JSON.stringify(rows),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn("alert_history insert failed", response.status, text);
    }
  } catch (error) {
    console.warn(
      "alert_history insert skipped",
      error instanceof Error ? error.message : String(error),
    );
  }
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${value.toFixed(1)}%`;
}

function formatNumber(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return value.toFixed(digits);
}

function formatAiAnalysis(analysis: StockAiAnalysis | undefined) {
  if (!analysis) return null;

  const riskText = analysis.riskPoints.slice(0, 2).join("；");

  return [
    `   AI簡評：`,
    `   摘要：${analysis.summary || "-"}`,
    `   風險：${riskText || "-"}`,
    `   觀察：${analysis.actionNote || "-"}`,
  ].join("\n");
}

function formatStockLine(
  result: ScanResult,
  index: number,
  aiAnalysis?: StockAiAnalysis,
) {
  const reasons = result.reasons.slice(0, 3).join("；");
  const lines = [
    `${index + 1}. ${result.symbol} ${result.name}`,
    `   類型：${result.finalCategory}｜總分：${result.finalScore}`,
    `   技術：${result.technicalScore}｜資金：${result.moneyFlowScore}｜營收：${result.revenueScore ?? "-"}/30｜籌碼：${result.holderScore ?? "-"}/30`,
    `   YoY：${formatPercent(result.revenueYoY)}｜大戶：${formatPercent(result.largeHolderRatio)}｜量比：${formatNumber(result.volumeRatio, 2)}x`,
    `   原因：${reasons || "-"}`,
  ];

  const aiText = formatAiAnalysis(aiAnalysis);

  if (aiText) lines.push(aiText);

  return lines.join("\n");
}

function normalizeAiAnalysis(value: any): StockAiAnalysis | null {
  const summary = String(value?.summary || "").trim();
  const riskPoints = Array.isArray(value?.riskPoints)
    ? value.riskPoints.map((item: any) => String(item || "").trim()).filter(Boolean)
    : [];
  const actionNote = String(value?.actionNote || "").trim();

  if (!summary && riskPoints.length === 0 && !actionNote) return null;

  return {
    summary,
    riskPoints,
    actionNote,
  };
}

async function fetchStockAiAnalysis(
  result: ScanResult,
  autoScanSecret: string,
) {
  const url = new URL(getFunctionUrl("analyze-stock-ai"));
  url.searchParams.set("secret", autoScanSecret);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      symbol: result.symbol,
      name: result.name,
      finalCategory: result.finalCategory,
      finalScore: result.finalScore,
      technicalScore: result.technicalScore,
      moneyFlowScore: result.moneyFlowScore,
      revenueScore: result.revenueScore,
      holderScore: result.holderScore,
      revenueYoY: result.revenueYoY,
      cumulativeRevenueYoY: result.cumulativeRevenueYoY,
      largeHolderRatio: result.largeHolderRatio,
      volumeRatio: result.volumeRatio,
      return20d: result.return20d,
      riskLevel: result.riskLevel,
      warningFlags: result.warningFlags,
      reasons: result.reasons,
    }),
  });

  const json = await response.json().catch(() => null);

  if (!response.ok || !json?.success) {
    console.warn("analyze-stock-ai skipped", result.symbol, response.status);
    return null;
  }

  return normalizeAiAnalysis(json?.analysis);
}

async function fetchStrongAiAnalyses(groups: ReturnType<typeof splitAlertGroups>) {
  const autoScanSecret = Deno.env.get("AUTO_SCAN_SECRET");
  const analyses: StockAiAnalysisMap = {};

  if (!autoScanSecret) return analyses;

  const strongTargets = groups.strong.slice(0, 2);

  await Promise.all(
    strongTargets.map(async (result) => {
      try {
        const analysis = await fetchStockAiAnalysis(result, autoScanSecret);

        if (analysis) analyses[result.symbol] = analysis;
      } catch (error) {
        console.warn(
          "analyze-stock-ai failed",
          result.symbol,
          error instanceof Error ? error.message : String(error),
        );
      }
    }),
  );

  return analyses;
}

function buildTelegramReport(args: {
  batch: number;
  startIndex: number;
  endIndex: number;
  totalPoolCount: number;
  scannedCount: number;
  successCount: number;
  skippedCount: number;
  groups: ReturnType<typeof splitAlertGroups>;
  strongAiAnalyses?: StockAiAnalysisMap;
}) {
  const now = new Date().toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
  });

  const batchTopText =
    args.groups.batchTop.length > 0
      ? args.groups.batchTop
          .map((result, index) => formatStockLine(result, index))
          .join("\n\n")
      : "無";

  const strongText =
    args.groups.strong.length > 0
      ? args.groups.strong
          .map((result, index) =>
            formatStockLine(
              result,
              index,
              args.strongAiAnalyses?.[result.symbol],
            ),
          )
          .join("\n\n")
      : "無";

  const watchText =
    args.groups.watch.length > 0
      ? args.groups.watch
          .map((result, index) => formatStockLine(result, index))
          .join("\n\n")
      : "無";

  const riskText =
    args.groups.risk.length > 0
      ? args.groups.risk
          .map((result, index) => formatStockLine(result, index))
          .join("\n\n")
      : "無";

  return [
    `🚨 StockDash 自動黑馬雷達`,
    `時間：${now}`,
    `批次：batch ${args.batch}｜範圍：第 ${args.startIndex}～${args.endIndex} 支 / 共 ${args.totalPoolCount} 支`,
    `掃描：${args.scannedCount} 支｜成功：${args.successCount}｜略過：${args.skippedCount}`,
    ``,
    `【本批最高分 Top ${MAX_BATCH_TOP_ALERTS}】`,
    batchTopText,
    ``,
    `【強力候選】最多 ${MAX_STRONG_ALERTS} 支`,
    strongText,
    ``,
    `【觀察名單】最多 ${MAX_WATCH_ALERTS} 支`,
    watchText,
    ``,
    `【高風險提醒】最多 ${MAX_RISK_ALERTS} 支`,
    riskText,
  ].join("\n");
}

async function sendTelegramMessage(text: string) {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");

  if (!botToken) throw new Error("Missing TELEGRAM_BOT_TOKEN");
  if (!chatId) throw new Error("Missing TELEGRAM_CHAT_ID");

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    },
  );

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `Telegram API error HTTP ${response.status}: ${JSON.stringify(json)}`,
    );
  }

  return json;
}

async function scanOne(stock: Stock) {
  const stockData = await fetchCandles(stock.symbol);
  const technical = calcTechnical(stockData.candles);

  if (!technical) return null;

  if (!shouldDeepScan(technical)) {
    return buildResult({
      stock,
      name: stockData.name,
      technical,
      revenue: null,
      holder: null,
    });
  }

  const [revenue, holder] = await Promise.all([
    fetchRevenue(stock.symbol),
    fetchHolder(stock.symbol),
  ]);

  return buildResult({
    stock,
    name: stockData.name,
    technical,
    revenue,
    holder,
  });
}

async function runAutoScan(batch = 0) {
  const allStocks = await fetchHotPool();

  const safeBatch = Math.max(0, Math.floor(Number.isFinite(batch) ? batch : 0));
  const start = safeBatch * BATCH_SIZE;
  const end = start + BATCH_SIZE;
  const stocks = allStocks.slice(start, end);

  const results: ScanResult[] = [];
  let successCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < stocks.length; i++) {
    const stock = stocks[i];

    try {
      const result = await scanOne(stock);

      if (result) {
        results.push(result);
        successCount++;
      } else {
        skippedCount++;
      }
    } catch (error) {
      skippedCount++;
    }

    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  const recentAlerts = await fetchRecentAlertHistory(
    results.map((result) => result.symbol),
  );
  const groups = splitAlertGroups(results, recentAlerts);
  const strongAiAnalyses = await fetchStrongAiAnalyses(groups);
  const report = buildTelegramReport({
    batch: safeBatch,
    startIndex: stocks.length > 0 ? start + 1 : start,
    endIndex: Math.min(end, allStocks.length),
    totalPoolCount: allStocks.length,
    scannedCount: stocks.length,
    successCount,
    skippedCount,
    groups,
    strongAiAnalyses,
  });

  const telegramResult = await sendTelegramMessage(report);

  await writeAlertHistory(groups, safeBatch);

  return {
    stocks,
    results,
    groups,
    report,
    telegramResult,
    stats: {
      batch: safeBatch,
      startIndex: stocks.length > 0 ? start + 1 : start,
      endIndex: Math.min(end, allStocks.length),
      totalPoolCount: allStocks.length,
      scannedCount: stocks.length,
      successCount,
      skippedCount,
      strongCount: groups.strong.length,
      watchCount: groups.watch.length,
      riskCount: groups.risk.length,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const autoScanSecret = Deno.env.get("AUTO_SCAN_SECRET");
    const url = new URL(req.url);
    const secretFromQuery = url.searchParams.get("secret");

    if (!autoScanSecret) {
      throw new Error("Missing AUTO_SCAN_SECRET");
    }

    if (secretFromQuery !== autoScanSecret) {
      return new Response(
        JSON.stringify({
          success: false,
          functionVersion: "run-auto-scan-v1-batch",
          message: "Unauthorized",
        }),
        {
          status: 401,
          headers: jsonHeaders,
        },
      );
    }

    const batch = Number(url.searchParams.get("batch") || 0);
    const data = await runAutoScan(batch);

    return new Response(
      JSON.stringify({
        success: true,
        functionVersion: "run-auto-scan-v1-batch",
        stats: data.stats,
        groups: data.groups,
        report: data.report,
      }),
      {
        status: 200,
        headers: jsonHeaders,
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        functionVersion: "run-auto-scan-v1-batch",
        message: "run-auto-scan Edge Function error",
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 200,
        headers: jsonHeaders,
      },
    );
  }
});