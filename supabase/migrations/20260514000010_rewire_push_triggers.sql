-- supabase/migrations/20260514000010_rewire_push_triggers.sql
-- Replace the M5 trigger function bodies. They were the only callers of
-- net.http_post(...send_push...) — that pattern is now obsolete. The new
-- triggers call public.send_push(family_id, event_type, payload), which
-- enqueues into push_outbox. The send_push_drain Edge Function (next task)
-- handles the actual Expo POST.

create or replace function public.notify_push_chore() returns trigger
  language plpgsql security definer as $$
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

create or replace function public.notify_push_redemption() returns trigger
  language plpgsql security definer as $$
declare event_kind text;
begin
  -- The redemptions status enum is (pending|approved|denied|fulfilled).
  -- redemption_requested fires when a redemption is INSERTed (status='pending'),
  -- matching the M5 trigger semantics. Two triggers attach this function:
  -- redemptions_push_trigger_insert and redemptions_push_trigger_update.
  if TG_OP = 'INSERT' and NEW.status = 'pending' then
    event_kind := 'redemption_requested';
  elsif TG_OP = 'UPDATE' and NEW.status = 'approved'  and OLD.status <> 'approved' then
    event_kind := 'redemption_approved';
  elsif TG_OP = 'UPDATE' and NEW.status = 'denied'    and OLD.status <> 'denied' then
    event_kind := 'redemption_denied';
  elsif TG_OP = 'UPDATE' and NEW.status = 'fulfilled' and OLD.status <> 'fulfilled' then
    event_kind := 'redemption_fulfilled';
  else
    return NEW;
  end if;

  begin
    perform public.send_push(
      NEW.family_id,
      event_kind,
      jsonb_build_object(
        'redemption_id',  NEW.id,
        'reward_id',      NEW.reward_id,
        'kid_profile_id', NEW.kid_profile_id
      )
    );
  exception when others then
    raise warning 'notify_push_redemption: send_push failed: %', sqlerrm;
  end;
  return NEW;
end;
$$;

create or replace function public.notify_push_achievement() returns trigger
  language plpgsql security definer as $$
begin
  begin
    perform public.send_push(
      NEW.family_id,
      'achievement_unlocked',
      jsonb_build_object(
        'profile_id',      NEW.profile_id,
        'achievement_key', NEW.achievement_key
      )
    );
  exception when others then
    raise warning 'notify_push_achievement: send_push failed: %', sqlerrm;
  end;
  return NEW;
end;
$$;
