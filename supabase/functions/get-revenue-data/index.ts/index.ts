declare const Deno: {
  serve: (
    handler: (req: Request) => Response | Promise<Response>,
  ) => void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json; charset=utf-8",
};

type RevenueResult = {
  symbol: string;
  name: string;
  period: string;
  source: string;
  monthlyRevenue: number | null;
  previousMonthRevenue: number | null;
  lastYearMonthRevenue: number | null;
  momPercent: number | null;
  yoyPercent: number | null;
  cumulativeRevenue: number | null;
  lastYearCumulativeRevenue: number | null;
  cumulativeYoyPercent: number | null;
  revenueScore: number;
  revenueLevel: string;
  revenueReasons: string[];
};

const twNameOverrides: Record<string, string> = {
  "2330": "台積電",
  "2317": "鴻海",
  "2454": "聯發科",
  "2308": "台達電",
  "2412": "中華電",
  "2303": "聯電",
  "2382": "廣達",
  "2357": "華碩",
  "3231": "緯創",
  "6669": "緯穎",
  "2376": "技嘉",
  "2377": "微星",

  "3260": "威剛",
  "6805": "富世達",
  "1717": "長興",

  "2881": "富邦金",
  "2882": "國泰金",
  "2884": "玉山金",
  "2885": "元大金",
  "2886": "兆豐金",
  "2887": "台新金",
  "2891": "中信金",
};

function cleanSymbol(symbol: string): string {
  return String(symbol || "")
    .trim()
    .toUpperCase()
    .replace(".TW", "")
    .replace(".TWO", "");
}

function pickValue(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row?.[key];

    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return "";
}

function toNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null;

  const text = String(value)
    .replace(/,/g, "")
    .replace(/%/g, "")
    .replace(/--/g, "")
    .replace(/－/g, "-")
    .replace(/N\/A/gi, "")
    .trim();

  if (!text) return null;

  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function normalizePeriod(period: string): string {
  const text = String(period || "").trim();

  if (!text) return "";

  const minguoMatch = text.match(/^(\d{2,3})[年/.-]\s*(\d{1,2})/);

  if (minguoMatch) {
    const year = Number(minguoMatch[1]);
    const month = Number(minguoMatch[2]);
    const westernYear = year < 1911 ? year + 1911 : year;

    return `${westernYear}-${String(month).padStart(2, "0")}`;
  }

  const westernMatch = text.match(/^(\d{4})[年/.-]\s*(\d{1,2})/);

  if (westernMatch) {
    return `${westernMatch[1]}-${String(Number(westernMatch[2])).padStart(2, "0")}`;
  }

  return text;
}

