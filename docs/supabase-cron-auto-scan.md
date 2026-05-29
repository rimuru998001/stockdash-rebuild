# Supabase Cron 定時執行 `run-auto-scan`

本文說明如何在 Supabase 使用 **Cron Jobs** 定時呼叫 `run-auto-scan` Edge Function，讓 StockDash 自動分批掃描熱門股票池並送出 Telegram 報告。

## 前置條件

1. `run-auto-scan` Edge Function 已部署到 Supabase。
2. Edge Function 環境變數已設定完成，例如：
   - `AUTO_SCAN_SECRET`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. Supabase Database 已啟用 `pg_cron` 與 `pg_net` extension。
4. 你知道自己的 Supabase 專案 ref，可組成 Edge Function URL：

   ```text
   https://<PROJECT_REF>.supabase.co/functions/v1/run-auto-scan
   ```

> 注意：SQL 範例使用 `<AUTO_SCAN_SECRET>`、`<PROJECT_REF>`、`<SUPABASE_ANON_KEY>` 作為佔位符，請在實際設定時替換成你自己的值；不要把真實 secret、Telegram token 或其他敏感資訊提交到 Git。

## Batch 參數規則

`run-auto-scan` 目前使用 `batch` query parameter 控制本次要掃描哪一批股票，每批 10 支：

| 參數 | 掃描範圍 |
| --- | --- |
| `batch=0` | 第 1～10 支 |
| `batch=1` | 第 11～20 支 |
| `batch=2` | 第 21～30 支 |
| `batch=3` | 第 31～40 支 |
| `batch=4` | 第 41～50 支 |
| `batch=5` | 第 51～60 支 |

依此類推：`batch=N` 會掃描第 `N * 10 + 1` 到第 `(N + 1) * 10` 支。

## 時區說明：Supabase Cron 使用 UTC

Supabase Cron 的排程時間使用 **UTC**，不是台灣時間。

台灣時間是 UTC+8，因此：

| 台灣時間 | UTC 時間 | 用途 |
| --- | --- | --- |
| 20:30 | 12:30 | `batch=0` |
| 20:35 | 12:35 | `batch=1` |
| 20:40 | 12:40 | `batch=2` |
| 20:45 | 12:45 | `batch=3` |
| 20:50 | 12:50 | `batch=4` |
| 20:55 | 12:55 | `batch=5` |

因此，如果你希望週一到週五台灣時間晚上 20:30 開始分批掃描，在 `cron.schedule` 裡要填 UTC 的 `12:30`、`12:35`、`12:40` 等時間，並使用 `1-5` 指定週一到週五。

## 啟用 `pg_cron` 與 `pg_net`

可在 Supabase SQL Editor 執行：

```sql
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
```

如果你的專案已經啟用過，重複執行也不會重新建立。

## 建立週一到週五分批掃描排程

以下範例會在週一到週五依「台灣時間」20:30～20:55，每 5 分鐘呼叫一次 `run-auto-scan`，分別掃描 `batch=0` 到 `batch=5`。

> 請將 `<PROJECT_REF>`、`<AUTO_SCAN_SECRET>`、`<SUPABASE_ANON_KEY>` 換成你的實際設定。SQL 範例沒有也不應包含真實 Telegram token。

> 若 batch 掃描時間較長，可視情況提高 `timeout_milliseconds`，避免請求在 Edge Function 完成前逾時。

