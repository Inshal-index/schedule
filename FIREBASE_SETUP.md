# Firebase Authentication and schedule setup

## Enable email/password login

The admin page uses Firebase Authentication email/password accounts. Firestore being configured does not automatically create Authentication users.

1. In the [Firebase Console](https://console.firebase.google.com/), select project `schedule-23a60`.
2. Open **Authentication > Sign-in method** and enable **Email/Password**.
3. Open **Authentication > Users** and add the user's email and password if the account does not already exist. Reset the password there if needed.
4. Copy the account's UID.
5. In **Firestore Database > Data**, create a collection named `admins`. Create a document whose document ID is the Firebase Auth UID:
   - Super admin: string field `role` = `super`.
   - Teacher: string field `role` = `teacher`, and string field `teacher` = the exact teacher name shown in the timetable.
6. Publish the contents of `firestore.rules` using **Cloud Firestore > Rules**, or deploy from this folder:

   ```powershell
   firebase login
   firebase deploy --only hosting,firestore:rules
   ```

Without an `admins/{uid}` profile, the user will authenticate but will not be allowed into the editor. The owner must create admin profiles manually; client-side code cannot create or change them.

## Shared schedule

The schedule and announcement are stored in Firestore documents `schedules/current` and `announcements/current`. The schedule is a JSON string because Firestore does not support nested arrays. Open the deployed Firebase Hosting HTTPS URL on each device; do not use a `file://` URL. For local testing on Windows, run `.\start-local-server.ps1` in PowerShell from this folder and keep the window open.

Schedule and announcement reads are public. Firestore writes require a signed-in account with an `admins/{uid}` profile. Teacher-only editing is enforced by the editor UI; the rules authorize any provisioned admin profile to write, so they do not enforce teacher-specific permissions against a technically capable signed-in user.
