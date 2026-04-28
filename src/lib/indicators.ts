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
      technicalScore: 0,
      moneyFlowScore: 0,
      riskPenalty: 0,
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
      Number.isFinite(c.close) &&
      Number.isFinite(c.volume)
  );

  if (validCandles.length < 60) {
    return {
      ...ind,
      score: 0,
      technicalScore: 0,
      moneyFlowScore: 0,
      riskPenalty: 0,
      strictPass: false,
      category: "資料不足",
      riskLevel: "未知",
      positionLabel: "資料不足",
      oneYearReturn: null,
      distanceFromLow52w: null,
      distanceFromHigh52w: null,
      return20d: null,
      reasons: ["K線資料不足，至少需要60日"],
    };
  }

  const last = validCandles[validCandles.length - 1];
  const first = validCandles[0];
  const recent20 = validCandles.slice(-20);
  const recent5 = validCandles.slice(-5);

  const closes = validCandles.map((c) => c.close);
  const volumes = validCandles.map((c) => c.volume || 0);

  const latestVolume = last.volume || 0;
  const avgVol5 =
    recent5.reduce((sum, c) => sum + (c.volume || 0), 0) / recent5.length;
  const avgVol20 =
    recent20.reduce((sum, c) => sum + (c.volume || 0), 0) / recent20.length;

  const activeDays20 = recent20.filter((c) => (c.volume || 0) > 0).length;

  const low52w = Math.min(...validCandles.map((c) => c.low));
  const high52w = Math.max(...validCandles.map((c) => c.high));

  const close20dAgo =
    validCandles.length >= 21
      ? validCandles[validCandles.length - 21].close
      : null;

  const oneYearReturn =
    first.close > 0 ? ((last.close - first.close) / first.close) * 100 : null;

  const distanceFromLow52w =
    low52w > 0 ? ((last.close - low52w) / low52w) * 100 : null;

  const distanceFromHigh52w =
    high52w > 0 ? ((last.close - high52w) / high52w) * 100 : null;

  const return20d =
    close20dAgo && close20dAgo > 0
      ? ((last.close - close20dAgo) / close20dAgo) * 100
      : null;

  const positionRatio =
    high52w > low52w ? ((last.close - low52w) / (high52w - low52w)) * 100 : null;

  const reasons: string[] = [];

  /**
   * 重要：
   * Yahoo 台股 volume 大多是「股」。
   * 所以 100_000 約等於 100 張。
   * 如果之後你發現資料源改成「張」，這裡要改成 100。
   */
  const MIN_LATEST_VOLUME = 100_000;
  const MIN_AVG_VOLUME_20 = 100_000;
  const MIN_ACTIVE_DAYS_20 = 15;

  const liquidityBad =
    latestVolume < MIN_LATEST_VOLUME ||
    avgVol20 < MIN_AVG_VOLUME_20 ||
    activeDays20 < MIN_ACTIVE_DAYS_20;

  if (liquidityBad) {
    return {
      ...ind,
      score: 0,
      technicalScore: 0,
      moneyFlowScore: 0,
      riskPenalty: 100,
      strictPass: false,
      category: "排除",
      riskLevel: "極高",
      positionLabel: "流動性不足",
      oneYearReturn,
      distanceFromLow52w,
      distanceFromHigh52w,
      return20d,
      reasons: [
        "流動性不足，排除掃描",
        `最新成交量：${Math.round(latestVolume).toLocaleString()}`,
        `20日均量：${Math.round(avgVol20).toLocaleString()}`,
        `近20日有效交易天數：${activeDays20}/20`,
      ],
    };
  }

  let moneyFlowScore = 0;
  let technicalScore = 0;
  let riskPenalty = 0;

  /**
   * 1. 資金異動分：抓不起眼股票突然被資金注意
   */
  const volumeRatio =
    avgVol20 > 0 ? latestVolume / avgVol20 : ind.volumeRatio ?? null;

  const volumeRatio5to20 = avgVol20 > 0 ? avgVol5 / avgVol20 : null;

  const wasQuiet =
    avgVol20 >= MIN_AVG_VOLUME_20 &&
    avgVol20 < 800_000 &&
    volumeRatio !== null &&
    volumeRatio >= 2.5;

  if (volumeRatio !== null && volumeRatio >= 3) {
    moneyFlowScore += 18;
    reasons.push(`成交量強烈放大，量比 ${volumeRatio.toFixed(2)}x`);
  } else if (volumeRatio !== null && volumeRatio >= 2) {
    moneyFlowScore += 14;
    reasons.push(`成交量明顯放大，量比 ${volumeRatio.toFixed(2)}x`);
  } else if (volumeRatio !== null && volumeRatio >= 1.3) {
    moneyFlowScore += 9;
    reasons.push(`成交量溫和放大，量比 ${volumeRatio.toFixed(2)}x`);
  } else {
    reasons.push("量能未明顯放大");
  }

  if (volumeRatio5to20 !== null && volumeRatio5to20 >= 1.5) {
    moneyFlowScore += 7;
    reasons.push(`5日均量高於20日均量，資金有延續跡象`);
  }

  if (wasQuiet) {
    moneyFlowScore += 5;
    reasons.push("原本偏冷門，近期突然放量，符合資金異動特徵");
  }

  moneyFlowScore = Math.min(25, moneyFlowScore);

  /**
   * 2. 技術轉強分：抓剛發動，不是已經噴完
   */
  const priceAbove20 = ind.ma20 !== null && last.close > ind.ma20;
  const priceAbove60 = ind.ma60 !== null && last.close > ind.ma60;
  const maTrend = ind.ma5 !== null && ind.ma20 !== null && ind.ma5 > ind.ma20;
  const break20High = ind.high20 !== null && last.close > ind.high20;

  if (priceAbove20) {
    technicalScore += 10;
    reasons.push("價格站上20MA");
  } else {
    reasons.push("未站上20MA");
  }

  if (priceAbove60) {
    technicalScore += 8;
    reasons.push("價格站上60MA");
  } else {
    reasons.push("未站上60MA");
  }

  if (maTrend) {
    technicalScore += 9;
    reasons.push("5MA > 20MA，短線趨勢轉強");
  }

  if (break20High) {
    technicalScore += 10;
    reasons.push("突破20日高點");
  }

  const rsiOk = ind.rsi14 !== null && ind.rsi14 >= 50 && ind.rsi14 <= 68;
  const rsiEarly = ind.rsi14 !== null && ind.rsi14 >= 45 && ind.rsi14 < 50;
  const rsiStrong = ind.rsi14 !== null && ind.rsi14 > 68 && ind.rsi14 <= 75;
  const rsiOverheat = ind.rsi14 !== null && ind.rsi14 > 75;

  if (rsiOk) {
    technicalScore += 10;
    reasons.push("RSI 50~68，動能健康");
  } else if (rsiEarly) {
    technicalScore += 5;
    reasons.push("RSI 45~50，可能剛轉強");
  } else if (rsiStrong) {
    technicalScore += 4;
    riskPenalty += 4;
    reasons.push("RSI 68~75，偏強但接近過熱");
  } else if (rsiOverheat) {
    riskPenalty += 14;
    reasons.push("RSI > 75，短線過熱");
  } else {
    reasons.push("RSI 不在理想區間");
  }

  technicalScore = Math.min(35, technicalScore);

  /**
   * 3. 位階與追高風險
   */
  const highReturn = oneYearReturn !== null && oneYearReturn > 180;
  const veryHighReturn = oneYearReturn !== null && oneYearReturn > 350;

  const farFromLow =
    distanceFromLow52w !== null && distanceFromLow52w > 200;

  const veryFarFromLow =
    distanceFromLow52w !== null && distanceFromLow52w > 350;

  const nearHigh =
    distanceFromHigh52w !== null && distanceFromHigh52w > -10;

  const shortTermHot = return20d !== null && return20d > 30;
  const shortTermVeryHot = return20d !== null && return20d > 45;

  if (veryHighReturn || veryFarFromLow) {
    riskPenalty += 22;
    reasons.push("一年漲幅或距年低漲幅過大，已非低位黑馬");
  } else if (highReturn || farFromLow) {
    riskPenalty += 12;
    reasons.push("股價已大幅遠離低位");
  }

  if (nearHigh) {
    riskPenalty += 6;
    reasons.push("股價接近一年高點，追高風險提高");
  }

  if (shortTermVeryHot) {
    riskPenalty += 18;
    reasons.push("近20日漲幅過大，短線過熱");
  } else if (shortTermHot) {
    riskPenalty += 8;
    reasons.push("近20日漲幅偏大，需注意追高");
  }

  /**
   * 4. 危險K棒：高位放量但收弱，疑似拉高出貨
   */
  const candleRange = last.high - last.low;
  const upperShadow =
    candleRange > 0 ? ((last.high - last.close) / candleRange) * 100 : 0;
  const closePosition =
    candleRange > 0 ? ((last.close - last.low) / candleRange) * 100 : 50;

  const redFlagWeakClose =
    volumeRatio !== null &&
    volumeRatio >= 2 &&
    upperShadow >= 45 &&
    closePosition <= 45;

  if (redFlagWeakClose) {
    riskPenalty += 15;
    reasons.push("放量但收盤偏弱且上影線較長，疑似出貨或追高風險");
  }

  /**
   * 5. 總分與分類
   * 這裡的 score 是「技術 + 資金 - 風險」。
   * 營收分之後在 Scanner.tsx 另外合併。
   */
  const rawScore = moneyFlowScore + technicalScore + 40 - riskPenalty;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  const baseMomentum =
    priceAbove20 &&
    (maTrend || break20High) &&
    moneyFlowScore >= 10 &&
    technicalScore >= 20;

  let category = "觀察名單";
  let riskLevel = "中";
  let positionLabel = "一般位置";

  if (riskPenalty >= 35 || rsiOverheat || shortTermVeryHot || redFlagWeakClose) {
    category = "高風險異動";
    riskLevel = "極高";
    positionLabel = "追高風險";
    reasons.push("量價或位階風險偏高，容易出現劇烈震盪");
  } else if (
    baseMomentum &&
    moneyFlowScore >= 18 &&
    technicalScore >= 25 &&
    !highReturn &&
    !farFromLow &&
    positionRatio !== null &&
    positionRatio < 75
  ) {
    category = "資金異動";
    riskLevel = "中";
    positionLabel = "低中位啟動";
    reasons.push("量價明顯轉強，可能有資金提前卡位");
  } else if (
    baseMomentum &&
    score >= 75 &&
    !highReturn &&
    !farFromLow &&
    !shortTermHot
  ) {
    category = "真黑馬";
    riskLevel = "中低";
    positionLabel = "低位轉強";
    reasons.push("位置尚未過高，屬於低位轉強型");
  } else if (
    baseMomentum &&
    score >= 70 &&
    priceAbove60 &&
    !veryHighReturn &&
    !veryFarFromLow
  ) {
    category = "趨勢續攻";
    riskLevel = "中";
    positionLabel = "中段趨勢";
    reasons.push("已有一段漲幅，但趨勢仍保持強勢");
  } else if (
    baseMomentum &&
    (highReturn || farFromLow || nearHigh) &&
    !shortTermVeryHot
  ) {
    category = "高位強勢";
    riskLevel = "高";
    positionLabel = "高位續強";
    reasons.push("股價位階偏高，偏向短線動能股");
  }

  const strictPass = Boolean(
    baseMomentum &&
      score >= 65 &&
      riskPenalty < 30 &&
      category !== "高風險異動"
  );

  return {
    ...ind,
    score,
    technicalScore,
    moneyFlowScore,
    riskPenalty,
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