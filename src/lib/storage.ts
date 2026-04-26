import type { Stock } from "./types";

export const CUSTOM_POOL_KEY = "blackHorseCustomPool";
export const HOT_POOL_KEY = "blackHorseHotPool";
export const HOT_POOL_UPDATED_KEY = "blackHorseHotPoolUpdatedAt";

export function cleanSymbol(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\.(TW|TWO)$/i, "")
    .replace(/[^\d]/g, "");
}

export function dedupeStocksBySymbol(stocks: Stock[]) {
  const map = new Map<string, Stock>();
  for (const stock of stocks) {
    const symbol = cleanSymbol(stock.symbol);
    if (!symbol) continue;
    const name = (stock.name || `股票 ${symbol}`).trim();
    if (!map.has(symbol)) map.set(symbol, { symbol, name });
  }
  return Array.from(map.values());
}

export function parseStockText(text: string): Stock[] {
  const stocks = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const normalized = line.replace(/，/g, ",");
      const parts = normalized.includes(",")
        ? normalized.split(",").map((p) => p.trim())
        : normalized.split(/\s+/).map((p) => p.trim());
      const symbol = cleanSymbol(parts[0]);
      const name = parts.slice(1).join(" ").trim() || `股票 ${symbol}`;
      return { symbol, name };
    })
    .filter((stock) => /^\d{4,6}$/.test(stock.symbol));
  return dedupeStocksBySymbol(stocks);
}

function readPool(key: string): Stock[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return dedupeStocksBySymbol(parsed);
  } catch {
    return [];
  }
}

function savePool(key: string, pool: Stock[]) {
  localStorage.setItem(key, JSON.stringify(dedupeStocksBySymbol(pool)));
}

export const loadCustomPoolFromStorage = () => readPool(CUSTOM_POOL_KEY);
export const saveCustomPoolToStorage = (pool: Stock[]) => savePool(CUSTOM_POOL_KEY, pool);
export const loadHotPoolFromStorage = () => readPool(HOT_POOL_KEY);
export const saveHotPoolToStorage = (pool: Stock[]) => savePool(HOT_POOL_KEY, pool);
