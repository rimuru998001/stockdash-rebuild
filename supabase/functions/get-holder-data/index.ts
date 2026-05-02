export {};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json; charset=utf-8",
};

type DistributionRow = {
  date: string;
  symbol: string;
  levelRaw: string;
  levelNo: number | null;
  holders: number;
  shares: number;
  ratio: number;
  bucket: "retail" | "middle" | "large" | "whale" | "total" | "unknown";
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
  "3017": "奇鋐",
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

function toNumber(value: unknown): number {
  if (value === undefined || value === null) return 0;

  const text = String(value)
    .replace(/,/g, "")
    .replace(/%/g, "")
    .replace(/--/g, "")
    .replace(/－/g, "-")
    .trim();

  if (!text) return 0;

  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
}

function normalizeKey(key: string) {
  return String(key || "")
    .replace(/^\uFEFF/, "")
    .replace(/\s+/g, "")
    .trim();
}

function pick(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const direct = row[key];
    if (direct !== undefined && direct !== null && String(direct).trim() !== "") {
      return String(direct).trim();
    }

    const normalizedTarget = normalizeKey(key);
    const foundKey = Object.keys(row).find((k) => normalizeKey(k) === normalizedTarget);

    if (foundKey && row[foundKey] !== undefined && String(row[foundKey]).trim() !== "") {
      return String(row[foundKey]).trim();
    }
  }

  return "";
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current.trim());

  return result.map((v) => v.replace(/^"|"$/g, "").trim());
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim());

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map(normalizeKey);
  const rows: Record<string, string>[] = [];

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });

    rows.push(row);
  }

  return rows;
}

function decodeBuffer(buffer: ArrayBuffer) {
  const utf8 = new TextDecoder("utf-8").decode(buffer);

  // 如果 UTF-8 解出來明顯亂碼，再嘗試 Big5。
  const badCharCount = (utf8.match(/�/g) || []).length;

  if (badCharCount <= 3) {
    return utf8;
  }

  try {
    return new TextDecoder("big5").decode(buffer);
  } catch {
    return utf8;
  }
}

function getBucket(levelRaw: string): {
  levelNo: number | null;
  bucket: DistributionRow["bucket"];
} {
  const raw = String(levelRaw || "").trim();

  if (!raw) return { levelNo: null, bucket: "unknown" };

  if (/合計|總計|total/i.test(raw)) {
    return { levelNo: null, bucket: "total" };
  }

  const numericLevel = Number(raw);

  if (Number.isFinite(numericLevel)) {
    // 集保股權分散表常見級距：
    // 1~8   ：1~50,000 股，偏散戶
    // 9~11  ：50,001~400,000 股，中戶
    // 12~14 ：400,001~1,000,000 股，大戶
    // 15    ：1,000,001 股以上，千張以上大戶
    // 16/17 ：常見為調整 / 合計資料，不應納入大戶比例計算
    if (numericLevel >= 16) return { levelNo: numericLevel, bucket: "total" };
    if (numericLevel === 15) return { levelNo: numericLevel, bucket: "whale" };
    if (numericLevel >= 12) return { levelNo: numericLevel, bucket: "large" };
    if (numericLevel >= 9) return { levelNo: numericLevel, bucket: "middle" };
    if (numericLevel >= 1) return { levelNo: numericLevel, bucket: "retail" };

    return { levelNo: numericLevel, bucket: "unknown" };
  }

  const numbers = raw
    .replace(/,/g, "")
    .match(/\d+/g)
    ?.map(Number)
    .filter((n) => Number.isFinite(n));

  if (!numbers || numbers.length === 0) {
    return { levelNo: null, bucket: "unknown" };
  }

  const min = numbers[0];
  const max = numbers.length >= 2 ? numbers[1] : null;

  if (/以上/.test(raw) || min >= 1_000_001) {
    return { levelNo: null, bucket: "whale" };
  }

  if (min >= 400_001) {
    return { levelNo: null, bucket: "large" };
  }

  if (max !== null && max <= 50_000) {
    return { levelNo: null, bucket: "retail" };
  }

  if (min >= 50_001 && min <= 400_000) {
    return { levelNo: null, bucket: "middle" };
  }

  return { levelNo: null, bucket: "unknown" };
}

