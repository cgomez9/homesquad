-- supabase/migrations/20260514000009_drain_push_outbox.sql
-- drain_push_outbox(): picks pending rows whose scheduled_for has arrived,
-- groups by recipient (collapse threshold = 2), marks them 'sending', and
-- fires the batch to the send_push_drain Edge Function via pg_net.
--
-- Also runs a recovery sweep: any row stuck in 'sending' for >5 minutes is
-- reset to 'pending' (Edge Function presumably died without calling
-- apply_drain_result back).
--
-- apply_drain_result(): callback invoked by the Edge Function per row.
-- Handles the state transitions for ok / transient / device_not_registered.

create or replace function public.apply_drain_result(
  p_row_id  uuid,
  p_outcome text,
  p_error   text default null
) returns void
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_row push_outbox;
begin
  select * into v_row from public.push_outbox where id = p_row_id;
  if v_row.id is null then
    return;
  end if;

  if p_outcome = 'ok' then
    update public.push_outbox
       set status        = 'sent',
           sent_at       = now(),
           sending_since = null,
           last_error    = null
     where id = p_row_id;

  elsif p_outcome = 'device_not_registered' then
    update public.profiles set push_token = null
     where id = v_row.recipient_id;
    update public.push_outbox
       set status        = 'failed',
           sending_since = null,
           last_error    = coalesce(p_error, 'device_not_registered')
     where id = p_row_id;

  elsif p_outcome = 'transient' then
    if v_row.attempts + 1 >= v_row.max_attempts then
      update public.push_outbox
         set status        = 'failed',
             attempts      = v_row.attempts + 1,
             sending_since = null,
             last_error    = coalesce(p_error, 'transient (out of attempts)')
       where id = p_row_id;
    else
      update public.push_outbox
         set status        = 'pending',
             attempts      = v_row.attempts + 1,
             sending_since = null,
             scheduled_for = now() + (interval '30 seconds'
                                      * power(2, v_row.attempts + 1)::int),
             last_error    = p_error
       where id = p_row_id;
    end if;

  else
    update public.push_outbox
       set status        = 'failed',
           sending_since = null,
           last_error    = coalesce(p_error, 'unknown outcome: ' || p_outcome)
     where id = p_row_id;
  end if;
end;
$$;

revoke all on function public.apply_drain_result(uuid, text, text) from public;
grant execute on function public.apply_drain_result(uuid, text, text) to service_role;

-- drain_push_outbox: invoked by pg_cron.
create or replace function public.drain_push_outbox() returns void
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_base_url text;
  v_key      text;
  v_batch    jsonb;
  v_recovered int;
begin
  -- Recovery sweep: rows stuck in 'sending' for >5min go back to pending.
  update public.push_outbox
     set status='pending', sending_since=null
   where status='sending'
     and sending_since < now() - interval '5 minutes';
  get diagnostics v_recovered = row_count;
  if v_recovered > 0 then
    raise notice 'drain_push_outbox: recovered % stale sending rows', v_recovered;
  end if;

  -- Take a batch of pending rows, mark them sending.
  with claimed as (
    update public.push_outbox
       set status        = 'sending',
           sending_since = now()
     where id in (
       select id from public.push_outbox
        where status = 'pending' and scheduled_for <= now()
        order by scheduled_for
        limit 100
        for update skip locked
     )
    returning id, recipient_id, event_type, payload
  ),
  grouped as (
    select recipient_id,
           jsonb_agg(jsonb_build_object(
             'row_id',     id,
             'event_type', event_type,
             'payload',    payload
           ) order by id) as items
      from claimed
     group by recipient_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'recipient_id', recipient_id,
           'items',        items
         )), '[]'::jsonb)
    into v_batch
    from grouped;

  if v_batch = '[]'::jsonb then
    return;
  end if;

  v_base_url := current_setting('app.settings.functions_base_url', true);
  v_key      := current_setting('app.settings.service_role_key', true);

  if v_base_url is null or v_key is null then
    -- Local dev without config: do nothing. Rows will reset via stale sweep.
    raise notice 'drain_push_outbox: functions_base_url/service_role_key unset, skipping';
    return;
  end if;

  begin
    perform net.http_post(
      url     := v_base_url || '/send_push_drain',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_key,
        'Content-Type',  'application/json'
      ),
      body    := jsonb_build_object('batch', v_batch)
    );
  exception when others then
    raise warning 'drain_push_outbox: net.http_post failed: %', sqlerrm;
  end;
end;
$$;

revoke all on function public.drain_push_outbox() from public;
grant execute on function public.drain_push_outbox() to service_role;

-- Schedule: every minute.
select cron.schedule(
  'drain_push_outbox',
  '* * * * *',
  $$ select public.drain_push_outbox() $$
);
