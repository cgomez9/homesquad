# UI Fixes Batch — 2026-05-21

A bundle of eleven UI fixes raised against the redesigned `m7-prelaunch` branch.
Most are mechanical theme-token / contrast / layout corrections; three involve
small behavior changes (family-goal discoverability, approval-banner grouping,
badge dedup). Spec is intentionally narrow — no new features, no surface
beyond the listed files.

## Scope

11 issues across 5 surfaces:

| # | Surface                          | Issue                                                |
|---|----------------------------------|------------------------------------------------------|
| 1 | Chores form / verification picker | Selected-state blue (`#3b82f6`) too saturated       |
| 2 | Chores form / verification picker | Mode hint descriptions misalign                      |
| 3 | Parent home                      | Family-goal entry hidden in settings                 |
| 4 | Family-goal screens              | No explainer text                                    |
| 5 | GoalCard                         | `goal.description` never rendered                    |
| 6 | Kid home top bar                 | Switch-profile arrow invisible in dark               |
| 7 | Kid badges page                  | "EARNED" ribbon overlaps medallion                   |
| 8 | Kid home hero cards              | Stars / streak text invisible in dark                |
| 9 | Kid badges page                  | Locked cards unreadable in dark                      |
| 10| Achievement banner               | Multiple approvals replay one-by-one                 |
| 11| Achievement catalog              | `first_star` and `first_chore` collide               |

## Non-goals

- No palette or font changes.
- No change to live realtime banner gating (M6 already correct).
- No change to single-approval banner behavior.
- No change to the other 7 achievement thresholds.

## Fix details

### 1 + 2 — Verification picker (chores form)

**File:** `mobile/src/components/VerificationModePicker.tsx`

Current state: hardcoded `#3b82f6`, `#d1d5db`, `#374151`, `#dbeafe` etc. — no
`useTheme()` use. Each button is `flex: 1`, no `minHeight`, so unequal hint
text heights stretch one button taller than the others.

Changes:

- Convert to `useTheme()` + `makeStyles(colors)` factory (same pattern as
  other components in this codebase).
- Selected state: `colors.primary` background + `#fff` label + light-on-primary
  hint (e.g., `rgba(255,255,255,0.85)`).
- Unselected state: `colors.surface` background, `colors.border` border,
  `colors.text` label, `colors.textMuted` hint.
- Button layout: `minHeight: 64`, explicit gap of 2px between label and hint,
  hint `textAlign: 'center'`.
- Pull copy from i18n. Add keys:
  - `forms.verification.label` ("Verification")
  - `forms.verification.auto.label` ("Auto"), `.auto.hint` ("Tap done = done")
  - `forms.verification.photo.label` ("Photo"), `.photo.hint` ("Kid sends a photo")
  - `forms.verification.approval.label` ("Approval"), `.approval.hint` ("Parent confirms")
  - And the Spanish equivalents under `es.json`.

### 3 + 4 + 5 — Family goals

**Issue 3 — discoverability.**
File: `mobile/app/(app)/parent/index.tsx`. The parent home (`ChoresList`)
already calls `useActiveGoal(familyId)`. When `activeGoal.data` is null,
the header collapses with nothing where the GoalCard would sit. Add a
soft empty-state tile in that slot:

```
┌─────────────────────────────────────┐
│  🎯  Set a family goal         ›    │
│      Rally everyone toward a treat  │
└─────────────────────────────────────┘
```

- Renders only when `familyId && !activeGoal.data && !activeGoal.isLoading`.
- Background: `colors.surface`, soft teal accent edge (e.g., 1.5px
  `colors.border` or a subtle tinted background like the photoTag's
  `rgba(15,118,110,0.07)`).
- Tap → `router.push('/(app)/parent/goals/create')`.
- The existing Settings → More → Family Goals row stays unchanged.

**Issue 4 — explainer copy.** Add an explainer paragraph in two places:

- `goals/index.tsx` empty state — replace the lone `🎯` + "No active goal"
  with the emoji + a short explainer + the create button. New copy:
  `goals.purposeBlurb` = "A family goal rallies everyone toward a shared
  treat. Set a target — every kid's stars roll up together until you reach it."
- `goals/create.tsx` — add the same `goals.purposeBlurb` as a small muted
  caption right under the screen title, before the form fields.

**Issue 5 — description rendering.** File: `mobile/src/components/GoalCard.tsx`.
`ActiveGoal.description: string | null` is already in the data; just unused.
Render below the title when truthy:

```tsx
{goal.description ? <Text style={styles.description}>{goal.description}</Text> : null}
```

