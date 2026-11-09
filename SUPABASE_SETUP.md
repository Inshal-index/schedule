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
