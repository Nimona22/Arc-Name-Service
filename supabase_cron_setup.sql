-- =============================================================================
-- ANS Blockchain Event Watcher: Supabase Vault + pg_cron + pg_net Setup
-- =============================================================================
-- Architecture:
--   1. Secret Storage: Vault (`vault.create_secret` / `vault.decrypted_secrets`)
--      Stores the watcher secret securely encrypted at rest.
--   2. HTTP Invocation: `pg_net` (`net.http_post`)
--      Fires asynchronous HTTP POST to the Supabase Edge Function without blocking.
--   3. Scheduling: `pg_cron` (`cron.schedule`)
--      Executes periodic polling at a conservative interval (every 2 minutes).
--      No secrets appear in `cron.job` text or SQL logs.
--   4. Cost: $0/month (Supabase Free Plan)
--      Every 2 minutes = 21,600 invocations/month (~4.3% of 500,000 free quota).
--
-- Security Guarantees:
--   - No secrets in Git, frontend code, cron schedule text, or public policies.
--   - `trigger_ans_event_watcher` is marked SECURITY DEFINER with search_path set.
--   - Access to `trigger_ans_event_watcher` is REVOKED from public, anon, and authenticated.
--   - Edge Function validates `x-watcher-secret` server-side before processing.
--   - Database writes use the Edge Function's server-side SUPABASE_SERVICE_ROLE_KEY.
--
-- Instructions:
--   1. Generate a strong random secret (e.g., using `openssl rand -hex 32`).
--   2. Set the secret in Supabase Edge Function secrets:
--      supabase secrets set WATCHER_SECRET="your_secret_here"
--   3. Set the SAME secret in Vault using Step 1 below (replace the placeholder).
--   4. Run this entire script in Supabase Studio > SQL Editor.
-- =============================================================================

-- ============================================================================
-- STEP 1: Store or Update the Watcher Secret in Supabase Vault (Idempotent)
-- ============================================================================
-- Replace 'REPLACE_WITH_YOUR_RANDOM_WATCHER_SECRET' with your generated secret.
-- NOTE: Never commit production secret values to version control.
DO $$
DECLARE
  v_secret_name text := 'ans_watcher_secret';
  v_secret_desc text := 'Dedicated secret for ANS Event Watcher cron authorization';
  -- Put your generated secret value between the single quotes:
  v_secret_val  text := 'REPLACE_WITH_YOUR_RANDOM_WATCHER_SECRET';
  v_existing_id uuid;
BEGIN
  -- Only update if user replaced the placeholder
  IF v_secret_val <> 'REPLACE_WITH_YOUR_RANDOM_WATCHER_SECRET' THEN
    SELECT id INTO v_existing_id
    FROM vault.decrypted_secrets
    WHERE name = v_secret_name
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      PERFORM vault.update_secret(
        v_existing_id,
        v_secret_val,
        v_secret_name,
        v_secret_desc
      );
      RAISE NOTICE 'Updated existing Vault secret: %', v_secret_name;
    ELSE
      PERFORM vault.create_secret(
        v_secret_val,
        v_secret_name,
        v_secret_desc
      );
      RAISE NOTICE 'Created new Vault secret: %', v_secret_name;
    END IF;
  ELSE
    RAISE NOTICE 'Step 1 skipped: replace placeholder with your real secret to store in Vault.';
  END IF;
END $$;

-- Optional: Store custom watcher endpoint in Vault if different from default.
-- Default is automatically resolved to https://zytmsjuprufxfgvpxfyt.supabase.co/functions/v1/ans-event-watcher
DO $$
DECLARE
  v_endpoint_name text := 'ans_watcher_endpoint';
  v_endpoint_val  text := 'https://zytmsjuprufxfgvpxfyt.supabase.co/functions/v1/ans-event-watcher';
  v_existing_id   uuid;
BEGIN
  SELECT id INTO v_existing_id
  FROM vault.decrypted_secrets
  WHERE name = v_endpoint_name
  LIMIT 1;

  IF v_existing_id IS NULL THEN
    PERFORM vault.create_secret(
      v_endpoint_val,
      v_endpoint_name,
      'Endpoint URL for ANS Event Watcher Supabase Edge Function'
    );
    RAISE NOTICE 'Created Vault secret: %', v_endpoint_name;
  END IF;
