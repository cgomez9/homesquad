-- supabase/migrations/20260529000010_notify_push_chore_finished.sql
-- The kid-side terminal state was renamed from 'submitted' to 'finished' (m11
-- 20260529000001). Also: with the new started state, the transition into
-- 'finished' can come from either 'pending' (kid bypassed Start — not possible
-- via finish_chore, but defensive) or 'started' (normal path). Update the
-- trigger to fire on both transitions. The event_kind 'chore_submitted' is
-- preserved so the existing push i18n templates (M5) keep applying.

create or replace function public.notify_push_chore() returns trigger
  language plpgsql security definer as $$
declare event_kind text;
begin
  if (OLD.status = 'pending' or OLD.status = 'started') and NEW.status = 'finished' then
    event_kind := 'chore_submitted';
  elsif NEW.status = 'approved' and OLD.status <> 'approved' then
    event_kind := 'chore_approved';
  elsif NEW.status = 'rejected' and OLD.status <> 'rejected' then
    event_kind := 'chore_rejected';
  else
    return NEW;
  end if;

  begin
    perform public.send_push(
      NEW.family_id,
      event_kind,
      jsonb_build_object(
        'instance_id',    NEW.id,
        'kid_profile_id', NEW.completed_by
      )
    );
  exception when others then
    raise warning 'notify_push_chore: send_push failed: %', sqlerrm;
  end;
  return NEW;
end;
$$;
