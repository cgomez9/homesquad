# Chore claim + started/finished — manual acceptance gate

**Status:** TODO — run before merging to main.

## Pre-flight

- [ ] All backend migrations applied: `supabase db reset` clean; full test suite passes.
- [ ] Supabase cloud DB has been migrated (production `submitted` rows now show as `finished`).
- [ ] EAS preview APK built with the latest branch.

## Two-device walkthrough (16 items)

| # | Step | Pass? |
|---|------|---|
| 1 | Boot two emulators (A: parent, B: kid). Sign in on A. Pair B to a kid via the m10 flow. | [ ] |
| 2 | On A, create three chores (auto / photo / approval), assignee = unassigned, due today. | [ ] |
| 3 | B sees the three chores in the "Available" section. A sees them in "Available" on the My Chores tab. | [ ] |
| 4 | B taps **Claim** on the auto chore. Within 1s, A sees it move to "Others'" with B's avatar. | [ ] |
| 5 | B taps **Release** on the same chore. Within 1s, A sees it back in "Available". | [ ] |
| 6 | Race: at the same moment (within 200ms), A taps Claim and B taps Claim on the approval chore. Exactly one wins. The loser sees the error toast and the card refreshes to show the winner's avatar. | [ ] |
| 7 | B taps **Start** on the auto chore (B had won it). Card now shows "Finish". | [ ] |
| 8 | B taps **Finish**. Card disappears from active list. B's star count increased by the chore's star_value. | [ ] |
| 9 | B taps **Claim** then **Start** on the photo chore. Card shows "Finish". | [ ] |
| 10 | B taps **Finish**. Photo capture screen opens. B captures + submits. Card now shows "awaiting review". A's Approvals tab gains the submission. | [ ] |
| 11 | A approves it. B's star count increased again. | [ ] |
| 12 | A claims a remaining unassigned chore on their My Chores tab. Starts. Finishes. Card disappears. The active family goal's progress bar advanced by the chore's star_value (no star_ledger row attributable to a kid for the parent action). | [ ] |
| 13 | A rejects a kid-finished chore. B's card shows "rejected" with a "Try again" button. B taps Try again → card goes to "started". | [ ] |
| 14 | DB check: `select status, count(*) from chore_instances group by status` shows only the new enum values (`pending`/`started`/`finished`/`approved`/`rejected`). No `submitted` rows remain. | [ ] |
| 15 | DB check: parent-finished chores produce star_ledger rows attributed to the parent's profile_id (which never appear in the kid leaderboard, since `get_leaderboard` filters `type='kid'`). Confirm via `select profile_id, sum(delta) from star_ledger group by profile_id` cross-referenced against profiles.type. | [ ] |
| 16 | Realtime check: with both apps open, A and B watch each other's actions appear without manual refresh. | [ ] |

## If all pass

- [ ] Tag: `git tag m11-chore-claim-states`
- [ ] Merge branch.

## If any fail

Document the failure inline and return to the relevant task.
