import type { UTCTimestamp } from "lightweight-charts";
import type { Candle } from "./types";

export type LinePoint = {
  time: UTCTimestamp;
  value: number;
};

export type HistogramPoint = {
  time: UTCTimestamp;
  value: number;
  color?: string;
};

export function toTime(date: string): UTCTimestamp {
  return Math.floor(new Date(date + "T00:00:00Z").getTime() / 1000) as UTCTimestamp;
}

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((sum, value) => sum + value, 0) / period;
}

export function smaData(candles: Candle[], period: number): LinePoint[] {
  const result: LinePoint[] = [];
  if (candles.length < period) return result;

  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const avg = slice.reduce((sum, c) => sum + c.close, 0) / period;

    result.push({
      time: toTime(candles[i].time),
      value: avg,
    });
  }

  return result;
}

export function rsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null;

  let gains = 0;
  let losses = 0;
  const start = values.length - period;

  for (let i = start; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function rsiData(candles: Candle[], period = 14): LinePoint[] {
  const result: LinePoint[] = [];
  if (candles.length <= period) return result;

  const closes = candles.map((c) => c.close);
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? Math.abs(diff) : 0);
  }

  let avgGain =
    gains.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
  let avgLoss =
    losses.slice(0, period).reduce((sum, v) => sum + v, 0) / period;

  let currentRsi =
    avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  result.push({
    time: toTime(candles[period].time),
    value: currentRsi,
  });

  for (let i = period + 1; i < candles.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    currentRsi =
      avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

    result.push({
      time: toTime(candles[i].time),
      value: currentRsi,
    });
  }

  return result;
}

function ema(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return result;

  const k = 2 / (period + 1);
  let prev =
    values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;

  result[period - 1] = prev;

  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result[i] = prev;
  }

  return result;
}

export function macdData(
  candles: Candle[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
) {
  const closes = candles.map((c) => c.close);
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);

  const macdRaw: (number | null)[] = closes.map((_, i) => {
    if (fastEma[i] == null || slowEma[i] == null) return null;
    return fastEma[i]! - slowEma[i]!;
  });

  const firstValidIndex = macdRaw.findIndex((value) => value != null);

  if (firstValidIndex === -1) {
    return {
      macd: [] as LinePoint[],
      signal: [] as LinePoint[],
      histogram: [] as HistogramPoint[],
    };
  }

  const compactMacd = macdRaw
    .slice(firstValidIndex)
    .filter((value): value is number => value != null);

  const compactSignal = ema(compactMacd, signalPeriod);

  const signalRaw: (number | null)[] = new Array(candles.length).fill(null);

  for (let i = 0; i < compactSignal.length; i++) {
    signalRaw[firstValidIndex + i] = compactSignal[i];
  }

  const macd: LinePoint[] = [];
  const signal: LinePoint[] = [];
  const histogram: HistogramPoint[] = [];

  for (let i = 0; i < candles.length; i++) {
    const time = toTime(candles[i].time);

    if (macdRaw[i] != null) {
      macd.push({
        time,
        value: macdRaw[i]!,
      });
    }

    if (signalRaw[i] != null) {
      signal.push({
        time,
        value: signalRaw[i]!,
      });
    }

    if (macdRaw[i] != null && signalRaw[i] != null) {
      const value = macdRaw[i]! - signalRaw[i]!;

      histogram.push({
        time,
        value,
        color:
          value >= 0
            ? "rgba(34,197,94,0.70)"
            : "rgba(239,68,68,0.70)",
      });
    }
  }

  return {
    macd,
    signal,
    histogram,
  };
}

export function latestIndicators(candles: Candle[]) {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume || 0);
  const latest = candles.length > 0 ? candles[candles.length - 1] : undefined;
const previous = candles.length > 1 ? candles[candles.length - 2] : undefined;

  const ma5 = sma(closes, 5);
  const ma20 = sma(closes, 20);
  const ma60 = sma(closes, 60);
  const rsi14 = rsi(closes, 14);
  const avgVol20 = sma(volumes, 20);
  const volumeRatio =
    latest && avgVol20 && avgVol20 > 0 ? latest.volume / avgVol20 : null;

  const high20 =
    candles.length >= 21
      ? Math.max(...candles.slice(-21, -1).map((c) => c.high))
      : null;

  return {
    latest,
    previous,
    closes,
    ma5,
    ma20,
    ma60,
    rsi14,
    avgVol20,
    volumeRatio,
    high20,
  };
}

