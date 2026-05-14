-- supabase/migrations/20260514000004_family_goals.sql
-- Co-op goal storage. One active goal per family enforced by partial
-- unique index. Progress is computed on read from star_ledger; no
-- denormalized progress column.

create table public.family_goals (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  title         text not null,
  description   text,
  target_stars  int  not null check (target_stars > 0),
  status        text not null default 'active'
                check (status in ('active','completed','canceled')),
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create unique index family_goals_one_active_per_family
  on public.family_goals (family_id)
  where status = 'active';

create index family_goals_family_status_idx
  on public.family_goals (family_id, status);

alter table public.family_goals enable row level security;

create policy family_goals_read_own_family
  on public.family_goals
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.family_id = family_goals.family_id
    )
  );

-- Writes go through SECURITY DEFINER RPCs (create_family_goal,
-- cancel_family_goal) — no direct INSERT/UPDATE policy.
