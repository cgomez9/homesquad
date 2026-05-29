-- supabase/migrations/20260528000002_pairing_redeem_attempts.sql
-- Rate-limit attempt log for redeem_device_pairing. Read inside the RPC,
-- pruned hourly via pg_cron. Never queried from client code.

create table public.pairing_redeem_attempts (
  ip            inet        not null,
  attempted_at  timestamptz not null default now()
);

create index pairing_redeem_attempts_ip_time_idx
  on public.pairing_redeem_attempts (ip, attempted_at desc);

alter table public.pairing_redeem_attempts enable row level security;
-- No policies = no client access. RPC runs as security definer.

create or replace function public.cleanup_pairing_redeem_attempts()
returns void language sql security definer set search_path = public as $$
  delete from public.pairing_redeem_attempts
   where attempted_at < now() - interval '1 day'
$$;

revoke all on function public.cleanup_pairing_redeem_attempts() from public;
grant execute on function public.cleanup_pairing_redeem_attempts() to service_role;

select cron.schedule(
  'cleanup_pairing_redeem_attempts',
  '0 * * * *',  -- hourly on the hour
  $$ select public.cleanup_pairing_redeem_attempts() $$
);
