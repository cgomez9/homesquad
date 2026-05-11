create table public.achievements (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.families(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  achievement_key text not null,
  unlocked_at     timestamptz not null default now(),
  unique (profile_id, achievement_key)
);

create index achievements_profile_unlocked_idx on public.achievements(profile_id, unlocked_at desc);

alter table public.achievements enable row level security;

create policy achievements_select_own_family on public.achievements
  for select using (
    exists (select 1 from public.profiles p
            where p.user_id = auth.uid() and p.type = 'parent' and p.family_id = achievements.family_id)
  );
-- No INSERT/UPDATE/DELETE policies. Writes via check_achievements (security definer).
