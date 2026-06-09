-- supabase/migrations/20260609000013_notify_push_privilege_redemption.sql
-- Mirror of notify_push_redemption (20260514000010) for privilege_redemptions.
-- Fires 4 events: privilege_redemption_requested / _approved / _denied /
-- _fulfilled. Goes through public.send_push, which enqueues into push_outbox
-- and only delivers to parents whose push_prefs allow the event type.
-- Errors are swallowed so a push failure never aborts the redemption write.

create or replace function public.notify_push_privilege_redemption() returns trigger
  language plpgsql security definer as $$
declare event_kind text;
begin
  if TG_OP = 'INSERT' and NEW.status = 'pending' then
    event_kind := 'privilege_redemption_requested';
  elsif TG_OP = 'UPDATE' and NEW.status = 'approved'  and OLD.status <> 'approved' then
    event_kind := 'privilege_redemption_approved';
  elsif TG_OP = 'UPDATE' and NEW.status = 'denied'    and OLD.status <> 'denied' then
    event_kind := 'privilege_redemption_denied';
  elsif TG_OP = 'UPDATE' and NEW.status = 'fulfilled' and OLD.status <> 'fulfilled' then
    event_kind := 'privilege_redemption_fulfilled';
  else
    return NEW;
  end if;

  begin
    perform public.send_push(
      NEW.family_id,
      event_kind,
      jsonb_build_object(
        'redemption_id',  NEW.id,
        'privilege_id',   NEW.privilege_id,
        'kid_profile_id', NEW.kid_profile_id
      )
    );
  exception when others then
    raise warning 'notify_push_privilege_redemption: send_push failed: %', sqlerrm;
  end;
  return NEW;
end;
$$;

create trigger privilege_redemptions_push_trigger_insert
  after insert on public.privilege_redemptions
  for each row execute function public.notify_push_privilege_redemption();

create trigger privilege_redemptions_push_trigger_update
  after update on public.privilege_redemptions
  for each row execute function public.notify_push_privilege_redemption();
