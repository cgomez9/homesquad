-- request_redemption now accepts kid-session callers in addition to parent
-- callers. A kid session is identified by current_kid_id() returning non-null.
-- When a kid calls, the caller_kid_id must equal kid_profile_id (i.e., a kid
-- may only request a redemption for themselves, not for a sibling).
-- The rest of the guard logic (reward in family, balance check, insert) is
-- unchanged from 20260509000007_request_redemption_rpc.sql.

create or replace function public.request_redemption(reward_id uuid, kid_profile_id uuid)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  caller_family  uuid;
  caller_kid_id  uuid;
  rew            public.rewards%rowtype;
  kid_family     uuid;
  kid_type       text;
  balance        int;
  new_id         uuid;
begin
  -- Resolve caller. Accept parent OR kid session.
  caller_family  := public.current_family_id();
  caller_kid_id  := public.current_kid_id();
  if caller_family is null then
    raise exception 'caller is not authenticated to any family';
  end if;
  if caller_kid_id is not null and caller_kid_id <> kid_profile_id then
    raise exception 'kid session may only request redemptions for itself';
  end if;

  -- kid_profile_id must be a kid in the caller's family
  select profiles.family_id, profiles.type into kid_family, kid_type
    from public.profiles where id = kid_profile_id;
  if kid_family is null or kid_family <> caller_family or kid_type <> 'kid' then
    raise exception 'kid_profile_id % not a kid in family', kid_profile_id;
  end if;

  -- reward must exist, be active, and be in the same family
  select * into rew from public.rewards where id = reward_id for update;
  if rew.id is null or rew.family_id <> caller_family or not rew.active then
    raise exception 'reward % not available', reward_id;
  end if;

  -- balance check
  select coalesce(sum(delta), 0)::int into balance
    from public.star_ledger where profile_id = kid_profile_id;
  if balance < rew.star_cost then
    raise exception 'insufficient stars (balance=%, cost=%)', balance, rew.star_cost;
  end if;

  insert into public.redemptions(family_id, reward_id, kid_profile_id, star_cost_snapshot)
    values (caller_family, reward_id, kid_profile_id, rew.star_cost)
    returning id into new_id;

  return new_id;
end;
$$;
