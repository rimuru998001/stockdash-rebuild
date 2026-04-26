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
  fallbackTried?: string[];
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
  strictPass: boolean;

  // 分級制度
  category?: string;              // 真黑馬 / 趨勢續攻 / 高位強勢 / 過熱警示
  riskLevel?: string;             // 中低 / 中 / 高 / 極高
  positionLabel?: string;         // 低位轉強 / 中段趨勢 / 高位續強 / 追高風險

  // 位階與漲幅指標
  oneYearReturn?: number | null;        // 一年漲幅
  distanceFromLow52w?: number | null;   // 距離一年低點
  distanceFromHigh52w?: number | null;  // 距離一年高點
  return20d?: number | null;            // 近20日漲幅

  reasons: string[];
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
