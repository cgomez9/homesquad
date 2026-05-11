create or replace function public.notify_push_achievement() returns trigger
  language plpgsql security definer as $$
begin
  begin
    perform net.http_post(
      url := current_setting('app.settings.functions_base_url', true) || '/send_push',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
        'Content-Type',  'application/json'
      ),
      body := jsonb_build_object(
        'event', 'achievement_unlocked',
        'family_id', NEW.family_id,
        'profile_id', NEW.profile_id,
        'achievement_key', NEW.achievement_key
      )
    );
  exception when others then
    null; -- silently swallow errors when functions_base_url is unset
  end;
  return NEW;
end;
$$;

create trigger achievements_push_trigger
  after insert on public.achievements
  for each row execute function notify_push_achievement();
