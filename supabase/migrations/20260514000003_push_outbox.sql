-- supabase/migrations/20260514000003_push_outbox.sql
-- The push delivery queue. send_push() enqueues rows; drain_push_outbox()
-- (pg_cron, every minute) marks pending rows 'sending', dispatches them to
-- the send_push_drain Edge Function, and apply_drain_result() flips them to
-- 'sent' or 'failed' (with backoff for transient errors).
--
-- 'sending' is an in-flight marker: it prevents the next cron tick from
-- re-dispatching rows whose Edge Function callback hasn't completed yet. A
-- recovery branch in drain_push_outbox() resets stale 'sending' rows (>5min)
-- back to 'pending' on the next pass.

create table public.push_outbox (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  event_type    text not null,
  payload       jsonb not null,
  enqueued_at   timestamptz not null default now(),
  scheduled_for timestamptz not null,
  attempts      int  not null default 0,
  max_attempts  int  not null default 3,
  status        text not null default 'pending'
                check (status in ('pending','sending','sent','failed','canceled')),
  last_error    text,
  sent_at       timestamptz,
  sending_since timestamptz
);

create index push_outbox_pending_idx
  on public.push_outbox (scheduled_for)
  where status = 'pending';

create index push_outbox_sending_idx
  on public.push_outbox (sending_since)
  where status = 'sending';

create index push_outbox_recipient_pending_idx
  on public.push_outbox (recipient_id, scheduled_for)
  where status = 'pending';

alter table public.push_outbox enable row level security;

-- Service role bypasses RLS for all writes (drain worker + send_push function
-- run as service_role via the cron job and Edge Function). Parents can read
-- their family's rows (future debug screen). No client writes.
create policy push_outbox_read_own_family
  on public.push_outbox
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.family_id = push_outbox.family_id
        and p.type = 'parent'
    )
  );
