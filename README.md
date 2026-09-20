# Packed — Know before you walk.

<p align="center">
  <img src="./art/packed-logo.png" width="200" height="200" alt="Packed">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square" alt="MIT License">
  <img src="https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/ESP32-PlatformIO-e11d48?style=flat-square" alt="ESP32">
  <img src="https://img.shields.io/badge/Supabase-readings-3ecf8e?style=flat-square&logo=supabase&logoColor=white" alt="Supabase">
</p>

Packed is a privacy-preserving campus busyness sensor. One cheap ESP32 listens to ambient WiFi noise (aggregates only — no MAC addresses), turns that into a 0–100 density score, and a Next.js map shows Quiet / Moderate / Busy so you can skip the packed line.

## Details

- **What problem does this project solve?** At Virginia Tech (and most campuses), dining halls and study spots are a coin flip — you walk over and the line is empty or a 20-minute wait, with no honest public signal for “how packed is it right now?” Cameras feel creepy and expensive; campus WiFi login data isn’t something students can see. Packed is a cheap relative-busyness kit: one ESP32 listens to ambient RF (average RSSI + packet activity only — no MAC addresses), posts a density reading, and a campus map answers the glanceable question: should I go now?
- **Did you use any interesting libraries or services?** ESP32 firmware (PlatformIO, promiscuous WiFi sniff + HTTPS uplink over a phone hotspot), Supabase (`readings` table + `ingest-reading` Edge Function with a device key), Next.js 15 on Vercel, MapLibre / `react-map-gl` for the campus map, Framer Motion and Lucide for the UI.
- **What extension type(s) did you build?** None — this is not a browser extension. The submission is ESP32 firmware plus a Next.js web dashboard. Live mode polls the real sensor.
- **If given longer, what would the next improvement you would make?** Put a second node at a real chokepoint (e.g. Dietrick), calibrate thresholds against lunch traffic, and make Live recommendations compare two real sensors instead of one honest pin plus placeholders.

## Set Up Instructions

**Accounts:** a [Supabase](https://supabase.com) project (Postgres + Edge Functions). Optional: [Vercel](https://vercel.com) to host `web/`. Firmware talks to a phone hotspot, not campus WiFi.

Put secrets only in ignored files:

- `firmware/include/config.h` — hotspot SSID/password, `SUPABASE_URL`, anon `SUPABASE_API_KEY`, `DEVICE_INGEST_KEY`
- `web/.env.local` — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Set the testing location (`id`, `label`, `latitude`, `longitude`) in [`location.config.json`](location.config.json). Full location/calibration notes: [`LOCATION.md`](LOCATION.md).

### Web

1. Copy `web/.env.example` → `web/.env.local` and fill the two Supabase values.
2. In the Supabase SQL editor, run `supabase/schema.sql`. Deploy `supabase/functions/ingest-reading/` and set the `DEVICE_INGEST_KEY` secret (same value as the ESP32).
3. From `web/`: `pnpm install` then `pnpm dev`. Open [http://localhost:3000/?live=1](http://localhost:3000/?live=1).

**Vercel:** import the repo, set Root Directory to `web`, add the two `NEXT_PUBLIC_SUPABASE_*` env vars.

### Firmware (ESP32)

Copy `firmware/include/config.h.example` → `firmware/include/config.h`, then flash short windows for judging:

```powershell
cd firmware
pio run -e esp32dev_short --target upload
pio device monitor -b 115200
```

`esp32dev_short` uses 30-second windows. Normal `esp32dev` uses five-minute windows.

### Serial commands (115200 baud)

Commands are case-insensitive and do not pause sniffing or uploads.

| Command | Action |
| --- | --- |
| `C` | Start quiet-room baseline calibration. |
| `S30` | Save current activity as subjective density 30. Use `S0`–`S100`. |
| `A` | Clear only the manual density anchor. |
| `B` | Print baseline, anchor, packet activity, density, and location. |
| `X` | Clear the saved baseline and anchor. |

### Demo flow

1. Put the ESP32 in a quiet room.
2. Send `C`.
3. Wait for three windows: about **90 seconds** in short mode.
4. Wait for `[calibration] complete and saved to NVS`.
5. Move the ESP32 to the testing area. The baseline survives power loss.
6. After a smoothed reading, optionally send `S30`, `S50`, or `S80`.
7. Open the dashboard at `http://localhost:3000/?live=1`.

The baseline is density 0. A manual `S<number>` anchor maps its packet activity to that score; density moves gradually toward its target and stays within 0–100. Changing the location ID requires a new baseline and anchor.

Status bands: 0–33 Quiet, 34–66 Moderate, 67–100 Busy.

## Collaborators

- [richardhe789](https://github.com/richardhe789)
- [jmyz23](https://github.com/jmyz23)