function decodeHtml(text: string) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function getStockNameFromTitle(title: string, fallbackSymbol: string) {
  const decoded = decodeHtml(title || "");
  const match = decoded.match(/^([^(\-｜|]+?)\s*\(\s*\d{4,6}/);
  const name = match?.[1]?.trim();

  if (name && /[\u4e00-\u9fff]/.test(name)) return name;

  return twNameOverrides[fallbackSymbol] || fallbackSymbol;
}

function revenueScoreAndReasons(args: {
  yoyPercent: number | null;
  momPercent: number | null;
  cumulativeYoyPercent: number | null;
}) {
  const reasons: string[] = [];
  let score = 0;

  const yoy = args.yoyPercent;
  const mom = args.momPercent;
  const cumulativeYoy = args.cumulativeYoyPercent;

  if (yoy === null) {
    reasons.push("單月營收年增率資料不足");
  } else if (yoy >= 30) {
    score += 15;
    reasons.push(`單月營收年增率 ${yoy.toFixed(1)}%，成長強勁`);
  } else if (yoy >= 10) {
    score += 12;
    reasons.push(`單月營收年增率 ${yoy.toFixed(1)}%，成長漂亮`);
  } else if (yoy > 0) {
    score += 7;
    reasons.push(`單月營收年增率 ${yoy.toFixed(1)}%，小幅成長`);
  } else {
    score -= 8;
    reasons.push(`單月營收年增率 ${yoy.toFixed(1)}%，年減`);
  }

  if (cumulativeYoy === null) {
    reasons.push("累計營收年增率資料不足");
  } else if (cumulativeYoy >= 30) {
    score += 12;
    reasons.push(`累計營收年增率 ${cumulativeYoy.toFixed(1)}%，基本面強`);
  } else if (cumulativeYoy >= 10) {
    score += 10;
    reasons.push(`累計營收年增率 ${cumulativeYoy.toFixed(1)}%，基本面穩健成長`);
  } else if (cumulativeYoy > 0) {
    score += 5;
    reasons.push(`累計營收年增率 ${cumulativeYoy.toFixed(1)}%，累計仍成長`);
  } else {
    score -= 8;
    reasons.push(`累計營收年增率 ${cumulativeYoy.toFixed(1)}%，累計衰退`);
  }

  if (mom === null) {
    reasons.push("月增率資料不足");
  } else if (mom >= 15) {
    score += 3;
    reasons.push(`月增率 ${mom.toFixed(1)}%，短期動能轉強`);
  } else if (mom >= 0) {
    score += 1;
    reasons.push(`月增率 ${mom.toFixed(1)}%，月營收持平或成長`);
  } else if (mom <= -20) {
    score -= 4;
    reasons.push(`月增率 ${mom.toFixed(1)}%，短期營收明顯下滑`);
  } else {
    reasons.push(`月增率 ${mom.toFixed(1)}%，短期略降`);
  }

  score = Math.max(0, Math.min(30, score));

  let level = "營收普通";
  if (score >= 24) level = "營收強勁";
  else if (score >= 18) level = "營收漂亮";
  else if (score >= 10) level = "營收尚可";
  else if (score <= 5) level = "營收偏弱";

  return {
    revenueScore: score,
    revenueLevel: level,
    revenueReasons: reasons,
  };
}

function normalizeRevenueRow(
  row: Record<string, unknown>,
  sourceName: string,
): RevenueResult | null {
  const symbol = cleanSymbol(
    pickValue(row, [
      "公司代號",
      "公司代碼",
      "出表公司代號",
      "Code",
      "code",
      "公司",
      "代號",
    ]),
  );

  if (!symbol) return null;

  const name =
    pickValue(row, [
      "公司名稱",
      "出表公司名稱",
      "公司簡稱",
      "Name",
      "name",
      "名稱",
    ]) ||
    twNameOverrides[symbol] ||
    symbol;

  const period = normalizePeriod(
    pickValue(row, [
      "資料年月",
      "年月",
      "營收年月",
      "出表日期",
      "RevenueYearMonth",
      "Period",
      "period",
    ]),
  );

  const monthlyRevenue = toNumber(
    pickValue(row, [
      "當月營收",
      "本月營收淨額",
      "本月營業收入淨額",
      "營業收入-當月營收",
      "MonthlyRevenue",
      "monthlyRevenue",
    ]),
  );

  const previousMonthRevenue = toNumber(
    pickValue(row, [
      "上月營收",
      "上月營收淨額",
      "上月營業收入淨額",
      "PreviousMonthRevenue",
    ]),
  );

  const lastYearMonthRevenue = toNumber(
    pickValue(row, [
      "去年當月營收",
      "去年本月營收",
      "去年同月營收",
      "LastYearMonthRevenue",
    ]),
  );

  const momPercent = toNumber(
    pickValue(row, [
      "上月比較增減(%)",
      "上月比較增減%",
      "上月比較增減",
      "上月比較增減率",
      "月增率",
      "MoM",
      "momPercent",
    ]),
  );

  const yoyPercent = toNumber(
    pickValue(row, [
      "去年同月增減(%)",
      "去年同月增減%",
      "去年同月增減",
      "去年同月增減率",
      "年增率",
      "YoY",
      "yoyPercent",
    ]),
  );

  const cumulativeRevenue = toNumber(
    pickValue(row, [
      "當月累計營收",
      "本年累計營收",
      "累計營收",
      "累計營業收入",
      "CumulativeRevenue",
    ]),
  );

  const lastYearCumulativeRevenue = toNumber(
    pickValue(row, [
      "去年累計營收",
      "去年同期累計營收",
      "LastYearCumulativeRevenue",
    ]),
  );

  const cumulativeYoyPercent = toNumber(
    pickValue(row, [
      "前期比較增減(%)",
      "前期比較增減%",
      "前期比較增減",
      "累計營收年增率",
      "累計年增率",
      "CumulativeYoY",
      "cumulativeYoyPercent",
    ]),
  );

  const scoreInfo = revenueScoreAndReasons({
    yoyPercent,
    momPercent,
    cumulativeYoyPercent,
  });

  return {
    symbol,
    name,
    period,
    source: sourceName,
    monthlyRevenue,
    previousMonthRevenue,
    lastYearMonthRevenue,
    momPercent,
    yoyPercent,
    cumulativeRevenue,
    lastYearCumulativeRevenue,
    cumulativeYoyPercent,
    ...scoreInfo,
  };
}

async function fetchJsonArray(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json,text/plain,*/*",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const text = await response.text();

  let data: unknown;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Not JSON: ${text.slice(0, 80)}`);
  }

  if (!Array.isArray(data)) {
    throw new Error("response is not array");
  }

  return data as Record<string, unknown>[];
}

async function fetchYahooRevenueData(symbol: string) {
  const clean = cleanSymbol(symbol);

  if (!/^\d{4,6}$/.test(clean)) return null;

  const yahooSymbols = [`${clean}.TW`, `${clean}.TWO`];

  for (const yahooSymbol of yahooSymbols) {
    try {
      const url = `https://tw.stock.yahoo.com/quote/${encodeURIComponent(
        yahooSymbol,
      )}/revenue`;

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "text/html,application/xhtml+xml,*/*",
        },
      });

      if (!response.ok) continue;

      const html = await response.text();

      const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
      const name = getStockNameFromTitle(titleMatch?.[1] || "", clean);

      const plain = decodeHtml(html)
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ");

      const rowRegex =
        /(\d{4}\/\d{2})\s+([\d,]+)\s+(-?[\d.]+)%\s+([\d,]+)\s+(-?[\d.]+)%\s+([\d,]+)\s+([\d,]+)\s+(-?[\d.]+)%/g;

      const matches = [...plain.matchAll(rowRegex)];

      if (matches.length === 0) continue;

      const history: RevenueResult[] = matches.slice(0, 12).map((match) => {
        const period = normalizePeriod(match[1]);
        const monthlyRevenue = toNumber(match[2]);
        const momPercent = toNumber(match[3]);
        const lastYearMonthRevenue = toNumber(match[4]);
        const yoyPercent = toNumber(match[5]);
        const cumulativeRevenue = toNumber(match[6]);
        const lastYearCumulativeRevenue = toNumber(match[7]);
        const cumulativeYoyPercent = toNumber(match[8]);

        const previousMonthRevenue =
          monthlyRevenue !== null && momPercent !== null
            ? monthlyRevenue / (1 + momPercent / 100)
            : null;

        const scoreInfo = revenueScoreAndReasons({
          yoyPercent,
          momPercent,
          cumulativeYoyPercent,
        });

        return {
          symbol: clean,
          name,
          period,
          source: `YAHOO_REVENUE_${yahooSymbol}`,
          monthlyRevenue,
          previousMonthRevenue,
          lastYearMonthRevenue,
          momPercent,
          yoyPercent,
          cumulativeRevenue,
          lastYearCumulativeRevenue,
          cumulativeYoyPercent,
          ...scoreInfo,
        };
      });

      history.sort((a, b) => String(b.period).localeCompare(String(a.period)));

      return {
        result: history[0],
        history,
        debugItem: {
          source: `YAHOO_REVENUE_${yahooSymbol}`,
          ok: true,
          matches: history.length,
        },
      };
    } catch (error) {
      // try next candidate
    }
  }

  return null;
}

