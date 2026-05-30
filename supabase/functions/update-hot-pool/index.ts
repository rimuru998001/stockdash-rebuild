export {};

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
  serve: (
    handler: (req: Request) => Response | Promise<Response>,
  ) => void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json; charset=utf-8",
};

type Stock = {
  symbol: string;
  name: string;
};

function getSupabaseUrl() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL");
  }

  return supabaseUrl.replace(/\/$/, "");
}

function getFunctionUrl(functionName: string) {
  return `${getSupabaseUrl()}/functions/v1/${functionName}`;
}

function getRestUrl(path: string) {
  return `${getSupabaseUrl()}/rest/v1/${path}`;
}

function getFunctionHeaders() {
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (anonKey) {
    headers.apikey = anonKey;
    headers.Authorization = `Bearer ${anonKey}`;
  }

  return headers;
}

function getDatabaseHeaders() {
  const apiKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_ANON_KEY");

  if (!apiKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY");
  }

  return {
    "Content-Type": "application/json",
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
  };
}

function cleanSymbol(symbol: unknown) {
  return String(symbol ?? "")
    .trim()
    .toUpperCase()
    .replace(".TW", "")
    .replace(".TWO", "");
}

function normalizeStock(item: any): Stock | null {
  const symbol = cleanSymbol(item?.symbol || item?.code || item?.代號 || "");
  const name = String(
    item?.name ||
      item?.stockName ||
      item?.名稱 ||
      item?.股票名稱 ||
      item?.公司名稱 ||
      item?.symbol ||
      symbol,
  ).trim();

  if (!symbol) return null;

  return {
    symbol,
    name: name || symbol,
  };
}

function dedupeStocks(rawStocks: any[]) {
  const stockMap = new Map<string, Stock>();

  rawStocks.forEach((item) => {
    const stock = normalizeStock(item);

    if (!stock || stockMap.has(stock.symbol)) return;

    stockMap.set(stock.symbol, stock);
  });

  return Array.from(stockMap.values()).slice(0, 100);
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchHotStocks() {
  const response = await fetch(getFunctionUrl("get-hot-stocks"), {
    method: "GET",
    headers: getFunctionHeaders(),
  });

  const text = await response.text();
  let json: any;

  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`get-hot-stocks 回傳格式錯誤：${text.slice(0, 120)}`);
  }

  if (!response.ok) {
    throw new Error(
      json?.message || json?.error || `get-hot-stocks HTTP ${response.status}`,
    );
  }

  const rawStocks = Array.isArray(json?.stocks)
    ? json.stocks
    : Array.isArray(json?.data)
      ? json.data
      : [];

  return {
    stocks: dedupeStocks(rawStocks),
    source: String(json?.source || "get-hot-stocks"),
  };
}

async function replaceTodayHotPool(stocks: Stock[], source: string) {
  const poolDate = getTodayDate();
  const deleteUrl = new URL(getRestUrl("hot_pool_cache"));

  deleteUrl.searchParams.set("pool_date", `eq.${poolDate}`);

  const deleteResponse = await fetch(deleteUrl.toString(), {
    method: "DELETE",
    headers: getDatabaseHeaders(),
  });

  if (!deleteResponse.ok) {
    const text = await deleteResponse.text().catch(() => "");
    throw new Error(`hot_pool_cache delete failed HTTP ${deleteResponse.status}: ${text}`);
  }

  if (stocks.length === 0) {
    return { poolDate, insertedCount: 0 };
  }

  const rows = stocks.map((stock, index) => ({
    symbol: stock.symbol,
    name: stock.name,
    rank: index + 1,
    source,
    pool_date: poolDate,
  }));

  const insertResponse = await fetch(getRestUrl("hot_pool_cache"), {
    method: "POST",
    headers: {
      ...getDatabaseHeaders(),
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });

  if (!insertResponse.ok) {
    const text = await insertResponse.text().catch(() => "");
    throw new Error(`hot_pool_cache insert failed HTTP ${insertResponse.status}: ${text}`);
  }

  return { poolDate, insertedCount: rows.length };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const autoScanSecret = Deno.env.get("AUTO_SCAN_SECRET");
    const url = new URL(req.url);
    const secretFromQuery = url.searchParams.get("secret");

    if (!autoScanSecret) {
      throw new Error("Missing AUTO_SCAN_SECRET");
    }

    if (secretFromQuery !== autoScanSecret) {
      return new Response(
        JSON.stringify({
          success: false,
          functionVersion: "update-hot-pool-v1",
          message: "Unauthorized",
        }),
        {
          status: 401,
          headers: jsonHeaders,
        },
      );
    }

    const hotPool = await fetchHotStocks();
    const result = await replaceTodayHotPool(hotPool.stocks, hotPool.source);

    return new Response(
      JSON.stringify({
        success: true,
        functionVersion: "update-hot-pool-v1",
        source: hotPool.source,
        poolDate: result.poolDate,
        count: result.insertedCount,
      }),
      {
        status: 200,
        headers: jsonHeaders,
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        functionVersion: "update-hot-pool-v1",
        message: "update-hot-pool Edge Function error",
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 200,
        headers: jsonHeaders,
      },
    );
  }
});
