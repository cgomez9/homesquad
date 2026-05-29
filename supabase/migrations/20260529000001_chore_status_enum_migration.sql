-- Status enum: 'submitted' renamed to 'finished'; 'started' added as a new
-- pre-finish state. Audit timestamps started_at + finished_at added. The
-- partial index on the open-state set is refreshed to include the new states.

alter table public.chore_instances drop constraint chore_instances_status_check;

update public.chore_instances set status = 'finished' where status = 'submitted';

alter table public.chore_instances
  add constraint chore_instances_status_check
  check (status in ('pending','started','finished','approved','rejected'));

alter table public.chore_instances
  add column started_at  timestamptz,
  add column finished_at timestamptz;

-- Preserve the audit trail for already-completed rows.
update public.chore_instances
   set finished_at = completed_at
 where status = 'finished' and finished_at is null;

drop index if exists chore_instances_open_assignee_idx;
create index chore_instances_open_assignee_idx
  on public.chore_instances(assignee_profile_id, due_at)
  where status in ('pending','started','finished','rejected');
