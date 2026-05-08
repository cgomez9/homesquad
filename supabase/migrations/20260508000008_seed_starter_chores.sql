create or replace function public.seed_starter_chores(family_id uuid)
  returns int
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_profile uuid;
  inserted int := 0;
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
         public.next_occurrence('{"type":"daily"}'::jsonb, now() - interval '1 second')
  from (values ('Make bed'), ('Brush teeth'), ('Feed pet'), ('Tidy room'), ('Homework')) t(title);

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- One-shot backfill for any pre-M2 family. Service-role context, so we sidestep
-- the auth.uid() check inside seed_starter_chores by inlining the same insert here.
do $$
declare f record; pp uuid;
begin
  for f in select id from public.families loop
    if not exists (select 1 from public.chores where chores.family_id = f.id) then
      select id into pp from public.profiles where profiles.family_id = f.id and type = 'parent' limit 1;
      if pp is null then continue; end if;
      insert into public.chores(family_id, title, star_value, verification_mode, recurrence, created_by, next_due_at)
      select f.id, t.title, 10, 'approval', '{"type":"daily"}'::jsonb, pp,
             public.next_occurrence('{"type":"daily"}'::jsonb, now() - interval '1 second')
      from (values ('Make bed'), ('Brush teeth'), ('Feed pet'), ('Tidy room'), ('Homework')) t(title);
    end if;
  end loop;
end $$;
