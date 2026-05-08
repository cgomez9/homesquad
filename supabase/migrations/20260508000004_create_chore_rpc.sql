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

  initial_next_due := public.next_occurrence(recurrence, now() - interval '1 second');

  insert into public.chores(
    family_id, title, description, star_value, assignee_profile_id,
    verification_mode, recurrence, next_due_at, created_by
  ) values (
    create_chore.family_id, create_chore.title, create_chore.description,
    create_chore.star_value, create_chore.assignee_profile_id,
    create_chore.verification_mode, create_chore.recurrence,
    initial_next_due, caller_profile
  ) returning id into new_id;

  return new_id;
end;
$$;