```sql
select cron.schedule(
  'stockdash-auto-scan-batch-0-tw-2030',
  '30 12 * * 1-5',
  $$
  select net.http_get(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/run-auto-scan?secret=<AUTO_SCAN_SECRET>&batch=0',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SUPABASE_ANON_KEY>',
      'apikey', '<SUPABASE_ANON_KEY>'
    ),
    timeout_milliseconds := 30000
  );
  $$
);

select cron.schedule(
  'stockdash-auto-scan-batch-1-tw-2035',
  '35 12 * * 1-5',
  $$
  select net.http_get(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/run-auto-scan?secret=<AUTO_SCAN_SECRET>&batch=1',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SUPABASE_ANON_KEY>',
      'apikey', '<SUPABASE_ANON_KEY>'
    ),
    timeout_milliseconds := 30000
  );
  $$
);

select cron.schedule(
  'stockdash-auto-scan-batch-2-tw-2040',
  '40 12 * * 1-5',
  $$
  select net.http_get(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/run-auto-scan?secret=<AUTO_SCAN_SECRET>&batch=2',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SUPABASE_ANON_KEY>',
      'apikey', '<SUPABASE_ANON_KEY>'
    ),
    timeout_milliseconds := 30000
  );
  $$
);

select cron.schedule(
  'stockdash-auto-scan-batch-3-tw-2045',
  '45 12 * * 1-5',
  $$
  select net.http_get(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/run-auto-scan?secret=<AUTO_SCAN_SECRET>&batch=3',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SUPABASE_ANON_KEY>',
      'apikey', '<SUPABASE_ANON_KEY>'
    ),
    timeout_milliseconds := 30000
  );
  $$
);

select cron.schedule(
  'stockdash-auto-scan-batch-4-tw-2050',
  '50 12 * * 1-5',
  $$
  select net.http_get(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/run-auto-scan?secret=<AUTO_SCAN_SECRET>&batch=4',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SUPABASE_ANON_KEY>',
      'apikey', '<SUPABASE_ANON_KEY>'
    ),
    timeout_milliseconds := 30000
  );
  $$
);

select cron.schedule(
  'stockdash-auto-scan-batch-5-tw-2055',
  '55 12 * * 1-5',
  $$
  select net.http_get(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/run-auto-scan?secret=<AUTO_SCAN_SECRET>&batch=5',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SUPABASE_ANON_KEY>',
      'apikey', '<SUPABASE_ANON_KEY>'
    ),
    timeout_milliseconds := 30000
  );
  $$
);
```

### 如果 Edge Function 關閉 JWT 驗證

若 `run-auto-scan` 已設定不需要 Supabase JWT 驗證，且只依靠 `AUTO_SCAN_SECRET` query parameter 保護，可以省略 `Authorization` 與 `apikey` headers：

```sql
select cron.schedule(
  'stockdash-auto-scan-batch-0-tw-2030',
  '30 12 * * 1-5',
  $$
  select net.http_get(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/run-auto-scan?secret=<AUTO_SCAN_SECRET>&batch=0',
    timeout_milliseconds := 30000
  );
  $$
);
```

## 檢查 Cron Jobs

建立後可查詢目前排程：

```sql
select
  jobid,
  jobname,
  schedule,
  command,
  active
from cron.job
where jobname like 'stockdash-auto-scan-batch-%'
order by jobname;
```

也可以查看最近執行紀錄：

```sql
select
  jobid,
  status,
  return_message,
  start_time,
  end_time
from cron.job_run_details
where jobid in (
  select jobid
  from cron.job
  where jobname like 'stockdash-auto-scan-batch-%'
)
order by start_time desc
limit 50;
```

## 停用 Cron Job

如果只想暫停某個 batch，不刪除排程，可將該 job 設為 inactive：

```sql
update cron.job
set active = false
where jobname = 'stockdash-auto-scan-batch-0-tw-2030';
```

若要重新啟用：

```sql
update cron.job
set active = true
where jobname = 'stockdash-auto-scan-batch-0-tw-2030';
```

也可以一次停用全部 StockDash auto-scan 排程：

```sql
update cron.job
set active = false
where jobname like 'stockdash-auto-scan-batch-%';
```

## 刪除 Cron Job

若要刪除單一排程：

```sql
select cron.unschedule('stockdash-auto-scan-batch-0-tw-2030');
```

若要刪除全部 StockDash auto-scan 排程：

```sql
select cron.unschedule(jobname)
from cron.job
where jobname like 'stockdash-auto-scan-batch-%';
```

## 手動測試呼叫

在建立排程前，可以先用瀏覽器、curl 或其他 HTTP 工具測試單一 batch 是否能正常觸發：

```bash
curl 'https://<PROJECT_REF>.supabase.co/functions/v1/run-auto-scan?secret=<AUTO_SCAN_SECRET>&batch=0' \
  -H 'Authorization: Bearer <SUPABASE_ANON_KEY>' \
  -H 'apikey: <SUPABASE_ANON_KEY>'
```

如果呼叫成功，應該會收到 JSON 回應，且 Telegram chat 會收到對應 batch 的掃描報告。
