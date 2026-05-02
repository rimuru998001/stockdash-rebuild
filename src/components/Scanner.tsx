import { useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  fetchHotStocksFromEdge,
  fetchRevenueData,
  fetchStockData,
} from "../lib/api";
import { calculateScore } from "../lib/indicators";
import { poolLabels, stockPools } from "../lib/stockPools";
import {
  dedupeStocksBySymbol,
  HOT_POOL_UPDATED_KEY,
  loadHotPoolFromStorage,
  parseStockText,
  saveCustomPoolToStorage,
  saveHotPoolToStorage,
} from "../lib/storage";
import { supabase } from "../lib/supabaseClient";
import type { PoolKey, ScanResult, Stock } from "../lib/types";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const MAX_SCAN_RESULTS = 100;

// 總分門檻：想讓名單更少、更精準就調高，例如 70。
// 想多看一點候選就調低，例如 60。
const MIN_FINAL_SCORE = 65;

const poolOrder: PoolKey[] = [
  "all",
  "largeCap",
  "semiconductor",
  "aiServer",
  "finance",
  "shipping",
  "energy",
  "etf",
  "midHot",
  "hot",
  "custom",
];

function formatPercent(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "-";
  return `${value.toFixed(1)}%`;
}

function formatNumber(value?: number | null, digits = 2) {
  if (value == null || Number.isNaN(value)) return "-";
  return value.toFixed(digits);
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function combineReasons(baseReasons: string[], revenueReasons?: string[]) {
  if (!revenueReasons || revenueReasons.length === 0) return baseReasons;
  return [...baseReasons, ...revenueReasons.map((reason) => `營收：${reason}`)];
}

function calcFinalScore(args: {
  technicalBaseScore: number;
  revenueScore: number | null;
  riskLevel?: string;
  category?: string;
  riskPenalty?: number | null;
}) {
  const revenueNormalized =
    args.revenueScore != null ? (args.revenueScore / 30) * 100 : 40;

  let finalScore = Math.round(
    args.technicalBaseScore * 0.7 + revenueNormalized * 0.3
  );

  // 營收太弱，但技術面很漂亮時，避免太容易排前面。
  if (args.revenueScore != null && args.revenueScore <= 5) {
    finalScore -= 8;
  }

  // 高風險分類再扣分。
  if (args.riskLevel === "極高" || args.category === "高風險異動") {
    finalScore -= 15;
  }

  if ((args.riskPenalty ?? 0) >= 30) {
    finalScore -= 10;
  }

  return clamp(finalScore);
}

function calcFinalCategory(args: {
  baseCategory?: string;
  riskLevel?: string;
  revenueScore: number | null;
  finalScore: number;
  revenueYoY: number | null;
  cumulativeRevenueYoY: number | null;
}) {
  const baseCategory = args.baseCategory || "觀察名單";
  const revenueScore = args.revenueScore ?? 0;
  const revenueWeak =
    revenueScore <= 5 ||
    ((args.revenueYoY ?? 0) < 0 && (args.cumulativeRevenueYoY ?? 0) < 0);
  const revenueStrong = revenueScore >= 18;

  if (baseCategory === "排除") return "排除";

  if (args.riskLevel === "極高" || baseCategory === "高風險異動") {
    return "高風險異動";
  }

  if (baseCategory === "資金異動" && revenueStrong && args.finalScore >= 75) {
    return "真黑馬候選";
  }

  if (baseCategory === "真黑馬" && revenueStrong && args.finalScore >= 75) {
    return "真黑馬";
  }

  if (baseCategory === "高位強勢" && revenueStrong) {
    return "成長強勢";
  }

  if (baseCategory === "資金異動" && revenueWeak) {
    return "資金異動";
  }

  if (baseCategory === "真黑馬" && revenueWeak) {
    return "短線動能";
  }

  return baseCategory;
}

function buildWarningFlags(args: {
  rsi14: number | null;
  riskLevel?: string;
  positionLabel?: string;
  return20d?: number | null;
  distanceFromLow52w?: number | null;
  revenueScore: number | null;
  revenueYoY: number | null;
  cumulativeRevenueYoY: number | null;
  category?: string;
}) {
  const flags: string[] = [];

  if ((args.rsi14 ?? 0) > 75) flags.push("RSI過熱");
  if ((args.return20d ?? 0) > 45) flags.push("20日急漲");
  else if ((args.return20d ?? 0) > 30) flags.push("短線偏熱");

  if ((args.distanceFromLow52w ?? 0) > 350) flags.push("遠離年低");
  else if ((args.distanceFromLow52w ?? 0) > 200) flags.push("位階偏高");

  if (args.riskLevel === "極高") flags.push("極高風險");
  if (args.positionLabel === "追高風險") flags.push("追高風險");
  if (args.category === "高風險異動") flags.push("高風險異動");

  if (args.revenueScore != null && args.revenueScore <= 5) {
    flags.push("營收偏弱");
  }

  if ((args.revenueYoY ?? 0) < 0 && (args.cumulativeRevenueYoY ?? 0) < 0) {
    flags.push("營收衰退");
  }

  return Array.from(new Set(flags));
}

function isGoodCandidate(result: ScanResult) {
  const finalScore = result.finalScore ?? result.score;
  const category = result.finalCategory ?? result.category ?? "";

  if (category === "排除") return false;
  if (category === "高風險異動") return false;
  if (result.riskLevel === "極高") return false;

  return finalScore >= MIN_FINAL_SCORE;
}

function sortByFinalScore(a: ScanResult, b: ScanResult) {
  const scoreA = a.finalScore ?? a.score;
  const scoreB = b.finalScore ?? b.score;

  if (scoreB !== scoreA) return scoreB - scoreA;

  const revenueA = a.revenueScore ?? 0;
  const revenueB = b.revenueScore ?? 0;

  return revenueB - revenueA;
}

export function Scanner({ user }: { user: User | null }) {
  const [selectedPool, setSelectedPool] = useState<PoolKey>("aiServer");
  const [customPool, setCustomPool] = useState<Stock[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("blackHorseCustomPool") || "[]");
    } catch {
      return [];
    }
  });

  const [hotPool, setHotPool] = useState<Stock[]>(loadHotPoolFromStorage);
  const [customText, setCustomText] = useState("");
  const [hotText, setHotText] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [hotStatus, setHotStatus] = useState("");
  const [hotUpdatedAt, setHotUpdatedAt] = useState(
    localStorage.getItem(HOT_POOL_UPDATED_KEY) || ""
  );
  const [isUpdatingHot, setIsUpdatingHot] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<ScanResult[]>([]);
  const [stats, setStats] = useState("");

  const getSelectedStockList = useMemo(() => {
    return () => {
      if (selectedPool === "custom") return customPool;
      if (selectedPool === "hot") return hotPool;

      if (selectedPool === "all") {
        return dedupeStocksBySymbol([
          ...Object.values(stockPools).flat(),
          ...customPool,
          ...hotPool,
        ]);
      }

      return stockPools[selectedPool] || [];
    };
  }, [selectedPool, customPool, hotPool]);

  const selectedList = getSelectedStockList();

  async function saveCustomPoolToCloud(pool: Stock[]) {
    if (!supabase || !user) return false;

    const payload = {
      user_id: user.id,
      list_name: "自訂清單",
      stocks: dedupeStocksBySymbol(pool),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("user_stock_lists")
      .upsert(payload, { onConflict: "user_id,list_name" });

    if (error) throw error;

    return true;
  }

  async function syncLocalCustomPoolToCloud() {
    try {
      await saveCustomPoolToCloud(customPool);
      setImportStatus(`已同步到雲端，共 ${customPool.length} 支`);
    } catch (err) {
      console.error("syncLocalCustomPoolToCloud failed", err);
      setImportStatus("同步失敗，已保留在本機");
    }
  }

  async function importCustomPool() {
    const parsed = parseStockText(customText);

    if (parsed.length === 0) {
      setImportStatus("沒有可用的股票代號，請確認格式");
      return;
    }

    const next = dedupeStocksBySymbol(parsed);
    setCustomPool(next);
    saveCustomPoolToStorage(next);

    try {
      if (user) {
        await saveCustomPoolToCloud(next);
        setImportStatus(
          `已匯入自訂清單，共 ${next.length} 支股票（已同步到雲端）`
        );
      } else {
        setImportStatus(
          `已匯入自訂清單，共 ${next.length} 支股票（本機保存）`
        );
      }
    } catch (err) {
      console.error("save custom pool failed", err);
      setImportStatus(
        `已匯入自訂清單，共 ${next.length} 支股票（雲端保存失敗，已保留在本機）`
      );
    }
  }

  async function importHotPool() {
    const parsed = parseStockText(hotText);

    if (parsed.length === 0) {
      setHotStatus("沒有可用的熱門股代號，請確認格式");
      return;
    }

    const next = dedupeStocksBySymbol(parsed);
    setHotPool(next);
    saveHotPoolToStorage(next);

    const now = new Date().toLocaleString("zh-TW");
    localStorage.setItem(HOT_POOL_UPDATED_KEY, now);
    setHotUpdatedAt(now);
    setHotStatus(`已匯入熱門股池，共 ${next.length} 支股票`);
  }

  async function updateHotPool() {
    setIsUpdatingHot(true);
    setHotStatus("正在更新熱門股...");

    try {
      const data = await fetchHotStocksFromEdge();
      const stocks = dedupeStocksBySymbol(data.stocks).slice(0, 100);

      if (stocks.length === 0) throw new Error("熱門股資料為空");

      setHotPool(stocks);
      saveHotPoolToStorage(stocks);

      const updated = data.updatedAt
        ? new Date(data.updatedAt).toLocaleString("zh-TW")
        : new Date().toLocaleString("zh-TW");

      localStorage.setItem(HOT_POOL_UPDATED_KEY, updated);
      setHotUpdatedAt(updated);

      setHotStatus(
        data.success
          ? `熱門股池已更新，共 ${stocks.length} 支，來源：公開資料`
          : `公開資料暫時無法取得，已載入內建熱門股清單，共 ${stocks.length} 支`
      );
    } catch (err) {
      console.error("updateHotPool failed", err);
      setHotStatus("熱門股服務暫時無法使用，請確認 Supabase Edge Function 已部署");
    } finally {
      setIsUpdatingHot(false);
    }
  }

  function clearHotPool() {
    if (!confirm("確定要清空熱門股池嗎？")) return;

    setHotPool([]);
    localStorage.removeItem("blackHorseHotPool");
    localStorage.removeItem(HOT_POOL_UPDATED_KEY);
    setHotUpdatedAt("");
    setHotStatus("熱門股池已清空");
  }

  async function addStockToCustomPool(stock: Stock) {
    const exists = customPool.some((item) => item.symbol === stock.symbol);

    if (exists) {
      setImportStatus(`${stock.symbol} 已存在自訂清單`);
      return;
    }

    const next = dedupeStocksBySymbol([...customPool, stock]);
    setCustomPool(next);
    saveCustomPoolToStorage(next);

    try {
      if (user) await saveCustomPoolToCloud(next);
      setImportStatus(
        `${stock.symbol} ${stock.name} 已加入自訂清單${
          user ? "（已同步到雲端）" : ""
        }`
      );
    } catch (err) {
      console.error("addStockToCustomPool cloud save failed", err);
      setImportStatus(
        `${stock.symbol} 已加入自訂清單（雲端保存失敗，已保留在本機）`
      );
    }
  }

  async function scanStock(stock: Stock): Promise<ScanResult | null> {
    const data = await fetchStockData(stock.symbol, "1y");

    if (data.candles.length < 60) return null;

    const calc = calculateScore(data.candles);

    if (!calc.latest) return null;

    let revenueScore: number | null = null;
    let revenueLevel: string | null = null;
    let revenuePeriod: string | null = null;
    let revenueYoY: number | null = null;
    let revenueMoM: number | null = null;
    let cumulativeRevenueYoY: number | null = null;
    let revenueReasons: string[] = [];
    let revenueSource: string | null = null;

    try {
      const revenueData = await fetchRevenueData(stock.symbol);
      const revenue = revenueData.revenue;

      if (revenue) {
        revenueScore = revenue.revenueScore;
        revenueLevel = revenue.revenueLevel;
        revenuePeriod = revenue.period;
        revenueYoY = revenue.yoyPercent;
        revenueMoM = revenue.momPercent;
        cumulativeRevenueYoY = revenue.cumulativeYoyPercent;
        revenueReasons = revenue.revenueReasons;
        revenueSource = revenue.source;
      }
    } catch (err) {
      console.warn(`revenue fetch failed ${stock.symbol}`, err);
      revenueReasons = ["營收資料取得失敗"];
    }

    const technicalScore = calc.technicalScore ?? calc.score;
    const moneyFlowScore = calc.moneyFlowScore ?? null;
    const riskPenalty = calc.riskPenalty ?? null;

    const finalScore = calcFinalScore({
      technicalBaseScore: calc.score,
      revenueScore,
      riskLevel: calc.riskLevel,
      category: calc.category,
      riskPenalty,
    });

    const finalCategory = calcFinalCategory({
      baseCategory: calc.category,
      riskLevel: calc.riskLevel,
      revenueScore,
      finalScore,
      revenueYoY,
      cumulativeRevenueYoY,
    });

    const warningFlags = buildWarningFlags({
      rsi14: calc.rsi14,
      riskLevel: calc.riskLevel,
      positionLabel: calc.positionLabel,
      return20d: calc.return20d,
      distanceFromLow52w: calc.distanceFromLow52w,
      revenueScore,
      revenueYoY,
      cumulativeRevenueYoY,
      category: finalCategory,
    });

    return {
      symbol: stock.symbol,
      name: stock.name || data.meta.name || stock.symbol,
      close: calc.latest.close,
      ma5: calc.ma5,
      ma20: calc.ma20,
      ma60: calc.ma60,
      rsi14: calc.rsi14,
      volumeRatio: calc.volumeRatio,
      isMA5AboveMA20: Boolean(calc.ma5 && calc.ma20 && calc.ma5 > calc.ma20),
      isBreak20High: Boolean(calc.high20 && calc.latest.close > calc.high20),
      score: calc.score,
      technicalScore,
      moneyFlowScore,
      riskPenalty,
      finalScore,
      strictPass: calc.strictPass,

      category: calc.category,
      finalCategory,
      riskLevel: calc.riskLevel,
      positionLabel: calc.positionLabel,
      oneYearReturn: calc.oneYearReturn,
      distanceFromLow52w: calc.distanceFromLow52w,
      distanceFromHigh52w: calc.distanceFromHigh52w,
      return20d: calc.return20d,

      revenueScore,
      revenueLevel,
      revenuePeriod,
      revenueYoY,
      revenueMoM,
      cumulativeRevenueYoY,
      revenueReasons,
      revenueSource,

      warningFlags,
      reasons: combineReasons(calc.reasons, revenueReasons),
    };
  }

  async function scanAllStocks() {
    const list = getSelectedStockList();

    if (list.length === 0) {
      setProgress("目前掃描範圍沒有股票");
      return;
    }

    setIsScanning(true);
    setResults([]);
    setStats("");

    const scanned: ScanResult[] = [];
    let success = 0;
    let skipped = 0;

    for (let i = 0; i < list.length; i++) {
      const stock = list[i];

      setProgress(
        `正在掃描 ${i + 1} / ${list.length}：${stock.symbol} ${stock.name}`
      );

      try {
        const result = await scanStock(stock);

        if (result) {
          success++;
          scanned.push(result);

          setResults([
            ...scanned
              .filter(isGoodCandidate)
              .sort(sortByFinalScore)
              .slice(0, MAX_SCAN_RESULTS),
          ]);
        } else {
          skipped++;
        }
      } catch (err) {
        console.warn(`略過 ${stock.symbol} ${stock.name}：資料抓取失敗`, err);
        skipped++;
      }

      await delay(150);
    }

    const strictCount = scanned.filter((r) => r.strictPass).length;

    const candidates = scanned
      .filter(isGoodCandidate)
      .sort(sortByFinalScore)
      .slice(0, MAX_SCAN_RESULTS);

    setResults(
      candidates.length
        ? candidates
        : scanned.sort(sortByFinalScore).slice(0, 10)
    );

    setStats(
      `掃描完成：總數 ${list.length}，成功 ${success}，略過 ${skipped}，嚴格符合 ${strictCount}，候選 ${candidates.length}`
    );

    setProgress("");
    setIsScanning(false);
  }

  return (
    <section className="scanner card">
      <div className="sectionHeader">
        <h2>動態機會掃描器</h2>
        {user && (
          <button
            className="secondary small"
            onClick={syncLocalCustomPoolToCloud}
          >
            同步本機清單到雲端
          </button>
        )}
      </div>

      <label>掃描範圍</label>
      <select
        value={selectedPool}
        onChange={(e) => setSelectedPool(e.target.value as PoolKey)}
      >
        {poolOrder.map((key) => {
          const count =
            key === "custom"
              ? customPool.length
              : key === "hot"
              ? hotPool.length
              : key === "all"
              ? dedupeStocksBySymbol([
                  ...Object.values(stockPools).flat(),
                  ...customPool,
                  ...hotPool,
                ]).length
              : (stockPools[key] || []).length;

          return (
            <option key={key} value={key}>
              {poolLabels[key]}（{count}）
            </option>
          );
        })}
      </select>

      <p className="muted">
        目前掃描範圍：{poolLabels[selectedPool]}，共 {selectedList.length} 支
      </p>

      <button onClick={scanAllStocks} disabled={isScanning}>
        {isScanning ? "掃描中..." : "一鍵掃描"}
      </button>

      {progress && <p className="statusText">{progress}</p>}
      {stats && <p className="okText">{stats}</p>}

      <div className="divider" />

      <h3>自訂股票池</h3>
      <textarea
        value={customText}
        onChange={(e) => setCustomText(e.target.value)}
        placeholder="每行一支股票，支援格式：2330 或 2330 台積電 或 2330,台積電 或 2330.TW 台積電"
      />
      <button className="success full" onClick={importCustomPool}>
        匯入自訂清單
      </button>
      {importStatus && <p className="statusText">{importStatus}</p>}

      <div className="divider" />

      <h3>熱門股池（{hotPool.length} 支）</h3>
      <textarea
        value={hotText}
        onChange={(e) => setHotText(e.target.value)}
        placeholder="可手動貼上熱門股清單，也可以按自動更新熱門股"
      />

      <div className="buttonRow">
        <button
          className="cyan"
          onClick={updateHotPool}
          disabled={isUpdatingHot}
        >
          {isUpdatingHot ? "更新中..." : "自動更新熱門股"}
        </button>
        <button className="purple" onClick={importHotPool}>
          匯入熱門股池
        </button>
        <button className="danger" onClick={clearHotPool}>
          清空
        </button>
      </div>

      {hotStatus && <p className="statusText">{hotStatus}</p>}
      {hotUpdatedAt && <p className="muted">上次更新：{hotUpdatedAt}</p>}

      {results.length > 0 && (
        <div className="resultsWrap">
          <h3>
            掃描結果（總分門檻 {MIN_FINAL_SCORE}，最多保留前{" "}
            {MAX_SCAN_RESULTS} 筆，可捲動查看）
          </h3>

          <div className="tableWrap scannerResultScroll">
            <table>
              <thead>
                <tr>
                  <th>代號</th>
                  <th>名稱</th>
                  <th>最終類型</th>
                  <th>原始類型</th>
                  <th>風險</th>
                  <th>位階</th>
                  <th>收盤</th>
                  <th>20MA</th>
                  <th>RSI</th>
                  <th>量比</th>
                  <th>一年漲幅</th>
                  <th>距年低</th>
                  <th>20日漲幅</th>
                  <th>技術分</th>
                  <th>資金分</th>
                  <th>營收等級</th>
                  <th>營收分</th>
                  <th>單月YoY</th>
                  <th>累計YoY</th>
                  <th>總分</th>
                  <th>警示</th>
                  <th>原因</th>
                  <th>操作</th>
                </tr>
              </thead>

              <tbody>
                {results.map((r) => (
                  <tr key={r.symbol}>
                    <td>{r.symbol}</td>
                    <td>{r.name}</td>
                    <td>
                      <b>{r.finalCategory ?? r.category ?? "-"}</b>
                    </td>
                    <td>{r.category ?? "-"}</td>
                    <td>{r.riskLevel ?? "-"}</td>
                    <td>{r.positionLabel ?? "-"}</td>
                    <td>{formatNumber(r.close)}</td>
                    <td>{formatNumber(r.ma20)}</td>
                    <td>{formatNumber(r.rsi14, 1)}</td>
                    <td>
                      {r.volumeRatio ? `${r.volumeRatio.toFixed(2)}x` : "-"}
                    </td>
                    <td>{formatPercent(r.oneYearReturn)}</td>
                    <td>{formatPercent(r.distanceFromLow52w)}</td>
                    <td>{formatPercent(r.return20d)}</td>
                    <td>{r.technicalScore ?? r.score}</td>
                    <td>{r.moneyFlowScore ?? "-"}</td>
                    <td>{r.revenueLevel ?? "-"}</td>
                    <td>
                      {r.revenueScore != null ? `${r.revenueScore}/30` : "-"}
                    </td>
                    <td>{formatPercent(r.revenueYoY)}</td>
                    <td>{formatPercent(r.cumulativeRevenueYoY)}</td>
                    <td>
                      <b>{r.finalScore ?? r.score}</b>
                    </td>
                    <td className="reasonCell">
                      {r.warningFlags && r.warningFlags.length > 0
                        ? r.warningFlags.join("、")
                        : "-"}
                    </td>
                    <td className="reasonCell">{r.reasons.join("、")}</td>
                    <td>
                      <button
                        className="small"
                        onClick={() => addStockToCustomPool(r)}
                      >
                        加入自訂清單
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}