END $$;

-- ============================================================================
-- STEP 2: Create the Invocation Trigger Function (SECURITY DEFINER)
-- ============================================================================
-- Reads the secret from Vault and triggers an asynchronous POST via pg_net.
-- No secret is exposed in the caller SQL or cron logs.
CREATE OR REPLACE FUNCTION trigger_ans_event_watcher()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_secret text;
  v_url    text;
BEGIN
  -- 1. Read secret from Vault
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'ans_watcher_secret'
  LIMIT 1;

  -- 2. Read endpoint from Vault (fallback to project default)
  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets
  WHERE name = 'ans_watcher_endpoint'
  LIMIT 1;

  IF v_url IS NULL OR v_url = '' THEN
    v_url := 'https://zytmsjuprufxfgvpxfyt.supabase.co/functions/v1/ans-event-watcher';
  END IF;

  IF v_secret IS NULL OR v_secret = '' OR v_secret = 'REPLACE_WITH_YOUR_RANDOM_WATCHER_SECRET' THEN
    RAISE WARNING 'ANS Event Watcher: secret "ans_watcher_secret" not configured in Vault. Invocation skipped.';
    RETURN;
  END IF;

  -- 3. Trigger asynchronous HTTP POST via pg_net
  -- Timeout set to 10 seconds. Response is collected asynchronously by pg_net.
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-watcher-secret', v_secret
    ),
    body := jsonb_build_object(
      'source', 'pg_cron',
      'maxBlocks', 200,
      'triggered_at', now()
    ),
    timeout_milliseconds := 10000
  );
END;
$$;

-- Revoke all execution rights from public/anon/authenticated roles
REVOKE ALL ON FUNCTION trigger_ans_event_watcher() FROM public, anon, authenticated;

-- Allow only database owner / service execution
GRANT EXECUTE ON FUNCTION trigger_ans_event_watcher() TO postgres, service_role;

-- ============================================================================
-- STEP 3: Schedule Idempotent pg_cron Job (Conservative 2-minute interval)
-- ============================================================================
-- Checks if job exists first to avoid duplicate schedules.
-- Unschedule if already present, then schedule clean job.
DO $$
DECLARE
  v_job_name text := 'ans_event_watcher_cron';
  v_job_id   bigint;
BEGIN
  -- Unschedule existing job if it already exists
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = v_job_name;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_name);
    RAISE NOTICE 'Unscheduled existing pg_cron job: % (jobid %)', v_job_name, v_job_id;
  END IF;

  -- Schedule job: runs every 2 minutes
  -- Cron expression: '*/2 * * * *'
  -- Budget: 30 runs/hour * 24 hours * 30 days = 21,600 invocations/month
  -- (~4.3% of 500,000 monthly Free Plan quota = strictly $0/month)
  PERFORM cron.schedule(
    v_job_name,
    '*/2 * * * *',
    'SELECT trigger_ans_event_watcher();'
  );

  RAISE NOTICE 'Successfully scheduled pg_cron job "%" on "*/2 * * * *" schedule.', v_job_name;
END $$;

-- ============================================================================
-- STEP 4: Verification Queries (Run manually in SQL Editor to inspect status)
-- ============================================================================
-- Check active cron job:
--   SELECT jobid, schedule, command, active, username
--   FROM cron.job
--   WHERE jobname = 'ans_event_watcher_cron';
--
-- Check recent cron executions:
--   SELECT jobid, runid, job_pid, status, return_message, start_time, end_time
--   FROM cron.job_run_details
--   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'ans_event_watcher_cron')
--   ORDER BY start_time DESC
--   LIMIT 10;
--
-- Check pg_net HTTP responses:
--   SELECT id, status_code, content, error_msg, created
--   FROM net._http_response
--   ORDER BY created DESC
--   LIMIT 10;
--
-- Check watcher cursor progression:
--   SELECT id, last_block, updated_at
--   FROM watcher_cursors;
--
-- ============================================================================
-- END OF supabase_cron_setup.sql
-- ============================================================================
