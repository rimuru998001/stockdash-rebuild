import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  LineStyle,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
} from "lightweight-charts";
import type { UTCTimestamp } from "lightweight-charts";
import type { Candle } from "../lib/types";
import { toTime, smaData, rsiData, macdData } from "../lib/indicators";

function formatNum(value?: number | null, digits = 2) {
  if (value == null || Number.isNaN(value)) return "--";
  return value.toFixed(digits);
}

function formatVolume(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "--";
  if (value >= 100000000) return `${(value / 100000000).toFixed(2)}億`;
  if (value >= 10000) return `${(value / 10000).toFixed(2)}萬`;
  return `${value}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;

  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();

  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeCandles(candles: Candle[]) {
  const map = new Map<number, Candle>();

  for (const candle of candles) {
    if (!candle.time) continue;

    const chartTime = toTime(candle.time) as number;

    if (!Number.isFinite(chartTime)) continue;

    const open = Number(candle.open);
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);
    const volume = Number(candle.volume ?? 0);

    if (
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close)
    ) {
      continue;
    }

    map.set(chartTime, {
      ...candle,
      time: candle.time,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : 0,
    });
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([, candle]) => candle);
}

export function StockChart({ candles }: { candles: Candle[] }) {
  const priceRef = useRef<HTMLDivElement | null>(null);
  const volumeRef = useRef<HTMLDivElement | null>(null);
  const rsiRef = useRef<HTMLDivElement | null>(null);
  const macdRef = useRef<HTMLDivElement | null>(null);

  const ohlcRef = useRef<HTMLDivElement | null>(null);
  const maRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (
      !priceRef.current ||
      !volumeRef.current ||
      !rsiRef.current ||
      !macdRef.current
    ) {
      return;
    }

    const sorted = normalizeCandles(candles);

    priceRef.current.innerHTML = "";
    volumeRef.current.innerHTML = "";
    rsiRef.current.innerHTML = "";
    macdRef.current.innerHTML = "";

    if (sorted.length === 0) {
      priceRef.current.innerHTML =
        '<div style="padding:24px;color:#94a3b8;">沒有可顯示的 K 線資料</div>';
      return;
    }

    const candleData = sorted.map((c) => ({
      time: toTime(c.time),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeData = sorted.map((c) => ({
      time: toTime(c.time),
      value: c.volume,
      color:
        c.close >= c.open
          ? "rgba(34,197,94,0.60)"
          : "rgba(239,68,68,0.60)",
    }));

    const ma5 = smaData(sorted, 5);
    const ma10 = smaData(sorted, 10);
    const ma20 = smaData(sorted, 20);
    const ma60 = smaData(sorted, 60);

    const rsi = rsiData(sorted, 14);
    const macd = macdData(sorted, 12, 26, 9);

    const candleMap = new Map<number, Candle>(
      sorted.map((c) => [toTime(c.time) as number, c])
    );

    const ma5Map = new Map<number, number>(
      ma5.map((p) => [p.time as number, p.value])
    );
    const ma10Map = new Map<number, number>(
      ma10.map((p) => [p.time as number, p.value])
    );
    const ma20Map = new Map<number, number>(
      ma20.map((p) => [p.time as number, p.value])
    );
    const ma60Map = new Map<number, number>(
      ma60.map((p) => [p.time as number, p.value])
    );

    const getWidth = () => priceRef.current?.clientWidth || 900;

    const baseOptions = (height: number, showTime = false) => ({
      width: getWidth(),
      height,
      layout: {
        background: { type: ColorType.Solid, color: "#101720" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "#1f2b3a" },
        horzLines: { color: "#1f2b3a" },
      },
      rightPriceScale: {
        borderColor: "#263244",
      },
      timeScale: {
        borderColor: "#263244",
        timeVisible: true,
        visible: showTime,
        ticksVisible: showTime,
      },
      localization: {
        locale: "zh-TW",
      },
      crosshair: {
        mode: 0,
      },
    });

    const priceChart = createChart(priceRef.current, baseOptions(430, false));
    const volumeChart = createChart(volumeRef.current, baseOptions(110, false));
    const rsiChart = createChart(rsiRef.current, baseOptions(120, false));
    const macdChart = createChart(macdRef.current, baseOptions(140, true));

    const candleSeries = priceChart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });
    candleSeries.setData(candleData);

    const ma5Series = priceChart.addSeries(LineSeries, {
      color: "#f97316",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    ma5Series.setData(ma5);

    const ma10Series = priceChart.addSeries(LineSeries, {
      color: "#60a5fa",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    ma10Series.setData(ma10);

    const ma20Series = priceChart.addSeries(LineSeries, {
      color: "#eab308",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    ma20Series.setData(ma20);

    const ma60Series = priceChart.addSeries(LineSeries, {
      color: "#c084fc",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    ma60Series.setData(ma60);

    const volumeSeries = volumeChart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceLineVisible: false,
      lastValueVisible: true,
    });
    volumeSeries.setData(volumeData);

    const rsiSeries = rsiChart.addSeries(LineSeries, {
      color: "#22d3ee",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    rsiSeries.setData(rsi);

    rsiSeries.createPriceLine({
      price: 70,
      color: "#ef4444",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "超買 70",
    });

    rsiSeries.createPriceLine({
      price: 30,
      color: "#22c55e",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "超賣 30",
    });

    const macdHistSeries = macdChart.addSeries(HistogramSeries, {
      priceLineVisible: false,
      lastValueVisible: true,
    });
    macdHistSeries.setData(macd.histogram);

    const macdLineSeries = macdChart.addSeries(LineSeries, {
      color: "#60a5fa",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    macdLineSeries.setData(macd.macd);

    const signalLineSeries = macdChart.addSeries(LineSeries, {
      color: "#f97316",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    signalLineSeries.setData(macd.signal);

    const charts = [priceChart, volumeChart, rsiChart, macdChart];

    let syncing = false;

    charts.forEach((chart, index) => {
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (!range || syncing) return;

        syncing = true;

        charts.forEach((otherChart, otherIndex) => {
          if (index !== otherIndex) {
            otherChart.timeScale().setVisibleLogicalRange(range);
          }
        });

        syncing = false;
      });
    });

    charts.forEach((chart) => chart.timeScale().fitContent());

    const updateInfo = (time?: UTCTimestamp) => {
      const last = sorted[sorted.length - 1];
      const targetTime = (time as number | undefined) ?? (toTime(last.time) as number);
      const candle = candleMap.get(targetTime) ?? last;

      if (ohlcRef.current) {
        const diff = candle.close - candle.open;
        const pct = candle.open !== 0 ? (diff / candle.open) * 100 : 0;

        ohlcRef.current.innerHTML =
          `${formatDate(candle.time)}　` +
          `開 <span style="color:#22d3ee">${formatNum(candle.open)}</span>　` +
          `高 <span style="color:#22c55e">${formatNum(candle.high)}</span>　` +
          `低 <span style="color:#ef4444">${formatNum(candle.low)}</span>　` +
          `收 <span style="color:#f8fafc">${formatNum(candle.close)}</span>　` +
          `量 <span style="color:#cbd5e1">${formatVolume(candle.volume)}</span>　` +
          `<span style="color:${diff >= 0 ? "#22c55e" : "#ef4444"}">` +
          `${diff >= 0 ? "+" : ""}${formatNum(diff)} (${pct.toFixed(2)}%)</span>`;
      }

      if (maRef.current) {
        maRef.current.innerHTML =
          `<span style="color:#f97316">● MA5 ${formatNum(ma5Map.get(targetTime))}</span>` +
          `<span style="color:#60a5fa">● MA10 ${formatNum(ma10Map.get(targetTime))}</span>` +
          `<span style="color:#eab308">● MA20 ${formatNum(ma20Map.get(targetTime))}</span>` +
          `<span style="color:#c084fc">● MA60 ${formatNum(ma60Map.get(targetTime))}</span>`;
      }
    };

    updateInfo();

    priceChart.subscribeCrosshairMove((param) => {
      if (!param?.time) {
        updateInfo();
        return;
      }

      updateInfo(param.time as UTCTimestamp);
    });

    const resize = () => {
      const width = getWidth();

      priceChart.applyOptions({ width });
      volumeChart.applyOptions({ width });
      rsiChart.applyOptions({ width });
      macdChart.applyOptions({ width });
    };

    resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      priceChart.remove();
      volumeChart.remove();
      rsiChart.remove();
      macdChart.remove();
    };
  }, [candles]);

  return (
  <div className="chartWrap">

    <div className="chartHeader">
      <div className="ohlcLine" ref={ohlcRef} />
      <div className="maLegend" ref={maRef} />
    </div>

    <div className="paneTitle">K線 / 均線</div>
    <div className="chartPane pricePane" ref={priceRef} />

    <div className="paneTitle">成交量</div>
    <div className="chartPane subPane" ref={volumeRef} />

    <div className="paneTitle">RSI（14）</div>
    <div className="chartPane subPane" ref={rsiRef} />

    <div className="paneTitle">MACD（12, 26, 9）</div>
    <div className="chartPane macdPane" ref={macdRef} />
  </div>
);
}