-- StockDash Supabase Cron auto-scan example
--
-- 用途：設定 Supabase Cron Jobs，於週一到週五定時呼叫 run-auto-scan Edge Function。
-- 請先將下列佔位符替換成自己的值，且不要把真實 secret commit 到 Git：
--   <PROJECT_REF>
--   <AUTO_SCAN_SECRET>
--   <SUPABASE_ANON_KEY>
--
-- 時區說明：Supabase Cron 使用 UTC。
-- 台灣時間 UTC+8：20:30～21:15 對應 UTC 12:30～13:15。
--
-- ⚠️ 重要提醒：若只是要建立排程，只需要執行下方的：
--   1. create extension
--   2. batch=0 到 batch=9 的 cron.schedule(...) 區塊
-- 不要把整份檔案一次貼到 Supabase SQL Editor 執行，避免誤執行後方查詢、暫停或刪除範例。

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- 台灣時間 20:30，UTC 12:30，batch=0，掃描第 1～10 支
select cron.schedule(
  'stockdash-auto-scan-batch-0-tw-2030',
  '30 12 * * 1-5',
  $$
  select net.http_get(
    url := 'https://psoljdyspeupakhbhcsf.supabase.co/functions/v1/run-auto-scan?secret=stockdash_auto_scan_2026_rimuru2020998001&batch=0',
    headers := jsonb_build_object(
      'Authorization', 'Bearer sb_publishable_-t5jECTRA9BpwvqRHoUUOA_uEYF4b5B',
      'apikey', 'sb_publishable_-t5jECTRA9BpwvqRHoUUOA_uEYF4b5B'
    ),
    timeout_milliseconds := 30000
  );
  $$
);

-- 台灣時間 20:35，UTC 12:35，batch=1，掃描第 11～20 支
select cron.schedule(
  'stockdash-auto-scan-batch-1-tw-2035',
  '35 12 * * 1-5',
  $$
  select net.http_get(
    url := 'https://psoljdyspeupakhbhcsf.supabase.co/functions/v1/run-auto-scan?secret=stockdash_auto_scan_2026_rimuru2020998001&batch=1',
    headers := jsonb_build_object(
      'Authorization', 'Bearer sb_publishable_-t5jECTRA9BpwvqRHoUUOA_uEYF4b5B',
      'apikey', 'sb_publishable_-t5jECTRA9BpwvqRHoUUOA_uEYF4b5B'
    ),
    timeout_milliseconds := 30000
  );
  $$
);

-- 台灣時間 20:40，UTC 12:40，batch=2，掃描第 21～30 支
select cron.schedule(
  'stockdash-auto-scan-batch-2-tw-2040',
  '40 12 * * 1-5',
  $$
  select net.http_get(
    url := 'https://psoljdyspeupakhbhcsf.supabase.co/functions/v1/run-auto-scan?secret=stockdash_auto_scan_2026_rimuru2020998001&batch=2',
    headers := jsonb_build_object(
      'Authorization', 'Bearer sb_publishable_-t5jECTRA9BpwvqRHoUUOA_uEYF4b5B',
      'apikey', 'sb_publishable_-t5jECTRA9BpwvqRHoUUOA_uEYF4b5B'
    ),
    timeout_milliseconds := 30000
  );
  $$
);

-- 台灣時間 20:45，UTC 12:45，batch=3，掃描第 31～40 支
select cron.schedule(
  'stockdash-auto-scan-batch-3-tw-2045',
  '45 12 * * 1-5',
  $$
  select net.http_get(
    url := 'https://psoljdyspeupakhbhcsf.supabase.co/functions/v1/run-auto-scan?secret=stockdash_auto_scan_2026_rimuru2020998001&batch=3',
    headers := jsonb_build_object(
      'Authorization', 'Bearer sb_publishable_-t5jECTRA9BpwvqRHoUUOA_uEYF4b5B',
      'apikey', 'sb_publishable_-t5jECTRA9BpwvqRHoUUOA_uEYF4b5B'
    ),
    timeout_milliseconds := 30000
  );
  $$
);

-- 台灣時間 20:50，UTC 12:50，batch=4，掃描第 41～50 支
select cron.schedule(
  'stockdash-auto-scan-batch-4-tw-2050',
  '50 12 * * 1-5',
  $$
  select net.http_get(
    url := 'https://psoljdyspeupakhbhcsf.supabase.co/functions/v1/run-auto-scan?secret=stockdash_auto_scan_2026_rimuru2020998001&batch=4',
    headers := jsonb_build_object(
      'Authorization', 'Bearer sb_publishable_-t5jECTRA9BpwvqRHoUUOA_uEYF4b5B',
      'apikey', 'sb_publishable_-t5jECTRA9BpwvqRHoUUOA_uEYF4b5B'
    ),
    timeout_milliseconds := 30000
  );
  $$
);

