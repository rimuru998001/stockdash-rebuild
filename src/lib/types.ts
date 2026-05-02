export type Stock = {
  symbol: string;
  name: string;
};

export type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type StockMeta = {
  symbol: string;
  yahooSymbol: string;
  name: string;
  currency: string;
  exchangeName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
};

export type StockDataResponse = {
  success: boolean;
  requestedSymbol: string;
  yahooSymbol: string;
  meta: StockMeta;
  candles: Candle[];
  fallbackTried?: unknown;
  message?: string;
};

export type ScanResult = Stock & {
  close: number;
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  rsi14: number | null;
  volumeRatio: number | null;

  isMA5AboveMA20: boolean;
  isBreak20High: boolean;

  /**
   * 原始技術 / 資金分數。
   * 目前保留 score 給舊版 Scanner 使用。
   */
  score: number;
  technicalScore?: number | null;
  moneyFlowScore?: number | null;
  riskPenalty?: number | null;

  /**
   * 合併營收後的最終分數。
   * finalScore = 技術資金分 + 營收分修正 - 風險修正
   */
  finalScore?: number | null;

  strictPass: boolean;
  reasons: string[];

  /**
   * 黑馬分類：保留新舊兩套命名，避免 Scanner.tsx 報錯
   */
  type?: string;
  category?: string;
  finalCategory?: string | null;

  riskLevel?: string;
  positionLevel?: string;
  positionLabel?: string;

  /**
   * 風險警示，例如：
   * RSI過熱、高位放量、20日漲幅過大、營收衰退、流動性不足
   */
  warningFlags?: string[];

  /**
   * 位階資訊：保留新舊兩套命名
   */
  oneYearGain?: number | null;
  oneYearReturn?: number | null;

  gainFromLow?: number | null;
  distanceFromLow52w?: number | null;

  pullbackFromHigh?: number | null;
  distanceFromHigh52w?: number | null;

  positionRatio?: number | null;

  twentyDayGain?: number | null;
  return20d?: number | null;

  /**
   * 營收資料
   */
  revenueScore?: number | null;
  revenueLevel?: string | null;
  revenuePeriod?: string | null;
  revenueYoY?: number | null;
  revenueMoM?: number | null;
  cumulativeRevenueYoY?: number | null;
  revenueReasons?: string[];
  revenueSource?: string | null;
};

export type PoolKey =
  | "all"
  | "largeCap"
  | "semiconductor"
  | "aiServer"
  | "finance"
  | "shipping"
  | "energy"
  | "etf"
  | "midHot"
  | "custom"
  | "hot";