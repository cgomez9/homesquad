create table public.chores (
  id                  uuid primary key default gen_random_uuid(),
  family_id           uuid not null references public.families(id) on delete cascade,
  title               text not null check (length(title) between 1 and 80),
  description         text check (description is null or length(description) <= 500),
  star_value          int  not null check (star_value between 1 and 999),
  assignee_profile_id uuid references public.profiles(id),
  verification_mode   text not null check (verification_mode in ('auto','photo','approval')),
  recurrence          jsonb not null,
  next_due_at         timestamptz,
  active              boolean not null default true,
  created_by          uuid not null references public.profiles(id),
  created_at          timestamptz not null default now()
);

create index chores_family_active_idx on public.chores(family_id) where active;
create index chores_next_due_idx on public.chores(next_due_at) where active and next_due_at is not null;

alter table public.chores enable row level security;

create policy chores_select_own_family on public.chores
  for select using (
    exists (select 1 from public.profiles p
            where p.user_id = auth.uid() and p.type = 'parent' and p.family_id = chores.family_id)
  );

create policy chores_insert_own_family on public.chores
  for insert with check (
    exists (select 1 from public.profiles p
            where p.user_id = auth.uid() and p.type = 'parent' and p.family_id = chores.family_id)
  );

create policy chores_update_own_family on public.chores
  for update using (
    exists (select 1 from public.profiles p
            where p.user_id = auth.uid() and p.type = 'parent' and p.family_id = chores.family_id)
  ) with check (
    exists (select 1 from public.profiles p
            where p.user_id = auth.uid() and p.type = 'parent' and p.family_id = chores.family_id)
  );
-- No DELETE policy: archive_chore RPC sets active=false instead.
