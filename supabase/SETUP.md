# Supabase Setup

## 1. Create Supabase project
1. Go to Supabase and create a new project.
2. In SQL Editor, run `supabase/schema.sql`.

## 2. Enable email login
1. Open Authentication -> Providers.
2. Enable Email provider (Email + Password).
3. Disable email confirmation in Auth settings so users can log in immediately after signup.

## 3. Configure redirect URL
1. In Authentication -> URL Configuration, add your app URL.
2. If you later add mobile testing, add that HTTPS tunnel URL too.

## 4. Configure app
1. Open app and press `Login`.
2. Set Supabase URL and anon key in `app.js` (`EMBEDDED_CLOUD_CONFIG`) and deploy.
3. Keep `EMBEDDED_HOUSEHOLD_SEED` in `app.js` identical for all users of this family app so everyone joins the same shared household.
4. Enter email and password in the app.
5. Create users manually in Supabase Auth (dashboard), set password there, then use `Logg inn` in app.
6. Do not use Supabase invite links for normal onboarding in this app.

## 5. Family sharing model
- Data in `shared_lists`, `shared_list_items`, `shared_catalog`, `shared_stores` is shared across household members.
- Data in `user_store_state` is per-user, so each person can shop in different stores at the same time.

## Notes
- Current sync uses periodic pull and debounced push.
- First logged-in device seeds cloud if cloud is empty.
- Store deletions are local currently; sync is optimized for shared list/item flows first.
