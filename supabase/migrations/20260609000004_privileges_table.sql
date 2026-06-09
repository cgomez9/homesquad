-- supabase/migrations/20260609000004_privileges_table.sql
-- Catalog of privileges a kid can redeem with tokens. Mirrors the rewards
-- table; the field shapes are identical so the parent UI can reuse the same
-- form scaffolding.
--
-- Presets (extra screen time, pick movie, etc.) are NOT seeded as rows.
-- They are surfaced as a "Quick add" catalog in the parent UI; activating
-- one inserts a row. This keeps the table small and lets parents tweak
-- preset titles/costs before saving.

create table public.privileges (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  title       text not null check (length(title) between 1 and 80),
  description text check (description is null or length(description) <= 500),
  token_cost  int  not null check (token_cost between 1 and 9999),
  icon_id     smallint not null check (icon_id between 1 and 8),
  active      boolean not null default true,
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now()
);

create index privileges_family_active_idx on public.privileges(family_id) where active;

alter table public.privileges enable row level security;

-- Kids need to see the catalog on the privileges screen; current_family_id()
-- resolves both parent and kid sessions (matches the rewards-kid-access pass).
create policy privileges_select_own_family on public.privileges
  for select using (
    family_id = public.current_family_id()
  );

create policy privileges_insert_own_family on public.privileges
  for insert with check (
    exists (select 1 from public.profiles p
            where p.user_id = auth.uid() and p.type = 'parent' and p.family_id = privileges.family_id)
  );

create policy privileges_update_own_family on public.privileges
  for update using (
    exists (select 1 from public.profiles p
            where p.user_id = auth.uid() and p.type = 'parent' and p.family_id = privileges.family_id)
  ) with check (
    exists (select 1 from public.profiles p
            where p.user_id = auth.uid() and p.type = 'parent' and p.family_id = privileges.family_id)
  );
-- No DELETE policy: archive_privilege soft-deletes.