export function calculateScore(candles: Candle[]) {
  const ind = latestIndicators(candles);
  const latest = ind.latest;

  if (!latest) {
    return {
      ...ind,
      score: 0,
      strictPass: false,
      category: "資料不足",
      riskLevel: "未知",
      positionLabel: "資料不足",
      oneYearReturn: null,
      distanceFromLow52w: null,
      distanceFromHigh52w: null,
      return20d: null,
      reasons: ["資料不足"],
    };
  }

  const validCandles = candles.filter(
    (c) =>
      Number.isFinite(c.open) &&
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.close)
  );

  const first = validCandles[0];
  const last = latest;

  const low52w =
    validCandles.length > 0
      ? Math.min(...validCandles.map((c) => c.low))
      : null;

  const high52w =
    validCandles.length > 0
      ? Math.max(...validCandles.map((c) => c.high))
      : null;

  const close20dAgo =
    validCandles.length >= 21
      ? validCandles[validCandles.length - 21].close
      : null;

  const oneYearReturn =
    first && first.close > 0
      ? ((last.close - first.close) / first.close) * 100
      : null;

  const distanceFromLow52w =
    low52w && low52w > 0
      ? ((last.close - low52w) / low52w) * 100
      : null;

  const distanceFromHigh52w =
    high52w && high52w > 0
      ? ((last.close - high52w) / high52w) * 100
      : null;

  const return20d =
    close20dAgo && close20dAgo > 0
      ? ((last.close - close20dAgo) / close20dAgo) * 100
      : null;

  let score = 0;
  const reasons: string[] = [];

  const priceAbove20 = ind.ma20 !== null && last.close > ind.ma20;

  if (priceAbove20) {
    score += 20;
    reasons.push("價格站上20MA");
  } else {
    reasons.push("未站上20MA");
  }

  const priceAbove60 = ind.ma60 !== null && last.close > ind.ma60;

  if (priceAbove60) {
    score += 10;
    reasons.push("價格站上60MA");
  } else {
    reasons.push("未站上60MA");
  }

  const rsiOk = ind.rsi14 !== null && ind.rsi14 >= 45 && ind.rsi14 <= 65;
  const rsiStrong = ind.rsi14 !== null && ind.rsi14 > 65 && ind.rsi14 <= 70;
  const rsiOverheat = ind.rsi14 !== null && ind.rsi14 > 70;

  if (rsiOk) {
    score += 20;
    reasons.push("RSI 45~65，動能健康");
  } else if (rsiStrong) {
    score += 10;
    reasons.push("RSI 65~70，偏強但接近過熱");
  } else if (rsiOverheat) {
    score -= 10;
    reasons.push("RSI > 70，短線過熱");
  } else {
    reasons.push("RSI 不在理想區間");
  }

  const volOk = ind.volumeRatio !== null && ind.volumeRatio > 1.3;

  if (volOk) {
    score += 20;
    reasons.push("成交量放大");
  } else {
    reasons.push("量能未明顯放大");
  }

  const maTrend = ind.ma5 !== null && ind.ma20 !== null && ind.ma5 > ind.ma20;

  if (maTrend) {
    score += 15;
    reasons.push("5MA > 20MA，短線趨勢轉強");
  }

  const break20High = ind.high20 !== null && last.close > ind.high20;

  if (break20High) {
    score += 15;
    reasons.push("突破20日高點");
  }

  // 位置風險調整：避免已經漲超高的股票被單純叫做黑馬
  const veryHighReturn = oneYearReturn !== null && oneYearReturn > 350;
  const highReturn = oneYearReturn !== null && oneYearReturn > 180;
  const midReturn = oneYearReturn !== null && oneYearReturn > 80;

  const farFromLow =
    distanceFromLow52w !== null && distanceFromLow52w > 200;

  const veryFarFromLow =
    distanceFromLow52w !== null && distanceFromLow52w > 350;

  const nearHigh =
    distanceFromHigh52w !== null && distanceFromHigh52w > -10;

  const shortTermOverheat =
    return20d !== null && return20d > 40;

  if (veryHighReturn || veryFarFromLow) {
    score -= 20;
    reasons.push("一年漲幅過大，已非低位黑馬");
  } else if (highReturn || farFromLow) {
    score -= 10;
    reasons.push("股價已大幅遠離低位");
  }

  if (shortTermOverheat) {
    score -= 10;
    reasons.push("近20日漲幅過大，短線追高風險增加");
  }

  let category = "觀察名單";
  let riskLevel = "中";
  let positionLabel = "一般位置";

  const baseMomentum = priceAbove20 && volOk && (maTrend || break20High);

  if (
    baseMomentum &&
    !highReturn &&
    !farFromLow &&
    !rsiOverheat &&
    !shortTermOverheat
  ) {
    category = "真黑馬";
    riskLevel = "中低";
    positionLabel = "低位轉強";
    reasons.push("位置尚未過高，屬於低位轉強型");
  } else if (
    baseMomentum &&
    (midReturn || priceAbove60) &&
    !veryHighReturn &&
    !veryFarFromLow &&
    !rsiOverheat
  ) {
    category = "趨勢續攻";
    riskLevel = "中";
    positionLabel = "中段趨勢";
    reasons.push("已有一段漲幅，但趨勢仍保持強勢");
  } else if (
    baseMomentum &&
    (highReturn || farFromLow || nearHigh) &&
    !veryHighReturn &&
    !shortTermOverheat
  ) {
    category = "高位強勢";
    riskLevel = "高";
    positionLabel = "高位續強";
    reasons.push("股價位階偏高，偏向短線動能股");
  } else if (veryHighReturn || veryFarFromLow || rsiOverheat || shortTermOverheat) {
    category = "過熱警示";
    riskLevel = "極高";
    positionLabel = "追高風險";
    reasons.push("股價或動能過熱，需注意回檔風險");
  }

  const strictPass = Boolean(baseMomentum && score >= 45);

  return {
    ...ind,
    score: Math.max(0, Math.round(score)),
    strictPass,
    category,
    riskLevel,
    positionLabel,
    oneYearReturn,
    distanceFromLow52w,
    distanceFromHigh52w,
    return20d,
    reasons,
  };
}