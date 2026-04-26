const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type Candle = { time: string; open: number; high: number; low: number; close: number; volume: number };

function cleanSymbol(value: unknown): string {
  return String(value ?? "").trim().replace(/\.(TW|TWO)$/i, "").replace(/[^A-Za-z0-9.^-]/g, "").toUpperCase();
}
function isTaiwanNumberSymbol(symbol: string) {
  return /^\d{4,6}$/.test(symbol);
}
function rangeToParams(range: string) {
  switch (range) {
    case "1mo": return { range: "1mo", interval: "1d" };
    case "3mo": return { range: "3mo", interval: "1d" };
    case "1y": return { range: "1y", interval: "1d" };
    case "2y": return { range: "2y", interval: "1d" };
    case "6mo":
    default: return { range: "6mo", interval: "1d" };
  }
}
function candidateSymbols(raw: string) {
  const symbol = cleanSymbol(raw);
  if (!symbol) return [];
  if (symbol.includes(".") || !isTaiwanNumberSymbol(symbol)) return [symbol];
  return [`${symbol}.TW`, `${symbol}.TWO`, symbol];
}
async function fetchYahooChart(yahooSymbol: string, range: string) {
  const params = rangeToParams(range);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=${params.range}&interval=${params.interval}&events=history&includeAdjustedClose=true`;
  const response = await fetch(url, { headers: { Accept: "application/json,text/plain,*/*" } });
  const text = await response.text();
  if (!response.ok) throw new Error(`Yahoo HTTP ${response.status}: ${text.slice(0, 200)}`);
  const json = JSON.parse(text);
  const result = json?.chart?.result?.[0];
  const error = json?.chart?.error;
  if (error || !result) throw new Error(error?.description || "No chart result");
  const timestamps: number[] = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const meta = result.meta || {};
  const candles: Candle[] = timestamps.map((t, i) => ({
    time: new Date(t * 1000).toISOString().slice(0, 10),
    open: Number(quote.open?.[i]),
    high: Number(quote.high?.[i]),
    low: Number(quote.low?.[i]),
    close: Number(quote.close?.[i]),
    volume: Number(quote.volume?.[i] || 0),
  })).filter((c) => Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close));
  if (candles.length === 0) throw new Error("No candles");
  return {
    meta: {
      symbol: cleanSymbol(meta.symbol || yahooSymbol).replace(/\.(TW|TWO)$/i, ""),
      yahooSymbol,
      name: meta.longName || meta.shortName || yahooSymbol,
      currency: meta.currency || (yahooSymbol.endsWith(".TW") || yahooSymbol.endsWith(".TWO") ? "TWD" : "USD"),
      exchangeName: meta.exchangeName,
      regularMarketPrice: meta.regularMarketPrice,
      regularMarketChange: meta.regularMarketPrice && candles.length > 1 ? meta.regularMarketPrice - candles.at(-2)!.close : undefined,
      regularMarketChangePercent: undefined,
    },
    candles,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = req.method === "GET" ? Object.fromEntries(new URL(req.url).searchParams) : await req.json().catch(() => ({}));
    const symbol = String(body.symbol || body.s || "").trim();
    const range = String(body.range || "6mo");
    const candidates = candidateSymbols(symbol);
    const errors: string[] = [];
    for (const yahooSymbol of candidates) {
      try {
        const result = await fetchYahooChart(yahooSymbol, range);
        return new Response(JSON.stringify({ success: true, requestedSymbol: symbol, yahooSymbol, meta: result.meta, candles: result.candles, fallbackTried: candidates }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (error) {
        errors.push(`${yahooSymbol}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return new Response(JSON.stringify({ success: false, requestedSymbol: symbol, message: `股票資料取得失敗：${errors.join(" | ")}` }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: error instanceof Error ? error.message : String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
