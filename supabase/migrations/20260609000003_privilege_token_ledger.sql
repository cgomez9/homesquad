-- supabase/migrations/20260609000003_privilege_token_ledger.sql
-- Append-only ledger for privilege tokens. Mirrors star_ledger.
--
-- Tokens are awarded when a kind='skill' chore is approved, and debited when a
-- kid redeems a privilege (extra screen time, pick movie, etc.). The token
-- track is intentionally separate from star_ledger so kids can't convert
-- skill effort into money — the only redemption surface is the privileges
-- table, whose entries grant non-monetary perks.
--
-- Balance = sum(delta) for a given profile_id, exactly like stars.

create table public.privilege_token_ledger (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  delta       int  not null,
  reason      text not null check (reason in
               ('skill_approved','redemption','manual_grant','manual_revoke')),
  source_id   uuid,
  created_at  timestamptz not null default now()
);

create index privilege_token_ledger_profile_idx
  on public.privilege_token_ledger(profile_id);
create index privilege_token_ledger_family_recent_idx
  on public.privilege_token_ledger(family_id, created_at desc);

alter table public.privilege_token_ledger enable row level security;

-- Kid sessions need to read their own balance; current_family_id() resolves
-- both parent and kid sessions (matches star_ledger after the kid-access pass).
create policy privilege_token_ledger_select_own_family
  on public.privilege_token_ledger
  for select using (
    family_id = public.current_family_id()
  );
-- No INSERT/UPDATE/DELETE policies. All writes via security-definer RPCs
-- (finish_chore, approve_chore, approve_privilege_redemption).
-- Append-only enforced by absence of UPDATE/DELETE policies.
