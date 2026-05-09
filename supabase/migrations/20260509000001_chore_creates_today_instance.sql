-- Make create_chore + seed_starter_chores immediately materialize today's
-- chore_instance so a parent who creates a chore mid-session sees it on the
-- kid's home without waiting for the daily cron run. The cron continues to
-- handle tomorrow and beyond.

-- 1. Helper that inserts the next-due instance for one chore and advances
--    next_due_at. Idempotent via the (chore_id, due_at) unique index.
create or replace function public.ensure_today_instance(p_chore_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare c public.chores%rowtype;
begin
  select * into c from public.chores where id = p_chore_id;
  if c.id is null or not c.active or c.next_due_at is null then return; end if;
  if c.next_due_at > now() + interval '24 hours' then return; end if;

  insert into public.chore_instances(chore_id, family_id, assignee_profile_id, due_at)
  values (c.id, c.family_id, c.assignee_profile_id, c.next_due_at)
  on conflict (chore_id, due_at) do nothing;

  update public.chores
    set next_due_at = public.next_occurrence(c.recurrence, c.next_due_at)
    where id = c.id;
end;
$$;

-- 2. create_chore now calls ensure_today_instance after insert.
create or replace function public.create_chore(
  family_id           uuid,
  title               text,
  description         text,
  star_value          int,
  assignee_profile_id uuid,
  verification_mode   text,
  recurrence          jsonb
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

  perform public.next_occurrence(recurrence, now());

  -- Look back ~1 day so the first occurrence resolves to today's midnight UTC,
  -- not tomorrow's.
  initial_next_due := public.next_occurrence(recurrence, now() - interval '1 day');

  insert into public.chores(
    family_id, title, description, star_value, assignee_profile_id,
    verification_mode, recurrence, next_due_at, created_by
  ) values (
    create_chore.family_id, create_chore.title, create_chore.description,
    create_chore.star_value, create_chore.assignee_profile_id,
    create_chore.verification_mode, create_chore.recurrence,
    initial_next_due, caller_profile
  ) returning id into new_id;

  -- Materialize today's instance immediately if the next_due_at is within the
  -- generator's 24h window. The daily cron handles future days.
  perform public.ensure_today_instance(new_id);

  return new_id;
end;
$$;

-- 3. seed_starter_chores: same treatment for the 5 onboarding chores.
create or replace function public.seed_starter_chores(family_id uuid)
  returns int
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_profile uuid;
  inserted int := 0;
  c record;
begin
  select id into caller_profile
  from public.profiles
  where user_id = auth.uid() and type = 'parent' and profiles.family_id = seed_starter_chores.family_id;
  if caller_profile is null then
    raise exception 'caller is not a parent in family %', family_id;
  end if;

  if exists (select 1 from public.chores where chores.family_id = seed_starter_chores.family_id) then
    return 0;
  end if;

  insert into public.chores(family_id, title, star_value, verification_mode, recurrence, assignee_profile_id, created_by, next_due_at)
  select seed_starter_chores.family_id, t.title, 10, 'approval', '{"type":"daily"}'::jsonb, null, caller_profile,
         public.next_occurrence('{"type":"daily"}'::jsonb, now() - interval '1 day')
  from (values ('Make bed'), ('Brush teeth'), ('Feed pet'), ('Tidy room'), ('Homework')) t(title);

  get diagnostics inserted = row_count;

  -- Materialize today's instance for each newly seeded chore.
  for c in
    select id from public.chores where chores.family_id = seed_starter_chores.family_id
  loop
    perform public.ensure_today_instance(c.id);
  end loop;

  return inserted;
end;
$$;
