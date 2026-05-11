create or replace function public.set_push_token(token text)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare caller_profile uuid;
begin
  select id into caller_profile from public.profiles where user_id = auth.uid();
  if caller_profile is null then raise exception 'no profile for caller'; end if;
  update public.profiles set push_token = token where id = caller_profile;
end;
$$;