async function fetchRevenueData(symbol: string) {
  const clean = cleanSymbol(symbol);

  if (!/^\d{4,6}$/.test(clean)) {
    throw new Error("只支援台股數字代號，例如 2330、3260");
  }

  const debug: Array<Record<string, unknown>> = [];

  // 第一優先：Yahoo 營收頁
  const yahooFallback = await fetchYahooRevenueData(clean);

  if (yahooFallback?.result) {
    debug.push(yahooFallback.debugItem);

    return {
      result: yahooFallback.result,
      history: yahooFallback.history,
      debug,
    };
  }

  // 第二優先：TWSE OpenAPI 備援
  const sources = [
    {
      name: "TWSE_MOPS_MONTHLY_REVENUE_L",
      url: "https://openapi.twse.com.tw/v1/opendata/t187ap05_L",
    },
    {
      name: "TWSE_MOPS_MONTHLY_REVENUE_15_L",
      url: "https://openapi.twse.com.tw/v1/opendata/t187ap15_L",
    },
  ];

  for (const source of sources) {
    try {
      const rows = await fetchJsonArray(source.url);

      const matches = rows
        .map((row) => normalizeRevenueRow(row, source.name))
        .filter((item): item is RevenueResult => Boolean(item))
        .filter((item) => item.symbol === clean);

      debug.push({
        source: source.name,
        ok: true,
        totalRows: rows.length,
        matches: matches.length,
      });

      if (matches.length > 0) {
        matches.sort((a, b) => String(b.period).localeCompare(String(a.period)));

        return {
          result: matches[0],
          history: matches.slice(0, 12),
          debug,
        };
      }
    } catch (error) {
      debug.push({
        source: source.name,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    result: null,
    history: [],
    debug,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const symbolFromQuery = url.searchParams.get("symbol");

    let bodySymbol = "";

    if (req.method === "POST") {
      try {
        const body = await req.json();
        bodySymbol = body?.symbol || "";
      } catch {
        // ignore empty body
      }
    }

    const inputSymbol = cleanSymbol(symbolFromQuery || bodySymbol || "");

    if (!inputSymbol) {
      return new Response(
        JSON.stringify({
          success: false,
          functionVersion: "revenue-data-v3-yahoo-first",
          message: "請提供 symbol，例如 ?symbol=2330",
        }),
        {
          status: 200,
          headers: jsonHeaders,
        },
      );
    }

    const data = await fetchRevenueData(inputSymbol);

    if (!data.result) {
      return new Response(
        JSON.stringify({
          success: false,
          functionVersion: "revenue-data-v3-yahoo-first",
          inputSymbol,
          message: "查無營收資料",
          revenue: null,
          history: [],
          debug: data.debug,
        }),
        {
          status: 200,
          headers: jsonHeaders,
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        functionVersion: "revenue-data-v3-yahoo-first",
        inputSymbol,
        revenue: data.result,
        history: data.history,
        debug: data.debug,
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
        functionVersion: "revenue-data-v3-yahoo-first",
        message: "get-revenue-data Edge Function error",
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 200,
        headers: jsonHeaders,
      },
    );
  }
});