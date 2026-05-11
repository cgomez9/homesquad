create or replace function public.create_family_invite()
  returns text
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_profile uuid;
  caller_family  uuid;
  candidate      text;
  attempts       int := 0;
begin
  select id, profiles.family_id into caller_profile, caller_family
  from public.profiles
  where user_id = auth.uid() and type = 'parent';
  if caller_profile is null then raise exception 'caller is not a parent'; end if;

  loop
    attempts := attempts + 1;
    candidate := lpad((floor(random() * 1000000))::int::text, 6, '0');
    begin
      insert into public.family_invites(family_id, code, created_by)
      values (caller_family, candidate, caller_profile);
      return candidate;
    exception when unique_violation then
      if attempts >= 5 then
        raise exception 'could not generate unique code after 5 attempts';
      end if;
    end;
  end loop;
end;
$$;
