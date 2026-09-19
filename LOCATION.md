# Testing location configuration

`location.config.json` is the one non-secret source of truth for the ESP32's
testing location and its live dashboard marker. It intentionally uses manual
Google Maps coordinates: this project does not use GPS or automatic location
detection.

When moving the ESP32:

1. Open `location.config.json`.
2. Replace only `id`, `label`, `latitude`, and `longitude` with the new
   location values copied from Google Maps.
3. Build/upload the firmware and deploy/rebuild the web app. The normal
   PlatformIO and web scripts generate their respective language-specific
   configuration automatically.

Keep IDs lowercase with numbers and underscores (for example,
`library_lobby`). Existing readings are retained: changing the ID makes Live
view query new readings under that ID, while old rows remain in Supabase.

`location.config.json` contains no credentials. Keep Wi-Fi and Supabase anon
credentials in ignored `firmware/include/config.h` and `web/.env.local`.

Run `supabase/schema.sql` once if the project still has the original
single-location RLS policy. Its updated policy permits valid configured IDs
with the anon key; subsequent moves need no database-policy edit.
