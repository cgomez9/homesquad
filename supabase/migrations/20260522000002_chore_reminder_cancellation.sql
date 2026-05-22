-- 2026-05-22: cancel pending chore_reminder rows in push_outbox when the
-- linked chore_instance leaves 'pending' or its chore is archived.
-- Both triggers are SECURITY DEFINER so the cancel update succeeds under RLS.

create or replace function public.cancel_reminders_on_instance_status_change()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if old.status = 'pending' and new.status is distinct from 'pending' then
    update public.push_outbox
       set status = 'canceled'
     where status = 'pending'
       and event_type = 'chore_reminder'
       and (payload->>'chore_id')::uuid = new.chore_id
       and (payload->>'due_at')::timestamptz = new.due_at;
  end if;
  return new;
end;
$$;

create trigger chore_instance_cancel_reminder
  after update of status on public.chore_instances
  for each row execute function public.cancel_reminders_on_instance_status_change();

create or replace function public.cancel_reminders_on_chore_archive()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if old.active = true and new.active = false then
    update public.push_outbox
       set status = 'canceled'
     where status = 'pending'
       and event_type = 'chore_reminder'
       and (payload->>'chore_id')::uuid = new.id;
  end if;
  return new;
end;
$$;

create trigger chore_cancel_reminders_on_archive
  after update of active on public.chores
  for each row execute function public.cancel_reminders_on_chore_archive();
