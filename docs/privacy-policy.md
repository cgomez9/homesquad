# HomeSquad Privacy Policy

**Last updated:** 2026-05-25

HomeSquad is a family-management app built and operated by Carlos Gomez.
This policy describes what data the app handles, why, and how you can
remove it.

> **Important:** The URL of this page is referenced from the Google Play
> Store listing. Do not rename the file or move the page without updating
> the Play Console "Privacy policy" field.

## What we collect

We collect only what HomeSquad needs to work:

- **Account identifier (email + display name).** When you sign in with
  Google, we receive your email address and the name on your Google
  profile. When you sign up with email + password, we store your email
  and a hashed password. We never receive or store your Google password.
- **Family data you enter.** Family name, chore titles, reward names,
  schedules, kid profile names, kid avatars, kid PINs (stored hashed
  starting in M3). You enter this yourself; we do not infer it from
  other sources.
- **Push notification token.** A device-specific identifier we use to
  send chore reminders and approval notifications to your phone. Stored
  in your account row; rotated whenever your device reinstalls the app.
- **Voice journal recordings (optional).** When a kid uses the voice
  journal feature, the audio is recorded on the device. **Recordings
  stay on the device and are not uploaded to any server.**

We do **not** collect: precise location, contacts, calendar, photos
outside what you explicitly attach to a kid avatar, browsing history, or
any analytics events tied to your identity.

## Where it lives

Account and family data is stored in Supabase (Postgres), encrypted at
rest by the cloud provider, encrypted in transit by HTTPS. Row-Level
Security policies prevent any user from reading another family's data.

## Third parties

- **Google Identity Services** — used only when you choose to sign in
  with Google. Google's policy applies to the data Google itself handles
  on your behalf.
- **Supabase** — our database and authentication provider.
- **Expo Push Notifications** — relays push notifications to your device.

We do not share data with advertisers, analytics services, or data
brokers.

## Children

HomeSquad is **not** primarily directed at children under 13. Parents
create kid profiles inside their own account; kids do not sign in
directly. Kid profile data (name, avatar, achievement progress) is
entered by the parent and controlled by the parent. Parents can delete
any kid profile at any time from the app.

## Deletion

To delete your account and all associated family + kid data, email
`sabiondo3101@gmail.com` from the address tied to your account. We will
delete the data within 30 days and reply to confirm.

You can also remove individual kid profiles from the app at any time.

## Contact

Questions: `sabiondo3101@gmail.com`.
