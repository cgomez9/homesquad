-- supabase/migrations/20260528000001_kid_devices_schema.sql
-- Tables for kid-on-own-device pairing. See spec
-- docs/superpowers/specs/2026-05-28-kid-device-pairing-design.md

create table public.kid_pairing_codes (
  code         char(6)     primary key,
  kid_id       uuid        not null references public.profiles(id) on delete cascade,
  family_id    uuid        not null references public.families(id) on delete cascade,
  issued_by    uuid        not null references auth.users(id),
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index kid_pairing_codes_open_idx
  on public.kid_pairing_codes (expires_at)
  where used_at is null;

create table public.kid_devices (
  id           uuid        primary key default gen_random_uuid(),
  kid_id       uuid        not null references public.profiles(id) on delete cascade,
  family_id    uuid        not null references public.families(id) on delete cascade,
  user_id      uuid        not null unique references auth.users(id) on delete cascade,
  device_name  text        not null,
  push_token   text,
  paired_at    timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at   timestamptz
);

create index kid_devices_active_by_kid_idx
  on public.kid_devices (kid_id)
  where revoked_at is null;

alter table public.kid_pairing_codes enable row level security;
alter table public.kid_devices       enable row level security;

-- Parents in the family can see codes they (or another parent) issued.
create policy kid_pairing_codes_select_own_family
  on public.kid_pairing_codes for select
  using (family_id = public.current_family_id());

create policy kid_pairing_codes_insert_own_family
  on public.kid_pairing_codes for insert
  with check (family_id = public.current_family_id());

create policy kid_devices_select_own_family_or_self
  on public.kid_devices for select
  using (
    family_id = public.current_family_id()
    or user_id = auth.uid()
  );

create policy kid_devices_insert_own_family
  on public.kid_devices for insert
  with check (family_id = public.current_family_id());

create policy kid_devices_update_self
  on public.kid_devices for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
