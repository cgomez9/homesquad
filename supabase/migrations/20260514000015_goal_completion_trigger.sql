-- supabase/migrations/20260514000015_goal_completion_trigger.sql
-- Trigger that fires after every positive star_ledger INSERT. When cumulative
-- positive deltas since the active goal's creation reach target_stars, the
-- goal is flipped to 'completed' and a goal_completed push is enqueued.
--
-- Concurrency safety: the UPDATE uses "WHERE status = 'active'" and the
-- subsequent "IF FOUND" guard prevents the push from firing twice when two
-- concurrent inserts both see status='active' but only one actually flips it.

create or replace function public.check_active_goal() returns trigger
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_goal     public.family_goals;
  v_progress int;
begin
  select * into v_goal
    from public.family_goals
   where family_id = NEW.family_id and status = 'active'
   limit 1;

  if v_goal.id is null then
    return NEW;
  end if;

  select coalesce(sum(delta)::int, 0) into v_progress
    from public.star_ledger
   where family_id = NEW.family_id
     and delta > 0
     and created_at >= v_goal.created_at;

  if v_progress >= v_goal.target_stars then
    update public.family_goals
       set status = 'completed', completed_at = now()
     where id = v_goal.id and status = 'active';

    if found then
      begin
        perform public.send_push(
          NEW.family_id,
          'goal_completed',
          jsonb_build_object(
            'goal_id',      v_goal.id,
            'goal_title',   v_goal.title,
            'target_stars', v_goal.target_stars
          )
        );
      exception when others then
        raise warning 'check_active_goal: send_push failed: %', sqlerrm;
      end;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists star_ledger_goal_check on public.star_ledger;
create trigger star_ledger_goal_check
  after insert on public.star_ledger
  for each row when (NEW.delta > 0)
  execute function public.check_active_goal();
