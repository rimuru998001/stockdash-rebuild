# 股票技術分析儀表板 Rebuild

這是一個可取代 Manus 版本的 Vite + React + Supabase 專案，功能包含：

- 美股 / 台股搜尋與 K 線圖
- 台股 `.TW` → `.TWO` 自動 fallback（在 Supabase Edge Function 內處理）
- RSI、MA5、MA20、MA60、成交量顯示
- 動態黑馬掃描器
- 固定分類股票池
- 自訂股票池：localStorage + Supabase 雲端同步
- 熱門股池：Supabase Edge Function 取得 TWSE 公開資料，失敗時 fallback
- 掃描結果可加入自訂清單

## 1. 安裝與啟動

```bash
npm install
cp .env.example .env
npm run dev
```

`.env` 需要填入：

```env
VITE_SUPABASE_URL=https://你的-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=你的 publishable/anon key
```

## 2. Supabase SQL

到 Supabase SQL Editor 執行：

```sql
-- 內容在 supabase/migrations/001_user_stock_lists.sql
```

這會建立 `user_stock_lists`、RLS policy、updated_at trigger。

## 3. Edge Functions

需要部署兩個 function：

```bash
supabase functions deploy get-hot-stocks --no-verify-jwt
supabase functions deploy get-stock-data --no-verify-jwt
```

如果用 Dashboard Editor 手動建立，名稱要完全一致：

- `get-hot-stocks`
- `get-stock-data`

部署後測試：

```text
https://你的-project-ref.supabase.co/functions/v1/get-hot-stocks
https://你的-project-ref.supabase.co/functions/v1/get-stock-data?symbol=2330&range=6mo
```

若看到 JSON，即代表 function 正常。

## 4. Supabase Auth Redirect

到 Supabase：

Authentication → URL Configuration

設定：

```text
Site URL: 你的前端網站網址
Redirect URLs:
你的前端網站網址
你的前端網站網址/**
http://localhost:5173
http://localhost:5173/**
```

## 5. 部署到 Vercel

1. 將本專案推到 GitHub
2. Vercel Import Project
3. 設定 Environment Variables：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy
5. 回 Supabase Auth URL Configuration 加入 Vercel 網址

## 6. 注意

目前 `get-hot-stocks` 使用 TWSE `STOCK_DAY_ALL`，並依成交金額、成交量排序取前 100 支。這不是完整市場熱門榜，但已能形成可用的熱門股池。若之後要加入上櫃 TPEx 或更準確排行，可以擴充 Edge Function 的資料來源。
