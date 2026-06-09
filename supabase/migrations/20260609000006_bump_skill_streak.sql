-- supabase/migrations/20260609000006_bump_skill_streak.sql
-- Per-chore skill-streak update helper. Mirrors the logic that approve_chore
-- applies to the global streaks table, but the counters live on the chores
-- row itself (current_skill_streak / longest_skill_streak / last_skill_date).
--
-- Idempotent within a calendar day: a second skill-task completion on the
-- same day is a no-op for the streak counter.

create or replace function public.bump_skill_streak(p_chore_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.chores%rowtype;
begin
  select * into c from public.chores where id = p_chore_id for update;
  if c.id is null then return; end if;
  if c.kind <> 'skill' then return; end if;

  if c.last_skill_date = current_date then
    return;
  elsif c.last_skill_date = current_date - 1 then
    update public.chores
      set current_skill_streak = c.current_skill_streak + 1,
          longest_skill_streak = greatest(c.longest_skill_streak, c.current_skill_streak + 1),
          last_skill_date      = current_date
      where id = p_chore_id;
  else
    update public.chores
      set current_skill_streak = 1,
          longest_skill_streak = greatest(c.longest_skill_streak, 1),
          last_skill_date      = current_date
      where id = p_chore_id;
  end if;
end $$;

revoke all on function public.bump_skill_streak(uuid) from public;
-- Only invoked from other security-definer RPCs (finish_chore, approve_chore);
-- no grant to authenticated.