Style: `fontFamily: typography.fontFamilySemi`, `fontSize: typography.small`,
`color: colors.textMuted`, `fontStyle: 'italic'`, line-height tight.

### 6 — Switch-profile arrow dark contrast

**File:** `mobile/app/(app)/kid/[profileId]/index.tsx`

The `navIcon` style sets only `fontSize` — no `color`, so the `↩` glyph
falls back to OS default (~black) on the dark-mode `colors.surface` button.
Add `color: colors.text` to the `navIcon` style. Emoji glyphs (🏅 🎁 🏆)
ignore color so they remain unaffected; the text-glyph fallback is the
only one impacted.

### 7 — Badge "EARNED" ribbon overlap

**File:** `mobile/app/(app)/kid/[profileId]/badges.tsx`

The ribbon (`position: 'absolute', top: 12, right: 12`) lives at roughly
x = card-width minus 12, y = 12–30. The medallion is 74px centered with
~18px vertical padding above, so the medallion occupies y = 18–92 — the
ribbon clips the medallion's upper-right corner on phone widths.

Fix: replace the absolute "EARNED" ribbon with a small ✓ chip pinned to
the medallion's bottom-right corner, reading as a "verified" seal. The
unlocked date below the card title already conveys "earned"; the ribbon
text was redundant.

Implementation:

- Drop `ribbon` / `ribbonText` styles.
- In the `med` view, wrap the emoji in a `View` and conditionally render
  a `<View style={styles.medSeal}>` overlaid at `{ position: 'absolute',
  bottom: -4, right: -4 }` with background `colors.success`, border
  `colors.surface` (2px), 22×22 round, centered "✓" in white bold.

Drop the `badges.earned` i18n key only if unused elsewhere (verify with
grep before removing).

### 8 — Kid home hero card text contrast

**File:** `mobile/app/(app)/kid/[profileId]/index.tsx`

`heroGold` (`#FFF1C9`) and `heroFire` (`#FFE0D0`) are warm light tints
in both modes. The text uses `colors.text` / `colors.textMuted` which
in dark mode resolve to `#E8E8E0` / `#7D8FA5` — near-white on near-white
backgrounds.

Fix: pin the hero text to dark always-readable colors regardless of
theme. The hero tiles intentionally stay warm in both modes (it's the
visual hook of the kid home), so the backgrounds don't change. New
values:

- `heroBig`: change `color: colors.text` → `color: '#134E4A'` (the
  light-mode `text` token — works on both warm tints).
- `heroLbl`: change `color: colors.textMuted` → `color: '#5C7A78'`
  (light-mode `textMuted`).

Use literal hex (not the palette token) because we explicitly want
these to *not* track theme.

### 9 — Locked badges in dark mode

**File:** `mobile/app/(app)/kid/[profileId]/badges.tsx`

Move all currently-hardcoded locked colors into the `makeStyles(colors)`
factory. Specifically:

- `cardLocked.backgroundColor`: currently `'rgba(255,255,255,0.55)'`.
  Replace with a function of mode. Cleanest: keep the white tint
  for light, switch to `colors.surface` at ~0.45 alpha in dark. Since
  we don't have alpha helpers, just pin to two literal values:
  light → `'rgba(255,255,255,0.55)'`, dark → `'rgba(19,36,59,0.55)'`
  (the `#13243B` surface at 55%).
- `cardLocked.borderColor`, `medLocked.borderColor`: currently `#C4DAD6`
  (a light-only dashed). Switch to `colors.border` in both modes
  (`#D6E5E3` light / `#22324B` dark).
- `cardTitleLocked.color`: currently `#7E938F`. Switch to `colors.textMuted`.
- `cardDesc.color`: currently `#8A9C98`. Switch to `colors.textMuted`.

To pick light vs dark for the `cardLocked.backgroundColor`, read from
`useTheme()`'s mode (already returns `mode`). Pass it through to
`makeStyles(colors, isDark)`.

### 10 — Group multiple chore approvals into one banner

**Files:** `mobile/src/lib/celebrationQueue.ts`,
`mobile/src/components/AchievementBanner.tsx`, locales, tests.

Today: each `chore_approved` item plays back-to-back, 4 s each.
A kid with 3 missed approvals sits through 12 s of banner.

Design:

- Add `CelebrationItem` variant:
  `| { kind: 'approval_group'; count: number; stars: number; at: string }`
