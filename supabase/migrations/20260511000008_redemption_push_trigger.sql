create or replace function public.notify_push_redemption() returns trigger
  language plpgsql security definer as $$
declare event_kind text;
begin
  if TG_OP = 'INSERT' and NEW.status = 'pending' then
    event_kind := 'redemption_requested';
  elsif TG_OP = 'UPDATE' and NEW.status = 'approved' and OLD.status <> 'approved' then
    event_kind := 'redemption_approved';
  elsif TG_OP = 'UPDATE' and NEW.status = 'denied' and OLD.status <> 'denied' then
    event_kind := 'redemption_denied';
  elsif TG_OP = 'UPDATE' and NEW.status = 'fulfilled' and OLD.status <> 'fulfilled' then
    event_kind := 'redemption_fulfilled';
  else
    return NEW;
  end if;

  -- Best-effort push (same exception-wrapping pattern as notify_push_chore):
  -- pg_net errors on null URL when app.settings.functions_base_url is unset.
  begin
    perform net.http_post(
      url := current_setting('app.settings.functions_base_url', true) || '/send_push',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
        'Content-Type',  'application/json'
      ),
      body := jsonb_build_object(
        'event', event_kind,
        'family_id', NEW.family_id,
        'redemption_id', NEW.id,
        'reward_id', NEW.reward_id,
        'kid_profile_id', NEW.kid_profile_id
      )
    );
  exception when others then
    null; -- silently swallow errors when functions_base_url is unset
  end;
  return NEW;
end;
$$;

create trigger redemptions_push_trigger_insert
  after insert on public.redemptions
  for each row execute function notify_push_redemption();

create trigger redemptions_push_trigger_update
  after update on public.redemptions
  for each row execute function notify_push_redemption();
