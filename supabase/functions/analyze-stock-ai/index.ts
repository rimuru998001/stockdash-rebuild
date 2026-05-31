export {};

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
  serve: (
    handler: (req: Request) => Response | Promise<Response>,
  ) => void;
};

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json; charset=utf-8",
};

type StockAnalysisInput = {
  symbol?: string;
  name?: string;
  finalCategory?: string;
  finalScore?: number;
  technicalScore?: number;
  moneyFlowScore?: number;
  revenueScore?: number;
  holderScore?: number;
  revenueYoY?: number;
  cumulativeRevenueYoY?: number;
  largeHolderRatio?: number;
  volumeRatio?: number;
  return20d?: number;
  riskLevel?: string;
  warningFlags?: string[];
  reasons?: string[];
};

type StockAiAnalysis = {
  summary: string;
  bullishPoints: string[];
  riskPoints: string[];
  actionNote: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

function sanitizeString(value: unknown) {
  return String(value ?? "").trim();
}

function sanitizeNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function sanitizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.map((item) => sanitizeString(item)).filter(Boolean).slice(0, 12);
}

function sanitizeInput(payload: any): StockAnalysisInput {
  return {
    symbol: sanitizeString(payload?.symbol),
    name: sanitizeString(payload?.name),
    finalCategory: sanitizeString(payload?.finalCategory),
    finalScore: sanitizeNumber(payload?.finalScore),
    technicalScore: sanitizeNumber(payload?.technicalScore),
    moneyFlowScore: sanitizeNumber(payload?.moneyFlowScore),
    revenueScore: sanitizeNumber(payload?.revenueScore),
    holderScore: sanitizeNumber(payload?.holderScore),
    revenueYoY: sanitizeNumber(payload?.revenueYoY),
    cumulativeRevenueYoY: sanitizeNumber(payload?.cumulativeRevenueYoY),
    largeHolderRatio: sanitizeNumber(payload?.largeHolderRatio),
    volumeRatio: sanitizeNumber(payload?.volumeRatio),
    return20d: sanitizeNumber(payload?.return20d),
    riskLevel: sanitizeString(payload?.riskLevel),
    warningFlags: sanitizeStringArray(payload?.warningFlags),
    reasons: sanitizeStringArray(payload?.reasons),
  };
}

function validateInput(input: StockAnalysisInput) {
  if (!input.symbol) {
    throw new Error("Missing symbol");
  }
}

function buildPrompt(input: StockAnalysisInput) {
  return [
    "你是股票掃描結果的輔助分析器，請使用繁體中文回答。",
    "請只根據使用者提供的 JSON 資料進行分析。",
    "嚴格規則：",
    "1. 只輸出 JSON，不要使用 markdown，不要使用程式碼區塊。",
    "2. 不提供保證獲利、必漲、穩賺等說法。",
    "3. 不直接給買進或賣出指令，不得使用『買進』、『賣出』作為操作命令。",
    "4. actionNote 只能提供觀察建議、追蹤重點或風險控管提醒。",
    "5. 若資料不足，必須明確說資料不足。",
    "6. 不捏造不存在的新聞、財報、法人、籌碼或公司事件。",
    "7. bullishPoints 最多 3 點，riskPoints 最多 3 點。",
    "請輸出完全符合下列格式的 JSON：",
    JSON.stringify({
      summary: "一句話摘要",
      bullishPoints: ["優點1", "優點2", "優點3"],
      riskPoints: ["風險1", "風險2"],
      actionNote: "觀察建議，不得直接叫使用者買進或賣出",
    }),
    "輸入資料：",
    JSON.stringify(input),
  ].join("\n");
}

function getGeminiText(json: any) {
  const parts = json?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) return "";

  return parts
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
}

function stripJsonFence(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function normalizeAnalysis(value: any): StockAiAnalysis {
  return {
    summary: sanitizeString(value?.summary),
    bullishPoints: sanitizeStringArray(value?.bullishPoints).slice(0, 3),
    riskPoints: sanitizeStringArray(value?.riskPoints).slice(0, 3),
    actionNote: sanitizeString(value?.actionNote),
  };
}

function parseAnalysis(rawText: string) {
  const text = stripJsonFence(rawText);

  if (!text) {
    throw new Error("Gemini returned empty text");
  }

  let parsed: any;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned invalid JSON");
  }

  const analysis = normalizeAnalysis(parsed);

  if (!analysis.summary || !analysis.actionNote) {
    throw new Error("Gemini JSON missing required fields");
  }

  return analysis;
}

async function callGemini(input: StockAnalysisInput) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const endpoint = `${GEMINI_API_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: buildPrompt(input) }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    }),
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    console.warn("Gemini API request failed", response.status);
    throw new Error(`Gemini API request failed with HTTP ${response.status}`);
  }

  const rawText = getGeminiText(json);

  return {
    rawText,
    analysis: parseAnalysis(rawText),
  };
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
      return jsonResponse(
        {
          success: false,
          functionVersion: "analyze-stock-ai-v1",
          message: "Unauthorized",
        },
        401,
      );
    }

    if (req.method !== "POST") {
      return jsonResponse(
        {
          success: false,
          functionVersion: "analyze-stock-ai-v1",
          message: "Method not allowed",
        },
        405,
      );
    }

    const payload = await req.json().catch(() => null);

    if (!payload || typeof payload !== "object") {
      return jsonResponse(
        {
          success: false,
          functionVersion: "analyze-stock-ai-v1",
          message: "Invalid JSON body",
        },
        400,
      );
    }

    const input = sanitizeInput(payload);
    validateInput(input);

    const { analysis, rawText } = await callGemini(input);

    return jsonResponse({
      success: true,
      functionVersion: "analyze-stock-ai-v1",
      input,
      analysis,
      rawText,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const safeMessage = message.includes("GEMINI_API_KEY")
      ? "AI analysis is not configured"
      : message.startsWith("Gemini")
        ? "AI analysis request failed"
        : message;

    return jsonResponse({
      success: false,
      functionVersion: "analyze-stock-ai-v1",
      message: safeMessage,
    });
  }
});
