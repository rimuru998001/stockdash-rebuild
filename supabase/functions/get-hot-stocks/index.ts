export {};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type Stock = { symbol: string; name: string };

const fallbackHotStocks: Stock[] = [
  { symbol: "2330", name: "台積電" }, { symbol: "2317", name: "鴻海" }, { symbol: "2454", name: "聯發科" },
  { symbol: "2308", name: "台達電" }, { symbol: "2382", name: "廣達" }, { symbol: "6669", name: "緯穎" },
  { symbol: "3231", name: "緯創" }, { symbol: "2356", name: "英業達" }, { symbol: "3017", name: "奇鋐" },
  { symbol: "3324", name: "雙鴻" }, { symbol: "3653", name: "健策" }, { symbol: "2376", name: "技嘉" },
  { symbol: "2377", name: "微星" }, { symbol: "2357", name: "華碩" }, { symbol: "2303", name: "聯電" },
  { symbol: "3034", name: "聯詠" }, { symbol: "2379", name: "瑞昱" }, { symbol: "3443", name: "創意" },
  { symbol: "3661", name: "世芯-KY" }, { symbol: "6488", name: "環球晶" }, { symbol: "2344", name: "華邦電" },
  { symbol: "2408", name: "南亞科" }, { symbol: "6770", name: "力積電" }, { symbol: "3037", name: "欣興" },
  { symbol: "2368", name: "金像電" }, { symbol: "6274", name: "台燿" }, { symbol: "2383", name: "台光電" },
  { symbol: "3706", name: "神達" }, { symbol: "2449", name: "京元電子" }, { symbol: "3189", name: "景碩" },
  { symbol: "8046", name: "南電" }, { symbol: "3260", name: "威剛" }, { symbol: "8299", name: "群聯" },
  { symbol: "3105", name: "穩懋" }, { symbol: "8086", name: "宏捷科" }, { symbol: "2603", name: "長榮" },
  { symbol: "2609", name: "陽明" }, { symbol: "2615", name: "萬海" }, { symbol: "2618", name: "長榮航" },
  { symbol: "2610", name: "華航" }, { symbol: "1513", name: "中興電" }, { symbol: "1519", name: "華城" },
  { symbol: "1504", name: "東元" }, { symbol: "1609", name: "大亞" }, { symbol: "6443", name: "元晶" },
  { symbol: "3576", name: "聯合再生" }, { symbol: "2881", name: "富邦金" }, { symbol: "2882", name: "國泰金" },
  { symbol: "2884", name: "玉山金" }, { symbol: "2885", name: "元大金" }, { symbol: "2886", name: "兆豐金" },
  { symbol: "2891", name: "中信金" }, { symbol: "2892", name: "第一金" }, { symbol: "2412", name: "中華電" },
  { symbol: "3045", name: "台灣大" }, { symbol: "2912", name: "統一超" }, { symbol: "1216", name: "統一" },
  { symbol: "1301", name: "台塑" }, { symbol: "1303", name: "南亞" }, { symbol: "2002", name: "中鋼" },
];

function cleanSymbol(value: unknown): string {
  return String(value ?? "").trim().replace(/\.(TW|TWO)$/i, "").replace(/[^\d]/g, "");
}
function parseNumber(value: unknown): number {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function isTradableCommonStock(stock: Stock): boolean {
  const text = `${stock.symbol} ${stock.name}`;
  if (!/^\d{4}$/.test(stock.symbol)) return false;
  return !/(ETF|ETN|債|權證|購|售|牛|熊)/i.test(text);
}
function dedupeStocks(stocks: Stock[]): Stock[] {
  const map = new Map<string, Stock>();
  for (const stock of stocks) {
    const symbol = cleanSymbol(stock.symbol);
    const name = String(stock.name ?? "").trim() || symbol;
    if (!symbol) continue;
    if (!map.has(symbol)) map.set(symbol, { symbol, name });
  }
  return Array.from(map.values()).filter(isTradableCommonStock).slice(0, 100);
}
async function fetchJson(url: string) {
  const response = await fetch(url, { headers: { Accept: "application/json,text/plain,*/*" } });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { throw new Error(`JSON parse failed: ${text.slice(0, 300)}`); }
}
function parseTwseStockDayAll(data: unknown): (Stock & { amount?: number; volume?: number; changePct?: number })[] {
  if (!Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map((row) => ({
    symbol: cleanSymbol(row.Code ?? row["證券代號"] ?? row["代號"]),
    name: String(row.Name ?? row["證券名稱"] ?? row["名稱"] ?? "").trim(),
    amount: parseNumber(row.TradeValue ?? row["成交金額"]),
    volume: parseNumber(row.TradeVolume ?? row["成交股數"]),
    changePct: parseNumber(row.Change ?? row["漲跌價差"]),
  })).filter((s) => s.symbol && s.name);
}
async function getPublicHotStocks() {
  const debug: Array<Record<string, unknown>> = [];
  try {
    const url = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL";
    const data = await fetchJson(url);
    const rows = parseTwseStockDayAll(data);
    const ranked = rows
      .filter(isTradableCommonStock)
      .sort((a, b) => (b.amount || 0) - (a.amount || 0) || (b.volume || 0) - (a.volume || 0));
    const stocks = dedupeStocks(ranked);
    debug.push({ source: "twse-STOCK_DAY_ALL", ok: true, rawCount: rows.length, count: stocks.length });
    return { stocks, source: "twse-STOCK_DAY_ALL", debug };
  } catch (error) {
    debug.push({ source: "twse-STOCK_DAY_ALL", ok: false, error: error instanceof Error ? error.message : String(error) });
    return { stocks: [], source: "none", debug };
  }
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const publicResult = await getPublicHotStocks();
    if (publicResult.stocks.length > 0) {
      return new Response(JSON.stringify({ success: true, source: publicResult.source, updatedAt: new Date().toISOString(), stocks: publicResult.stocks, debug: publicResult.debug }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ success: false, source: "fallback", message: "公開資料取得失敗或為空，已使用內建熱門股清單", updatedAt: new Date().toISOString(), stocks: fallbackHotStocks, debug: publicResult.debug }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, source: "fallback", message: "Edge Function 發生錯誤，已使用內建熱門股清單", updatedAt: new Date().toISOString(), stocks: fallbackHotStocks, debug: [{ source: "edge-function", ok: false, error: error instanceof Error ? error.message : String(error) }] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
