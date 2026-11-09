# Supabase setup

## Services

- Supabase Auth handles admin email/password sign-in.
- `admin_profiles` assigns each Auth user the `super` or `teacher` role.
- `schedule_state` stores the shared timetable, week number, and announcement.
- Row Level Security and database functions protect writes; Supabase Realtime distributes updates.
- GitHub Pages continues to host the static website.

## Database setup

In the Supabase SQL Editor, run `supabase-auth.sql` and `supabase-schedule.sql`. The auth script creates the profile table and assigns the configured admin roles. The schedule script creates the shared data table, write functions, and Realtime publication.

The current schedule and announcement have been imported. Do not initialize a new schedule unless the shared `schedule_state` row has been intentionally removed.

## Admin accounts

Create accounts in **Authentication > Users**. To add or change a role, use the account UUID from that page and insert or update its row in `admin_profiles`. Teachers must have the exact teacher name used in the timetable. The profile table allows users to read only their own profile; role changes are not available through the website.

## Local testing

Run the included PowerShell server script from this folder, then open the local admin page. Use the same Supabase project configuration in `supabase.js` as the deployed GitHub Pages site.

## Mobile push notifications

The website is hosted under `/schedule/`; keep the service worker at `/schedule/service-worker.js` so it can control the timetable page. Push requires HTTPS in production. Localhost is allowed for development.

1. Run `supabase-push.sql` in the Supabase SQL Editor. The subscription table has RLS enabled and grants no direct browser access.
2. Generate a VAPID key pair on a trusted local machine with `npx web-push generate-vapid-keys`. Do not commit the private key or send it in chat.
3. Put the generated public key in `push-notifications.js`, replacing `REPLACE_WITH_VAPID_PUBLIC_KEY`.
4. In a terminal, link the Supabase CLI to this project, then set the Edge Function secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (a `mailto:` contact). Keep the private key only in Supabase secrets.
5. Deploy `register-push-subscription` with JWT verification disabled because viewers opt in anonymously. Deploy `send-push-notification` with JWT verification enabled; it checks the signed-in user against `admin_profiles`.
6. Publish the changed website files to GitHub Pages. On a phone, open `https://inshal-index.github.io/schedule/`, opt in, and allow notifications. On iPhone/iPad, first add the site to the Home Screen and open it there.

The browser notification is sent after an admin schedule edit and announcement have both saved successfully. The public page only stores its push endpoint through the registration Edge Function; it cannot query the private subscription table directly.
