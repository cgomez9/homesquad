begin;
select plan(6);

insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.com');
insert into public.families(id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Family A');
insert into public.profiles(id, family_id, type, display_name, avatar_id, user_id) values
  ('a1111111-1111-1111-1111-111111111111',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'parent', 'Alice', 1,
   '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kid',    'Sara',  2, null);

insert into public.chores(id, family_id, title, star_value, verification_mode, recurrence, assignee_profile_id, created_by)
values
  ('c1111111-1111-1111-1111-111111111111',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Brush teeth', 10,
   'auto', '{"type":"daily","times":["08:00"]}'::jsonb,
   'a2222222-2222-2222-2222-222222222222',
   'a1111111-1111-1111-1111-111111111111');

insert into public.chore_instances(id, chore_id, family_id, assignee_profile_id, due_at, status)
values
  ('11111111-aaaa-1111-1111-111111111111',
   'c1111111-1111-1111-1111-111111111111',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'a2222222-2222-2222-2222-222222222222',
   '2026-05-22T08:00:00Z',
   'pending');

-- Two pending reminders that should be canceled by the triggers.
insert into public.push_outbox(family_id, recipient_id, event_type, payload, scheduled_for)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'a1111111-1111-1111-1111-111111111111',
   'chore_reminder',
   jsonb_build_object(
     'chore_id', 'c1111111-1111-1111-1111-111111111111',
     'kid_profile_id', 'a2222222-2222-2222-2222-222222222222',
     'due_at', '2026-05-22T08:00:00Z'
   ),
   '2026-05-22T07:50:00Z'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'a1111111-1111-1111-1111-111111111111',
   'chore_reminder',
   jsonb_build_object(
     'chore_id', 'c1111111-1111-1111-1111-111111111111',
     'kid_profile_id', 'a2222222-2222-2222-2222-222222222222',
     'due_at', '2026-05-23T08:00:00Z'
   ),
   '2026-05-23T07:50:00Z');

-- 1. Before any change, both pending reminders are present.
select is(
  (select count(*)::int from public.push_outbox
    where event_type = 'chore_reminder' and status = 'pending'),
  2, 'baseline: 2 pending reminders'
);

-- 2. Update chore_instance status pending → finished. The reminder
-- matching (chore_id, due_at) flips to canceled.
update public.chore_instances
   set status = 'finished', completed_by = 'a2222222-2222-2222-2222-222222222222', completed_at = now()
 where id = '11111111-aaaa-1111-1111-111111111111';

select is(
  (select status from public.push_outbox
    where event_type = 'chore_reminder'
      and (payload->>'due_at')::timestamptz = '2026-05-22T08:00:00Z'),
  'canceled', 'instance pending→finished cancels its matching reminder'
);

-- 3. The reminder for the OTHER due_at is still pending.
select is(
  (select status from public.push_outbox
    where event_type = 'chore_reminder'
      and (payload->>'due_at')::timestamptz = '2026-05-23T08:00:00Z'),
  'pending', 'reminders for other due_at are unaffected'
);

-- 4. Subsequent status changes (finished → approved) do NOT re-fire the cancel.
-- (idempotency: we only act on pending → not-pending; canceled rows stay canceled.)
update public.chore_instances
   set status = 'approved', approved_by = 'a1111111-1111-1111-1111-111111111111', approved_at = now()
 where id = '11111111-aaaa-1111-1111-111111111111';
select is(
  (select status from public.push_outbox
    where event_type = 'chore_reminder'
      and (payload->>'due_at')::timestamptz = '2026-05-22T08:00:00Z'),
  'canceled', 'subsequent status changes leave canceled rows alone'
);

-- 5. Archive the chore. The remaining pending reminder flips to canceled.
update public.chores set active = false
 where id = 'c1111111-1111-1111-1111-111111111111';
select is(
  (select status from public.push_outbox
    where event_type = 'chore_reminder'
      and (payload->>'due_at')::timestamptz = '2026-05-23T08:00:00Z'),
  'canceled', 'archive cancels remaining pending reminders'
);

-- 6. Re-activating the chore does NOT resurrect canceled reminders.
update public.chores set active = true
 where id = 'c1111111-1111-1111-1111-111111111111';
select is(
  (select count(*)::int from public.push_outbox
    where event_type = 'chore_reminder' and status = 'pending'),
  0, 're-activating chore does not resurrect canceled reminders'
);

select * from finish();
rollback;
