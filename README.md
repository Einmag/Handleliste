# Handleliste

Handleliste is an iPhone-first Progressive Web App for shopping lists with store-aware category ordering.

## Implemented now

- Add items manually at home.
- Autocomplete from saved item history.
- Duplicate prevention inside the active list.
- Editable grocery categories with practical defaults.
- Store search by area with quick add from result list.
- Per-store category walking order (Up/Down ordering controls).
- Active-store selection from top dropdown.
- Geolocation-based nearest-store detection using distance checks.
- Automatic list completion when all visible items are checked.
- One-tap reuse of last completed list.
- History keeps items until you explicitly delete them.
- PWA manifest and service worker for offline caching.
- Supabase email/password login flow.
- Household cloud sync foundation with shared lists/items/stores/catalog.
- Per-user store context in cloud so family members can shop in different stores.

## Tech stack

- Vanilla HTML, CSS, and JavaScript.
- Local persistence via browser localStorage.
- Supabase Auth + Postgres for cloud sync.

## Run locally

Because service workers require HTTP/HTTPS, run with a local web server instead of opening index.html directly.

Example with Node (if installed):

```bash
npx serve .
```

Then open the printed local URL on your iPhone and add to Home Screen from Safari.

## Current data model

All state is stored in localStorage key `handleliste.state.v1` and includes:

- Categories
- Stores and per-store category order
- Catalog/history items
- Active list and completed lists

Cloud sync schema and policies are in:

- `supabase/schema.sql`
- `supabase/SETUP.md`

## Current cloud status

- Login is implemented (email/password).
- Household cloud sync is implemented with initial pull/push sync strategy.
- Shared data: lists, list items, stores, catalog.
- Independent per user: selected store / detected store state.

## Next improvements

- Simple in-app onboarding docs and clearer auth messages.
- More advanced conflict handling and merge UX.
- Better deletion sync semantics for all entities.
