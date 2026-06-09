-- supabase/migrations/20260609000014_skill_streak_milestone_trigger.sql
-- Per-skill-chore streak milestone push. Mirrors notify_streak_milestone
-- (20260514000011) but watches chores.current_skill_streak instead of
-- streaks.current_count, and targets the chore's assignee as the kid.
--
-- Milestones are 7/14/30 days (more modest than the star streak's 7/30/100
-- because a per-chore skill streak is harder to maintain — it's "did this
-- specific thing every day" rather than "did any chore every day").
--
-- Only fires when kind='skill' AND current_skill_streak just crossed the
-- threshold AND the chore has an assignee. Push failure is swallowed.

create or replace function public.notify_skill_streak_milestone() returns trigger
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_kid_name text;
begin
  if NEW.kind <> 'skill' then return NEW; end if;
  if NEW.assignee_profile_id is null then return NEW; end if;

  if NEW.current_skill_streak in (7, 14, 30)
     and NEW.current_skill_streak <> coalesce(OLD.current_skill_streak, 0)
  then
    select display_name into v_kid_name
      from public.profiles where id = NEW.assignee_profile_id;

    begin
      perform public.send_push(
        NEW.family_id,
        'skill_streak_milestone',
        jsonb_build_object(
          'chore_id',        NEW.id,
          'chore_title',     NEW.title,
          'kid_profile_id',  NEW.assignee_profile_id,
          'kid_name',        v_kid_name,
          'streak_days',     NEW.current_skill_streak
        )
      );
    exception when others then
      raise warning 'notify_skill_streak_milestone: send_push failed: %', sqlerrm;
    end;
  end if;

  return NEW;
end;
$$;

drop trigger if exists chores_skill_streak_milestone_push on public.chores;
create trigger chores_skill_streak_milestone_push
  after update of current_skill_streak on public.chores
  for each row execute function public.notify_skill_streak_milestone();
