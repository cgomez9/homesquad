create table public.family_invites (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  code        text not null unique check (code ~ '^[0-9]{6}$'),
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '24 hours'),
  used_by     uuid references public.profiles(id),
  used_at     timestamptz
);

create index family_invites_family_idx on public.family_invites(family_id);

alter table public.family_invites enable row level security;

create policy family_invites_select_own_family on public.family_invites
  for select using (
    exists (select 1 from public.profiles p
            where p.user_id = auth.uid() and p.type = 'parent' and p.family_id = family_invites.family_id)
  );
-- No INSERT/UPDATE/DELETE policies. All writes via SD RPCs.
