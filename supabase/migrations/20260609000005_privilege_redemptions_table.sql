-- supabase/migrations/20260609000005_privilege_redemptions_table.sql
-- Per-request record of a kid spending tokens on a privilege. Mirrors
-- redemptions exactly except for the cost field name.
--
-- The token debit lives in privilege_token_ledger (inserted on approval).
-- token_cost_snapshot records the cost at request time so later changes to
-- privileges.token_cost don't retroactively change what the kid paid.

create table public.privilege_redemptions (
  id                  uuid primary key default gen_random_uuid(),
  family_id           uuid not null references public.families(id) on delete cascade,
  privilege_id        uuid not null references public.privileges(id) on delete cascade,
  kid_profile_id      uuid not null references public.profiles(id) on delete cascade,
  token_cost_snapshot int  not null,
  status              text not null default 'pending'
                       check (status in ('pending','approved','denied','fulfilled')),
  requested_at        timestamptz not null default now(),
  resolved_by         uuid references public.profiles(id),
  resolved_at         timestamptz,
  parent_note         text
);

create index privilege_redemptions_family_status_idx
  on public.privilege_redemptions(family_id, status);
create index privilege_redemptions_kid_recent_idx
  on public.privilege_redemptions(kid_profile_id, requested_at desc);

alter table public.privilege_redemptions enable row level security;

-- Both parents and kid sessions need to see redemption history.
create policy privilege_redemptions_select_own_family on public.privilege_redemptions
  for select using (
    family_id = public.current_family_id()
  );
-- No INSERT/UPDATE/DELETE policies. All writes via security-definer RPCs.
