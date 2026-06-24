# Supabase Setup

## 1. Create Supabase project
1. Go to Supabase and create a new project.
2. In SQL Editor, run `supabase/schema.sql`.

## 2. Enable email login
1. Open Authentication -> Providers.
2. Enable Email provider (Email + Password).
3. If you want users to log in immediately after signup, disable email confirmation in Auth settings. If confirmation stays enabled, users must verify the email before password login will work.

## 3. Configure redirect URL
1. In Authentication -> URL Configuration, add your app URL.
2. If you later add mobile testing, add that HTTPS tunnel URL too.
3. If invite/reset links open on iPhone, the URL must be reachable from the phone. A local LAN URL like `http://192.168.x.x:3000` only works when phone and server are on the same network.

## 4. Configure app
1. Open app and press `Login`.
2. Set Supabase URL and anon key in `app.js` (`EMBEDDED_CLOUD_CONFIG`) and deploy.
3. Enter email and password in the app.
4. Use `Opprett bruker` once per person, then `Logg inn`.
5. For invited users, open the invite/recovery link in the app URL and set a password in the modal. After that, normal email/password login works.

## 5. Family sharing model
- Data in `shared_lists`, `shared_list_items`, `shared_catalog`, `shared_stores` is shared across household members.
- Data in `user_store_state` is per-user, so each person can shop in different stores at the same time.

## Notes
- Current sync uses periodic pull and debounced push.
- First logged-in device seeds cloud if cloud is empty.
- Store deletions are local currently; sync is optimized for shared list/item flows first.
