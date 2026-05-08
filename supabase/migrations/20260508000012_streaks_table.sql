create table public.streaks (
  profile_id          uuid primary key references public.profiles(id) on delete cascade,
  family_id           uuid not null references public.families(id) on delete cascade,
  current_count       int not null default 0,
  longest_count       int not null default 0,
  last_completion_date date
);

alter table public.streaks enable row level security;

create policy streaks_select_own_family on public.streaks
  for select using (
    exists (select 1 from public.profiles p
            where p.user_id = auth.uid() and p.type = 'parent' and p.family_id = streaks.family_id)
  );
-- No mutation policies. All writes via approve_chore (security definer).
