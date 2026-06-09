-- supabase/migrations/20260609000010_privilege_redemption_rpcs.sql
-- request / approve / deny / fulfill RPCs for privilege redemptions.
-- Bodies mirror the rewards-side equivalents (20260509000007/8/9/10 and the
-- kid-session-accepting variant in 20260528000009), against the privilege
-- tables and the privilege_token_ledger. Both kid-session and parent
-- callers can request; only parents resolve.

create or replace function public.request_privilege_redemption(
  privilege_id   uuid,
  kid_profile_id uuid
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_family uuid;
  caller_kid_id uuid;
  priv          public.privileges%rowtype;
  kid_family    uuid;
  kid_type      text;
  balance       int;
  new_id        uuid;
begin
  caller_family := public.current_family_id();
  caller_kid_id := public.current_kid_id();
  if caller_family is null then
    raise exception 'caller is not authenticated to any family';
  end if;
  if caller_kid_id is not null and caller_kid_id <> kid_profile_id then
    raise exception 'kid session may only request redemptions for itself';
  end if;

  select profiles.family_id, profiles.type into kid_family, kid_type
    from public.profiles where id = kid_profile_id;
  if kid_family is null or kid_family <> caller_family or kid_type <> 'kid' then
    raise exception 'kid_profile_id % not a kid in family', kid_profile_id;
  end if;

  select * into priv from public.privileges where id = privilege_id for update;
  if priv.id is null or priv.family_id <> caller_family or not priv.active then
    raise exception 'privilege % not available', privilege_id;
  end if;

  select coalesce(sum(delta), 0)::int into balance
    from public.privilege_token_ledger where profile_id = kid_profile_id;
  if balance < priv.token_cost then
    raise exception 'insufficient tokens (balance=%, cost=%)', balance, priv.token_cost;
  end if;

  insert into public.privilege_redemptions(family_id, privilege_id, kid_profile_id, token_cost_snapshot)
    values (caller_family, privilege_id, kid_profile_id, priv.token_cost)
    returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.approve_privilege_redemption(redemption_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_profile uuid;
  caller_family  uuid;
  red            public.privilege_redemptions%rowtype;
  balance        int;
begin
  select id, profiles.family_id into caller_profile, caller_family
  from public.profiles where user_id = auth.uid() and type = 'parent';
  if caller_profile is null then raise exception 'caller is not a parent'; end if;

  select * into red from public.privilege_redemptions where id = redemption_id for update;
  if red.id is null then raise exception 'redemption % not found', redemption_id; end if;
  if red.family_id <> caller_family then raise exception 'redemption % not in caller family', redemption_id; end if;
  if red.status = 'approved' then return; end if;
  if red.status <> 'pending' then raise exception 'redemption % is not pending (status=%)', redemption_id, red.status; end if;

  -- Defense-in-depth: re-check balance at approve time.
  select coalesce(sum(delta), 0)::int into balance
    from public.privilege_token_ledger where profile_id = red.kid_profile_id;
  if balance < red.token_cost_snapshot then
    raise exception 'insufficient tokens at approve time (balance=%, cost=%)', balance, red.token_cost_snapshot;
  end if;

  update public.privilege_redemptions
    set status='approved', resolved_by=caller_profile, resolved_at=now()
    where id = redemption_id;

  insert into public.privilege_token_ledger(family_id, profile_id, delta, reason, source_id)
  values (red.family_id, red.kid_profile_id, -red.token_cost_snapshot, 'redemption', redemption_id);
end;
$$;

create or replace function public.deny_privilege_redemption(
  redemption_id uuid,
  parent_note   text default ''
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_profile uuid;
  caller_family  uuid;
  red            public.privilege_redemptions%rowtype;
begin
  select id, profiles.family_id into caller_profile, caller_family
  from public.profiles where user_id = auth.uid() and type = 'parent';
  if caller_profile is null then raise exception 'caller is not a parent'; end if;

  select * into red from public.privilege_redemptions where id = redemption_id for update;
  if red.id is null then raise exception 'redemption % not found', redemption_id; end if;
  if red.family_id <> caller_family then raise exception 'redemption % not in caller family', redemption_id; end if;
  if red.status = 'denied' then return; end if;
  if red.status <> 'pending' then raise exception 'redemption % is not pending (status=%)', redemption_id, red.status; end if;

  update public.privilege_redemptions
    set status='denied', resolved_by=caller_profile, resolved_at=now(),
        parent_note=coalesce(deny_privilege_redemption.parent_note, '')
    where id = redemption_id;
end;
$$;

create or replace function public.fulfill_privilege_redemption(redemption_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_profile uuid;
  caller_family  uuid;
  red            public.privilege_redemptions%rowtype;
begin
  select id, profiles.family_id into caller_profile, caller_family
  from public.profiles where user_id = auth.uid() and type = 'parent';
  if caller_profile is null then raise exception 'caller is not a parent'; end if;

  select * into red from public.privilege_redemptions where id = redemption_id for update;
  if red.id is null then raise exception 'redemption % not found', redemption_id; end if;
  if red.family_id <> caller_family then raise exception 'redemption % not in caller family', redemption_id; end if;
  if red.status = 'fulfilled' then return; end if;
  if red.status <> 'approved' then raise exception 'redemption % is not approved (status=%)', redemption_id, red.status; end if;

  update public.privilege_redemptions set status='fulfilled' where id = redemption_id;
end;
$$;
