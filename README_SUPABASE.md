# Supabase setup for Daymark

This project includes starter SQL migrations in `supabase/migrations/` for the Daymark data model.

## Apply migrations in Supabase SQL Editor

Run these files in order:

1. `001_profiles.sql`
2. `002_user_preferences.sql`
3. `003_tasks.sql`

## Authentication setup

In the Supabase dashboard, enable:

- Google OAuth
- Apple OAuth
- Email magic link
- Anonymous guest mode (optional for demo flow)

Add redirect URLs such as:

- `http://localhost:8443`
- `https://<your-domain>`

## Notes

- The app currently uses the public anon key from `.env`
- Service-role keys should stay server-side only and not be exposed in the frontend
- The browser app syncs profile information via the authenticated user session
