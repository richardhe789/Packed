# Packed

Privacy-preserving campus busyness: an ESP32 turns ambient WiFi noise into a 0–100 density score, and a Next.js map shows Quiet / Moderate / Busy so you can skip the packed line.

## Details

- **What problem does this project solve?** At Virginia Tech (and most campuses), dining halls and study spots are a coin flip — you walk over and the line is empty or a 20-minute wait, with no honest public signal for “how packed is it right now?” Cameras feel creepy and expensive; campus WiFi login data isn’t something students can see. Packed is a cheap relative-busyness kit: one ESP32 listens to ambient RF (average RSSI + packet activity only — no MAC addresses), posts a density reading, and a campus map answers the glanceable question: should I go now?
- **Did you use any interesting libraries or services?** ESP32 firmware (PlatformIO, promiscuous WiFi sniff + HTTPS uplink over a phone hotspot), Supabase (`readings` table + `ingest-reading` Edge Function with a device key), Next.js 15 on Vercel, MapLibre / `react-map-gl` for the campus map, Framer Motion and Lucide for the UI.
- **What extension type(s) did you build?** None — this is not a browser extension. The submission is ESP32 firmware plus a Next.js web dashboard (Demo mode with seeded densities; Live mode polls one real sensor).
- **If given longer, what would the next improvement you would make?** Put a second node at a real chokepoint (e.g. Dietrick), calibrate thresholds against lunch traffic, and make Live recommendations compare two real sensors instead of one honest pin plus placeholders.

## Set Up Instructions

**Accounts:** a [Supabase](https://supabase.com) project (Postgres + Edge Functions). Optional: [Vercel](https://vercel.com) to host `web/`. Firmware talks to a phone hotspot, not campus WiFi.

### Web (no hardware)

1. Copy `web/.env.example` → `web/.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. In the Supabase SQL editor, run `supabase/schema.sql`. Deploy `supabase/functions/ingest-reading/` and set the `DEVICE_INGEST_KEY` secret (same value the ESP32 will use).
3. From `web/`: `pnpm install` then `pnpm dev`. Open [http://localhost:3000](http://localhost:3000). Demo is the default (`?demo=1` / `?live=1` or the in-app toggle).

**Vercel:** import the repo, set Root Directory to `web`, add the two `NEXT_PUBLIC_SUPABASE_*` env vars.

### Firmware (ESP32)

1. Copy `firmware/include/config.h.example` → `firmware/include/config.h` (gitignored). Fill hotspot `WIFI_SSID` / `WIFI_PASSWORD`, `SUPABASE_URL` / anon `SUPABASE_API_KEY`, and `DEVICE_INGEST_KEY`.
2. Set the one testing location (id, label, lat/lng) in [`location.config.json`](location.config.json). See [`LOCATION.md`](LOCATION.md).
3. Open `firmware/` in PlatformIO. Default env is `esp32dev_short` (~30s windows). Serial at **115200**.

Status bands: 0–33 Quiet, 34–66 Moderate, 67–100 Busy. Live polls the ID in `location.config.json` about every 30s; other map pins are placeholders.

## Screenshots

<p align="center">
  <img src="./art/packed-logo.png" width="160" height="160" alt="Packed">
</p>

Add a dashboard screenshot or short demo video here for judging (map with Quiet / Moderate / Busy, Demo vs Live toggle, and Serial showing a window POST).

## Collaborators

- [richardhe789](https://github.com/richardhe789)
- [jmyz23](https://github.com/jmyz23)
