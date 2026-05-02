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

  score: number;
  technicalScore?: number | null;
  moneyFlowScore?: number | null;
  riskPenalty?: number | null;
  finalScore?: number | null;

  strictPass: boolean;
  reasons: string[];

  type?: string;
  category?: string;
  finalCategory?: string | null;

  riskLevel?: string;
  positionLevel?: string;
  positionLabel?: string;

  warningFlags?: string[];

  oneYearGain?: number | null;
  oneYearReturn?: number | null;

  gainFromLow?: number | null;
  distanceFromLow52w?: number | null;

  pullbackFromHigh?: number | null;
  distanceFromHigh52w?: number | null;

  positionRatio?: number | null;

  twentyDayGain?: number | null;
  return20d?: number | null;

  // 營收資料
  revenueScore?: number | null;
  revenueLevel?: string | null;
  revenuePeriod?: string | null;
  revenueYoY?: number | null;
  revenueMoM?: number | null;
  cumulativeRevenueYoY?: number | null;
  revenueReasons?: string[];
  revenueSource?: string | null;

  // 集保籌碼資料
  holderScore?: number | null;
  holderLevel?: string | null;
  holderDate?: string | null;
  largeHolderRatio?: number | null;
  whaleHolderRatio?: number | null;
  retailHolderRatio?: number | null;
  holderReasons?: string[];
  holderSource?: string | null;
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