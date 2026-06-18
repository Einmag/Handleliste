# Supabase Setup

## 1. Create Supabase project
1. Go to Supabase and create a new project.
2. In SQL Editor, run `supabase/schema.sql`.

## 2. Enable email login
1. Open Authentication -> Providers.
2. Enable Email provider (Magic Link).

## 3. Configure redirect URL
1. In Authentication -> URL Configuration, add your app URL.
2. For local mobile testing, add your HTTPS tunnel URL.

## 4. Configure app
1. Open app and press `Login`.
2. Enter Supabase URL and anon key once.
3. Enter your email to receive login link.

## 5. Family sharing model
- Data in `shared_lists`, `shared_list_items`, `shared_catalog`, `shared_stores` is shared across household members.
- Data in `user_store_state` is per-user, so each person can shop in different stores at the same time.

## Notes
- Current sync uses periodic pull and debounced push.
- First logged-in device seeds cloud if cloud is empty.
- Store deletions are local currently; sync is optimized for shared list/item flows first.
