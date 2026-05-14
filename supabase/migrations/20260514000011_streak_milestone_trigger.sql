-- supabase/migrations/20260514000011_streak_milestone_trigger.sql
-- Fires a streak_milestone push notification when a kid's current_count crosses
-- 7, 30, or 100. Push failure is swallowed so it never aborts the streak update.
create or replace function public.notify_streak_milestone() returns trigger
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_kid_name text;
begin
  if NEW.current_count in (7, 30, 100)
     and NEW.current_count <> coalesce(OLD.current_count, 0)
  then
    select display_name into v_kid_name
      from public.profiles where id = NEW.profile_id;

    begin
      perform public.send_push(
        NEW.family_id,
        'streak_milestone',
        jsonb_build_object(
          'kid_profile_id', NEW.profile_id,
          'kid_name',       v_kid_name,
          'streak_days',    NEW.current_count
        )
      );
    exception when others then
      raise warning 'notify_streak_milestone: send_push failed: %', sqlerrm;
    end;
  end if;

  return NEW;
end;
$$;

drop trigger if exists streaks_milestone_push on public.streaks;
create trigger streaks_milestone_push
  after update of current_count on public.streaks
  for each row execute function public.notify_streak_milestone();
