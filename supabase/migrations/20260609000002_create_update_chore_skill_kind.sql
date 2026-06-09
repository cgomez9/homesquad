-- supabase/migrations/20260609000002_create_update_chore_skill_kind.sql
-- Extend create_chore / update_chore to accept the new kind + token_value.
--
-- create_chore signature gains two trailing params (both with defaults) so
-- existing parent UI callers keep working unchanged. update_chore intentionally
-- does NOT accept kind: a chore's kind is immutable, since changing it would
-- orphan ledger entries (star_ledger vs privilege_token_ledger) and streak
-- counters. To convert, archive the existing chore and create a new one.

create or replace function public.create_chore(
  family_id           uuid,
  title               text,
  description         text,
  star_value          int,
  assignee_profile_id uuid,
  verification_mode   text,
  recurrence          jsonb,
  kind                text default 'chore',
  token_value         int  default null
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_profile uuid;
  new_id uuid;
  initial_next_due timestamptz;
begin
  select id into caller_profile
  from public.profiles
  where user_id = auth.uid() and type = 'parent' and profiles.family_id = create_chore.family_id;
  if caller_profile is null then
    raise exception 'caller is not a parent in family %', family_id;
  end if;

  if assignee_profile_id is not null and not exists (
    select 1 from public.profiles
    where id = assignee_profile_id and profiles.family_id = create_chore.family_id
  ) then
    raise exception 'assignee % not in family %', assignee_profile_id, family_id;
  end if;

  -- kind/value consistency: caller-facing errors before the DB XOR fires.
  if kind = 'chore' then
    if star_value is null then raise exception 'star_value required for kind=chore'; end if;
    if token_value is not null then raise exception 'token_value not allowed for kind=chore'; end if;
  elsif kind = 'skill' then
    if token_value is null then raise exception 'token_value required for kind=skill'; end if;
    if star_value is not null then raise exception 'star_value not allowed for kind=skill'; end if;
  else
    raise exception 'kind must be chore or skill (got %)', kind;
  end if;

  perform public.next_occurrence(recurrence, now());
  initial_next_due := public.next_occurrence(recurrence, now() - interval '1 day');

  insert into public.chores(
    family_id, title, description, star_value, assignee_profile_id,
    verification_mode, recurrence, next_due_at, created_by, kind, token_value
  ) values (
    create_chore.family_id, create_chore.title, create_chore.description,
    create_chore.star_value, create_chore.assignee_profile_id,
    create_chore.verification_mode, create_chore.recurrence,
    initial_next_due, caller_profile, create_chore.kind, create_chore.token_value
  ) returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.update_chore(
  chore_id            uuid,
  title               text default null,
  description         text default null,
  star_value          int  default null,
  assignee_profile_id uuid default null,
  clear_assignee      boolean default false,
  verification_mode   text default null,
  recurrence          jsonb default null,
  token_value         int  default null
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_family uuid;
  target_family uuid;
  target_kind   text;
begin
  select profiles.family_id into caller_family
  from public.profiles
  where user_id = auth.uid() and type = 'parent';
  if caller_family is null then
    raise exception 'caller is not a parent';
  end if;

  select c.family_id, c.kind into target_family, target_kind
    from public.chores c where c.id = chore_id;
  if target_family is null or target_family <> caller_family then
    raise exception 'chore % not in caller family', chore_id;
  end if;

  -- Don't let callers cross the kind boundary: chores keep star_value, skill
  -- tasks keep token_value. The DB XOR would catch a mismatch, but a
  -- caller-facing message is clearer.
  if target_kind = 'chore' and token_value is not null then
    raise exception 'cannot set token_value on a star chore';
  end if;
  if target_kind = 'skill' and star_value is not null then
    raise exception 'cannot set star_value on a skill task';
  end if;

  if assignee_profile_id is not null and not exists (
    select 1 from public.profiles
    where id = assignee_profile_id and profiles.family_id = caller_family
  ) then
    raise exception 'assignee % not in family', assignee_profile_id;
  end if;

  if recurrence is not null then
    perform public.next_occurrence(recurrence, now());
  end if;

  update public.chores set
    title             = coalesce(update_chore.title, chores.title),
    description       = coalesce(update_chore.description, chores.description),
    star_value        = coalesce(update_chore.star_value, chores.star_value),
    token_value       = coalesce(update_chore.token_value, chores.token_value),
    assignee_profile_id =
      case when clear_assignee then null
           when update_chore.assignee_profile_id is not null then update_chore.assignee_profile_id
           else chores.assignee_profile_id end,
    verification_mode = coalesce(update_chore.verification_mode, chores.verification_mode),
    recurrence        = coalesce(update_chore.recurrence, chores.recurrence),
    next_due_at       =
      case when update_chore.recurrence is not null
           then public.next_occurrence(update_chore.recurrence, now() - interval '1 second')
           else chores.next_due_at end
  where id = chore_id;
end;
$$;
