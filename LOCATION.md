# Testing location configuration

`location.config.json` is the one non-secret source of truth for the ESP32
location id and the default map pin (place name + Google Maps latitude /
longitude). This project does not use GPS.

The dashboard shows **one pin**. You can retarget it two ways:

1. Edit `location.config.json` (`id`, `label`, `latitude`, `longitude`), then
   rebuild the web app and reflash firmware so `LOCATION_ID` matches.
2. Use **Pin location** in the side panel (name, latitude, longitude). That
   override is stored in the browser only — firmware still POSTs under the
   `id` from `location.config.json`.

Keep IDs lowercase with numbers and underscores (for example,
`library_lobby`). Existing readings are retained: changing the ID makes Live
view query new readings under that ID, while old rows remain in Supabase.

`location.config.json` contains no credentials. Keep Wi-Fi and Supabase anon
credentials in ignored `firmware/include/config.h` and `web/.env.local`.

Run `supabase/schema.sql` once if the project still has the original
single-location RLS policy. Its updated policy permits valid configured IDs
with the anon key; subsequent moves need no database-policy edit.