- `buildCelebrationQueue`:
  - If `approvals.length >= 2`: collapse all approval rows into one
    `approval_group` with `count = approvals.length`,
    `stars = sum(approvals.stars)`, `at = max(approvals.approved_at)`.
    Then sort-and-merge with achievements/goals as before (the group
    sits at the latest approval's timestamp).
  - If `approvals.length <= 1`: unchanged behavior (single approval
    plays as its own card).
- AchievementBanner renderer for the new kind: emoji 🎉, heading
  `t('celebration.choresApproved', { count })`, line `+{stars} ⭐`.
  Display duration unchanged (4 s).
- Locales:
  - `celebration.choresApproved` (en): `"{{count}} chores approved!"`
  - Spanish equivalent in `es.json`.
- Tests in `mobile/tests/celebrationQueue.test.ts`:
  - 2 approvals → 1 `approval_group` item with correct count/stars/at.
  - 3 approvals + 1 achievement → 1 `approval_group` + 1 achievement,
    correctly ordered by `at`.
  - 1 approval (regression) → still emits a single `chore_approved`.

The existing `CELEBRATION_CAP = 5` overflow `summary` continues to
operate on the post-collapse list, so the grouping doesn't interact
adversely.

### 11 — Replace `first_star` with `stargazer`

**Files:**
- `mobile/src/constants/achievements.ts` (key + order)
- `mobile/src/i18n/locales/{en,es}.json`
- `supabase/migrations/2026MMDDHHMMSS_replace_first_star_with_stargazer.sql` (new)
- `supabase/tests/34_check_achievements.sql` (update expectations)
- `supabase/tests/35_approve_chore_achievement_integration.sql` (update)
- `supabase/tests/33_achievements_rls.sql` (update if it references the key)
- `supabase/functions/send_push_drain/index.ts` (rename in any switch)
- `mobile/tests/achievementBanner.test.tsx`, `mobile/tests/events.test.ts`,
  `mobile/tests/celebrationQueue.test.ts`

Constants change:

```ts
// AchievementKey union: replace 'first_star' with 'stargazer'
export type AchievementKey =
  | 'stargazer' | 'stars_100' | 'stars_500'
  | 'streak_7' | 'streak_30'
  | 'first_chore' | 'chores_25'
  | 'first_reward';

// ACHIEVEMENTS entry:
stargazer: { emoji: '⭐', title: 'Stargazer', description: 'Earn 10 stars total' },

// ACHIEVEMENT_KEYS: same order, just rename the first slot.
```

i18n (en):

```json
"achievements": {
  "stargazer": { "title": "Stargazer", "desc": "Earn 10 stars total" },
  ...
}
```

i18n (es):

```json
"achievements": {
  "stargazer": { "title": "Observador", "desc": "Gana 10 estrellas en total" },
  ...
}
```

(Confirm `Observador` reads well to a native Spanish reader — flag if
you want a different word.)

SQL migration: update the candidates array in `check_achievements`:

```sql
case when stars_earned >= 10 then 'stargazer' end,  -- was: >= 1 then 'first_star'
```

Plus a one-shot data update in the same migration to rename existing
rows so older kids' badge pages render consistently:

```sql
update achievements set achievement_key = 'stargazer'
 where achievement_key = 'first_star';
```

A kid who unlocked `first_star` at 1 star but has < 10 stars will end
up with a `stargazer` row in the achievements table at a point before
they actually crossed the 10-star threshold. Acceptable — the badge
represents the journey, not the exact threshold; and the
`check_achievements` function is idempotent (won't insert duplicates
on the next pass). If user prefers to *not* rename old rows (keep
history clean), that decision goes in the implementation plan.

## Risk + rollout

- All UI changes are local to the listed files. No new dependencies.
- The achievement rename is a one-way migration; the back-out plan is
  a follow-up migration that restores `first_star` if the user changes
  their mind. Low risk because (a) M6 already shipped and (b) all
  existing kids are on dev / pre-launch.
- The banner-grouping change is pure frontend; if a regression slips
  through, kids see the old per-card behavior — no data loss.

## Verification

- `tsc --noEmit` clean in `mobile/`.
- `npm run test` clean (mobile/tests + the new celebrationQueue cases).
- pgTAP tests green after migration.
- Manual emulator walkthrough on **both light and dark themes**:
  - Chores form (new + edit) — verification picker reads cleanly,
    selected state matches primary teal.
  - Parent home with no goal — empty-state tile present and tap routes.
  - Parent home with active goal that has a description — description
    visible on the card.
  - Kid home — switch-arrow visible in dark; star/streak hero text
    readable in dark.
  - Kid badges — earned ✓ seal sits on the medallion, no overlap;
    locked cards readable in dark.
  - Approve 2 chores in quick succession from a different parent
    session — kid sees one grouped banner with count + total stars.
  - First-time kid earns 10 stars — Stargazer unlocks.
