-- M7 follow-up: rewrite the three push trigger functions to read URL +
-- service-role key from private.app_config instead of app.settings.* GUC.
--
-- The body / event-kind logic is unchanged from M5/M6 — only the two
-- `current_setting(...)` calls inside each `perform net.http_post(...)`
-- block are replaced with subqueries against private.app_config.

create or replace function public.notify_push_chore() returns trigger
  language plpgsql security definer
  set search_path = public, private
as $$
declare event_kind text;
begin
  if OLD.status = 'pending' and NEW.status = 'submitted' then
    event_kind := 'chore_submitted';
  elsif NEW.status = 'approved' and OLD.status <> 'approved' then
    event_kind := 'chore_approved';
  elsif NEW.status = 'rejected' and OLD.status <> 'rejected' then
    event_kind := 'chore_rejected';
  else
    return NEW;
  end if;

  begin
    perform net.http_post(
      url := (select value from private.app_config where key = 'functions_base_url') || '/send_push',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select value from private.app_config where key = 'service_role_key'),
        'Content-Type',  'application/json'
      ),
      body := jsonb_build_object(
        'event', event_kind,
        'family_id', NEW.family_id,
        'instance_id', NEW.id,
        'kid_profile_id', NEW.completed_by
      )
    );
  exception when others then
    null; -- silently swallow errors when private.app_config is unseeded
  end;
  return NEW;
end;
$$;

create or replace function public.notify_push_redemption() returns trigger
  language plpgsql security definer
  set search_path = public, private
as $$
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

  begin
    perform net.http_post(
      url := (select value from private.app_config where key = 'functions_base_url') || '/send_push',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select value from private.app_config where key = 'service_role_key'),
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
    null;
  end;
  return NEW;
end;
$$;

create or replace function public.notify_push_achievement() returns trigger
  language plpgsql security definer
  set search_path = public, private
as $$
begin
  begin
    perform net.http_post(
      url := (select value from private.app_config where key = 'functions_base_url') || '/send_push',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select value from private.app_config where key = 'service_role_key'),
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
    null;
  end;
  return NEW;
end;
$$;
