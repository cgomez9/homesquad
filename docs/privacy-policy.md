# HomeSquad Privacy Policy

**Last updated:** 2026-06-03

HomeSquad is a family-management app built and operated by Carlos Gomez.
This policy describes what data the app handles, why, and how you can
remove it.

> **Important:** The URL of this page is referenced from both the Google
> Play Store and the Apple App Store listings. Do not rename the file or
> move the page without updating the "Privacy policy" field in both Play
> Console and App Store Connect.

## What we collect

We collect only what HomeSquad needs to work:

- **Account identifier (email + display name).** When you sign in with
  Google, we receive your email address and the name on your Google
  profile. When you sign up with email + password, we store your email
  and a hashed password. We never receive or store your Google password.
  When you sign in with Apple, you can choose **Hide My Email** — Apple
  gives us a relay address (`*@privaterelay.appleid.com`) instead of
  your real email, and messages sent to that relay are forwarded by
  Apple per Apple's policy.
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
- **Apple Sign In** — used only when you choose to sign in with Apple.
  Apple's policy applies to the data Apple itself handles on your
  behalf, including the Hide My Email relay if you use it.
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