-- 台灣時間 20:55，UTC 12:55，batch=5，掃描第 51～60 支
select cron.schedule(
  'stockdash-auto-scan-batch-5-tw-2055',
  '55 12 * * 1-5',
  $$
  select net.http_get(
    url := 'https://psoljdyspeupakhbhcsf.supabase.co/functions/v1/run-auto-scan?secret=stockdash_auto_scan_2026_rimuru2020998001&batch=5',
    headers := jsonb_build_object(
      'Authorization', 'Bearer sb_publishable_-t5jECTRA9BpwvqRHoUUOA_uEYF4b5B',
      'apikey', 'sb_publishable_-t5jECTRA9BpwvqRHoUUOA_uEYF4b5B'
    ),
    timeout_milliseconds := 30000
  );
  $$
);

-- 台灣時間 21:00，UTC 13:00，batch=6，掃描第 61～70 支
select cron.schedule(
  'stockdash-auto-scan-batch-6-tw-2100',
  '0 13 * * 1-5',
  $$
  select net.http_get(
    url := 'hhttps://psoljdyspeupakhbhcsf.supabase.co/functions/v1/run-auto-scan?secret=stockdash_auto_scan_2026_rimuru2020998001&batch=6',
    headers := jsonb_build_object(
      'Authorization', 'Bearer sb_publishable_-t5jECTRA9BpwvqRHoUUOA_uEYF4b5B',
      'apikey', 'sb_publishable_-t5jECTRA9BpwvqRHoUUOA_uEYF4b5B'
    ),
    timeout_milliseconds := 30000
  );
  $$
);

-- 台灣時間 21:05，UTC 13:05，batch=7，掃描第 71～80 支
select cron.schedule(
  'stockdash-auto-scan-batch-7-tw-2105',
  '5 13 * * 1-5',
  $$
  select net.http_get(
    url := 'https://psoljdyspeupakhbhcsf.supabase.co/functions/v1/run-auto-scan?secret=stockdash_auto_scan_2026_rimuru2020998001&batch=7',
    headers := jsonb_build_object(
      'Authorization', 'Bearer sb_publishable_-t5jECTRA9BpwvqRHoUUOA_uEYF4b5B',
      'apikey', 'sb_publishable_-t5jECTRA9BpwvqRHoUUOA_uEYF4b5B'
    ),
    timeout_milliseconds := 30000
  );
  $$
);

-- 台灣時間 21:10，UTC 13:10，batch=8，掃描第 81～90 支
select cron.schedule(
  'stockdash-auto-scan-batch-8-tw-2110',
  '10 13 * * 1-5',
  $$
  select net.http_get(
    url := 'https://psoljdyspeupakhbhcsf.supabase.co/functions/v1/run-auto-scan?secret=stockdash_auto_scan_2026_rimuru2020998001&batch=8',
    headers := jsonb_build_object(
      'Authorization', 'Bearer sb_publishable_-t5jECTRA9BpwvqRHoUUOA_uEYF4b5B',
      'apikey', 'sb_publishable_-t5jECTRA9BpwvqRHoUUOA_uEYF4b5B'
    ),
    timeout_milliseconds := 30000
  );
  $$
);

-- 台灣時間 21:15，UTC 13:15，batch=9，掃描第 91～100 支
select cron.schedule(
  'stockdash-auto-scan-batch-9-tw-2115',
  '15 13 * * 1-5',
  $$
  select net.http_get(
    url := 'https://psoljdyspeupakhbhcsf.supabase.co/functions/v1/run-auto-scan?secret=stockdash_auto_scan_2026_rimuru2020998001&batch=9',
    headers := jsonb_build_object(
      'Authorization', 'Bearer sb_publishable_-t5jECTRA9BpwvqRHoUUOA_uEYF4b5B',
      'apikey', 'sb_publishable_-t5jECTRA9BpwvqRHoUUOA_uEYF4b5B'
    ),
    timeout_milliseconds := 30000
  );
  $$
);

-- ============================================================
-- 以下為查詢 / 管理 / 刪除範例
-- 請不要和上方建立排程 SQL 一起整份執行
-- ============================================================

-- 查詢 cron job 狀態
select
  jobid,
  jobname,
  schedule,
  command,
  active
from cron.job
where jobname like 'stockdash-auto-scan-batch-%'
order by jobname;

-- 查詢 cron job 執行紀錄
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
limit 100;

-- ⚠️ 選用管理操作：以下 SQL 會暫停所有 StockDash auto-scan jobs。
-- 確認要暫停排程時才執行。
-- 暫停所有 StockDash auto-scan jobs
update cron.job
set active = false
where jobname like 'stockdash-auto-scan-batch-%';

-- ⚠️ 選用管理操作：以下 SQL 會重新啟用所有 StockDash auto-scan jobs。
-- 確認要恢復排程時才執行。
-- 重新啟用所有 StockDash auto-scan jobs
update cron.job
set active = true
where jobname like 'stockdash-auto-scan-batch-%';

-- ⚠️ 危險操作：以下 SQL 會刪除所有 StockDash auto-scan jobs。
-- 請勿誤執行；只有在確定要移除排程時才執行。
-- 刪除所有 StockDash auto-scan jobs
select cron.unschedule(jobname)
from cron.job
where jobname like 'stockdash-auto-scan-batch-%';
