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

type AlertPayload = {
  symbol?: string;
  name?: string;
  finalCategory?: string;
  finalScore?: number;
  technicalScore?: number;
  revenueScore?: number;
  holderScore?: number;
  revenueYoY?: number;
  cumulativeRevenueYoY?: number;
  largeHolderRatio?: number;
  whaleHolderRatio?: number;
  retailHolderRatio?: number;
  reasons?: string[];
};

function formatPercent(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  return `${value.toFixed(1)}%`;
}

function formatScore(value?: number | null, suffix = "") {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  return `${value}${suffix}`;
}

function buildMessage(payload: AlertPayload) {
  const symbol = payload.symbol || "-";
  const name = payload.name || "";
  const titleName = name ? `${symbol} ${name}` : symbol;

  const reasons = Array.isArray(payload.reasons)
    ? payload.reasons.slice(0, 6)
    : [];

  const reasonText =
    reasons.length > 0
      ? reasons.map((reason) => `• ${reason}`).join("\n")
      : "• 無詳細原因";

  return [
    `🚨 StockDash 黑馬雷達`,
    ``,
    `標的：${titleName}`,
    `類型：${payload.finalCategory || "-"}`,
    `總分：${formatScore(payload.finalScore)}`,
    ``,
    `技術分：${formatScore(payload.technicalScore)}`,
    `營收分：${formatScore(payload.revenueScore, "/30")}`,
    `籌碼分：${formatScore(payload.holderScore, "/30")}`,
    ``,
    `單月 YoY：${formatPercent(payload.revenueYoY)}`,
    `累計 YoY：${formatPercent(payload.cumulativeRevenueYoY)}`,
    `大戶比例：${formatPercent(payload.largeHolderRatio)}`,
    `千張比例：${formatPercent(payload.whaleHolderRatio)}`,
    `散戶比例：${formatPercent(payload.retailHolderRatio)}`,
    ``,
    `原因：`,
    reasonText,
  ].join("\n");
}

async function sendTelegramMessage(text: string) {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");

  if (!botToken) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN");
  }

  if (!chatId) {
    throw new Error("Missing TELEGRAM_CHAT_ID");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    },
  );

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `Telegram API error HTTP ${response.status}: ${JSON.stringify(json)}`,
    );
  }

  return json;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let payload: AlertPayload = {};

    if (req.method === "POST") {
      payload = await req.json();
    } else {
      const url = new URL(req.url);

      payload = {
        symbol: url.searchParams.get("symbol") || "3017",
        name: url.searchParams.get("name") || "奇鋐",
        finalCategory: url.searchParams.get("category") || "真黑馬候選",
        finalScore: Number(url.searchParams.get("score") || 88),
        technicalScore: Number(url.searchParams.get("technicalScore") || 82),
        revenueScore: Number(url.searchParams.get("revenueScore") || 24),
        holderScore: Number(url.searchParams.get("holderScore") || 28),
        revenueYoY: Number(url.searchParams.get("revenueYoY") || 58.2),
        cumulativeRevenueYoY: Number(
          url.searchParams.get("cumulativeRevenueYoY") || 66.6,
        ),
        largeHolderRatio: Number(url.searchParams.get("largeHolderRatio") || 67.7),
        whaleHolderRatio: Number(url.searchParams.get("whaleHolderRatio") || 54.2),
        retailHolderRatio: Number(url.searchParams.get("retailHolderRatio") || 13.9),
        reasons: [
          "量價轉強",
          "營收維持成長",
          "集保籌碼高度集中",
        ],
      };
    }

    const message = buildMessage(payload);
    const telegramResult = await sendTelegramMessage(message);

    return new Response(
      JSON.stringify({
        success: true,
        functionVersion: "send-stock-alert-v1",
        message: "Telegram alert sent",
        payload,
        telegramResult,
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
        functionVersion: "send-stock-alert-v1",
        message: "send-stock-alert Edge Function error",
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 200,
        headers: jsonHeaders,
      },
    );
  }
});