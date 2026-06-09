-- supabase/migrations/20260609000001_chores_skill_kind.sql
-- Add skill-task support to chores.
--
-- Skill tasks (e.g. "practice piano") are intentionally decoupled from the
-- star economy: completing one awards privilege tokens via a separate ledger
-- (privilege_token_ledger, added in 20260609000003) and contributes to a
-- per-chore skill streak stored on the chores row itself. They never write
-- to star_ledger or the global streaks table.
--
-- Existing chores remain kind='chore' (default). The XOR check makes the
-- "kind / value" pairing self-validating: chores carry star_value, skill
-- tasks carry token_value, never both.

alter table public.chores
  add column kind text not null default 'chore'
  check (kind in ('chore','skill'));

-- star_value: nullable, only required for kind='chore'.
alter table public.chores alter column star_value drop not null;
alter table public.chores drop constraint chores_star_value_check;
alter table public.chores
  add constraint chores_star_value_check
  check (star_value is null or star_value between 1 and 999);

-- token_value: range mirrors star_value; required for kind='skill'.
alter table public.chores
  add column token_value int
  check (token_value is null or token_value between 1 and 999);

-- Exactly one of (star_value, token_value) is set, matching the kind.
alter table public.chores
  add constraint chores_kind_value_xor check (
    (kind = 'chore' and star_value is not null and token_value is null)
    or
    (kind = 'skill' and token_value is not null and star_value is null)
  );

-- Per-chore skill streak. Only updated for kind='skill' rows by
-- finish_chore / approve_chore. Stored here (not in a new table) because
-- the streak is conceptually tied to a single recurring skill task.
alter table public.chores add column current_skill_streak int not null default 0;
alter table public.chores add column longest_skill_streak int not null default 0;
alter table public.chores add column last_skill_date date;
