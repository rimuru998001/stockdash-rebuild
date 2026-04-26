import { useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { fetchHotStocksFromEdge, fetchStockData } from "../lib/api";
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

  async function loadCloudCustomPool() {
    if (!supabase || !user) return null;

    const { data, error } = await supabase
      .from("user_stock_lists")
      .select("stocks")
      .eq("user_id", user.id)
      .eq("list_name", "自訂清單")
      .maybeSingle();

    if (error) throw error;

    return Array.isArray(data?.stocks)
      ? dedupeStocksBySymbol(data.stocks)
      : [];
  }

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
    // 用 1y 才能正確判斷「一年漲幅 / 距離年低 / 高位風險」
    const data = await fetchStockData(stock.symbol, "1y");

    if (data.candles.length < 60) return null;

    const calc = calculateScore(data.candles);

    if (!calc.latest) return null;

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
      strictPass: calc.strictPass,

      category: calc.category,
      riskLevel: calc.riskLevel,
      positionLabel: calc.positionLabel,
      oneYearReturn: calc.oneYearReturn,
      distanceFromLow52w: calc.distanceFromLow52w,
      distanceFromHigh52w: calc.distanceFromHigh52w,
      return20d: calc.return20d,

      reasons: calc.reasons,
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
          scanned.sort((a, b) => b.score - a.score);

          setResults([
  ...scanned
    .filter((r) => r.score >= 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SCAN_RESULTS),
]);
        } else {
          skipped++;
        }
      } catch (err) {
        console.warn("scan failed", stock, err);
        skipped++;
      }

      await delay(150);
    }

    const strictCount = scanned.filter((r) => r.strictPass).length;
    const candidates = scanned

    setResults(
      candidates.length
        ? candidates
        : scanned.sort((a, b) => b.score - a.score).slice(0, 10)
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
          <h3>掃描結果（最多保留前 {MAX_SCAN_RESULTS} 筆，可捲動查看）</h3>

          <div className="tableWrap scannerResultScroll">
            <table>
              <thead>
                <tr>
                  <th>代號</th>
                  <th>名稱</th>
                  <th>類型</th>
                  <th>風險</th>
                  <th>位階</th>
                  <th>收盤</th>
                  <th>20MA</th>
                  <th>RSI</th>
                  <th>量比</th>
                  <th>一年漲幅</th>
                  <th>距年低</th>
                  <th>距年高</th>
                  <th>20日漲幅</th>
                  <th>分數</th>
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
                      <b>{r.category ?? "-"}</b>
                    </td>
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
                    <td>{formatPercent(r.distanceFromHigh52w)}</td>
                    <td>{formatPercent(r.return20d)}</td>
                    <td>
                      <b>{r.score}</b>
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