async function fetchTdccRows() {
  const urls = [
    "https://opendata.tdcc.com.tw/getOD.ashx?id=1-5",
  ];

  const debug: Array<Record<string, unknown>> = [];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "text/csv,text/plain,*/*",
        },
      });

      const buffer = await response.arrayBuffer();
      const text = decodeBuffer(buffer);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 100)}`);
      }

      const rows = parseCsv(text);

      debug.push({
        source: url,
        ok: true,
        rows: rows.length,
        sampleKeys: rows[0] ? Object.keys(rows[0]).slice(0, 10) : [],
      });

      if (rows.length > 0) {
        return { rows, debug };
      }
    } catch (error) {
      debug.push({
        source: url,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { rows: [] as Record<string, string>[], debug };
}

function normalizeDistributionRow(row: Record<string, string>): DistributionRow | null {
  const date = pick(row, ["資料日期", "date", "Date"]);
  const symbol = cleanSymbol(
    pick(row, ["證券代號", "股票代號", "公司代號", "stock_id", "StockID", "code"])
  );

  const levelRaw = pick(row, ["持股分級", "分級", "ShareholdingLevel", "level"]);
  const holders = toNumber(pick(row, ["人數", "持股人數", "NumberOfHolders", "holders"]));
  const shares = toNumber(pick(row, ["股數", "NumberOfShares", "shares"]));
  const ratio = toNumber(
    pick(row, [
      "占集保庫存數比例%",
      "占集保庫存數比例",
      "佔集保庫存數比例%",
      "佔集保庫存數比例",
      "Percentage",
      "ratio",
    ])
  );

  if (!symbol || !levelRaw) return null;

  const bucketInfo = getBucket(levelRaw);

  return {
    date,
    symbol,
    levelRaw,
    levelNo: bucketInfo.levelNo,
    holders,
    shares,
    ratio,
    bucket: bucketInfo.bucket,
  };
}

function sumRatio(rows: DistributionRow[], buckets: DistributionRow["bucket"][]) {
  return rows
    .filter((row) => buckets.includes(row.bucket))
    .reduce((sum, row) => sum + row.ratio, 0);
}

function sumHolders(rows: DistributionRow[], buckets: DistributionRow["bucket"][]) {
  return rows
    .filter((row) => buckets.includes(row.bucket))
    .reduce((sum, row) => sum + row.holders, 0);
}

function scoreHolderData(rows: DistributionRow[]) {
  const reasons: string[] = [];
  let holderScore = 0;

  const largeHolderRatio = sumRatio(rows, ["large", "whale"]);
  const whaleHolderRatio = sumRatio(rows, ["whale"]);
  const middleHolderRatio = sumRatio(rows, ["middle"]);
  const retailHolderRatio = sumRatio(rows, ["retail"]);

  const largeHolderCount = sumHolders(rows, ["large", "whale"]);
  const retailHolderCount = sumHolders(rows, ["retail"]);

  if (largeHolderRatio >= 65) {
    holderScore += 14;
    reasons.push(`大戶持股比例 ${largeHolderRatio.toFixed(2)}%，籌碼高度集中`);
  } else if (largeHolderRatio >= 50) {
    holderScore += 11;
    reasons.push(`大戶持股比例 ${largeHolderRatio.toFixed(2)}%，籌碼偏集中`);
  } else if (largeHolderRatio >= 35) {
    holderScore += 7;
    reasons.push(`大戶持股比例 ${largeHolderRatio.toFixed(2)}%，有一定集中度`);
  } else {
    holderScore += 2;
    reasons.push(`大戶持股比例 ${largeHolderRatio.toFixed(2)}%，集中度普通`);
  }

  if (whaleHolderRatio >= 25) {
    holderScore += 8;
    reasons.push(`千張以上持股比例 ${whaleHolderRatio.toFixed(2)}%，大戶核心持股強`);
  } else if (whaleHolderRatio >= 12) {
    holderScore += 5;
    reasons.push(`千張以上持股比例 ${whaleHolderRatio.toFixed(2)}%，有核心大戶`);
  } else {
    reasons.push(`千張以上持股比例 ${whaleHolderRatio.toFixed(2)}%，核心大戶比例不高`);
  }

  if (retailHolderRatio <= 15) {
    holderScore += 6;
    reasons.push(`散戶級距持股比例 ${retailHolderRatio.toFixed(2)}%，浮額相對較少`);
  } else if (retailHolderRatio <= 30) {
    holderScore += 4;
    reasons.push(`散戶級距持股比例 ${retailHolderRatio.toFixed(2)}%，籌碼不算分散`);
  } else if (retailHolderRatio >= 55) {
    holderScore -= 7;
    reasons.push(`散戶級距持股比例 ${retailHolderRatio.toFixed(2)}%，籌碼偏分散`);
  } else {
    reasons.push(`散戶級距持股比例 ${retailHolderRatio.toFixed(2)}%，分散程度普通`);
  }

  if (middleHolderRatio >= 20 && largeHolderRatio >= 35) {
    holderScore += 2;
    reasons.push("中戶與大戶合計比例不低，籌碼結構有支撐");
  }

  holderScore = Math.max(0, Math.min(30, Math.round(holderScore)));

  let holderLevel = "籌碼普通";
  if (holderScore >= 24) holderLevel = "籌碼高度集中";
  else if (holderScore >= 18) holderLevel = "籌碼偏集中";
  else if (holderScore >= 10) holderLevel = "籌碼尚可";
  else if (holderScore <= 5) holderLevel = "籌碼分散";

  return {
    holderScore,
    holderLevel,
    largeHolderRatio,
    whaleHolderRatio,
    middleHolderRatio,
    retailHolderRatio,
    largeHolderCount,
    retailHolderCount,
    reasons,
  };
}

async function getHolderData(symbol: string) {
  const clean = cleanSymbol(symbol);

  if (!/^\d{4,6}$/.test(clean)) {
    throw new Error("只支援台股數字代號，例如 2330、3260");
  }

  const { rows, debug } = await fetchTdccRows();

  const normalized = rows
    .map(normalizeDistributionRow)
    .filter((item): item is DistributionRow => Boolean(item));

  const matched = normalized.filter((row) => row.symbol === clean);

  debug.push({
    normalizedRows: normalized.length,
    matchedRows: matched.length,
    symbol: clean,
  });

  if (matched.length === 0) {
    return {
      result: null,
      debug,
    };
  }

  const latestDate = matched
    .map((row) => row.date)
    .filter(Boolean)
    .sort()
    .at(-1);

  const latestRows = latestDate
    ? matched.filter((row) => row.date === latestDate)
    : matched;

  const scoreInfo = scoreHolderData(latestRows);

  return {
    result: {
      symbol: clean,
      name: twNameOverrides[clean] || clean,
      date: latestDate || latestRows[0]?.date || "",
      source: "TDCC_SHAREHOLDING_DISTRIBUTION",
      ...scoreInfo,

      // 第一版先用當週公開資料，因此週變化先回傳 null。
      // 下一版可以把每週結果存到 Supabase table，再計算 largeHolderRatioChange。
      largeHolderRatioChange: null,
      whaleHolderRatioChange: null,
      retailHolderRatioChange: null,

      distribution: latestRows
        .slice()
        .sort((a, b) => {
          const aa = a.levelNo ?? 999;
          const bb = b.levelNo ?? 999;
          return aa - bb;
        }),
    },
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
          functionVersion: "holder-data-v1",
          message: "請提供 symbol，例如 ?symbol=2330",
        }),
        {
          status: 200,
          headers: jsonHeaders,
        }
      );
    }

    const data = await getHolderData(inputSymbol);

    if (!data.result) {
      return new Response(
        JSON.stringify({
          success: false,
          functionVersion: "holder-data-v1",
          inputSymbol,
          message: "查無集保股權分散資料",
          holder: null,
          debug: data.debug,
        }),
        {
          status: 200,
          headers: jsonHeaders,
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        functionVersion: "holder-data-v1",
        inputSymbol,
        holder: data.result,
        debug: data.debug,
      }),
      {
        status: 200,
        headers: jsonHeaders,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        functionVersion: "holder-data-v1",
        message: "get-holder-data Edge Function error",
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 200,
        headers: jsonHeaders,
      }
    );
  }
});