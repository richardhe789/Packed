# Campus Crowd (ProjectSolver)

VTHacks project: estimate how busy a dining hall is using a **single ESP32** as a passive ambient WiFi sensor. No MAC tracking, no headcount — only aggregate RSSI + packet activity → a 0–100 density score → Supabase → a glanceable web dashboard (**Quiet / Moderate / Busy**).

## Architecture

```
Ambient WiFi frames
  → ESP32 (promiscuous sniff, 5-min windows, on-device density math)
  → Phone hotspot (STA uplink)
  → Supabase `readings` table
  → Static dashboard (polls every 30s)
```

## Repo layout

| Path | Purpose |
|------|---------|
| `firmware/` | PlatformIO ESP32 firmware |
| `dashboard/` | Static HTML/JS status page |
| `firmware/include/config.h.example` | Template for WiFi + Supabase secrets |
| `dashboard/config.js.example` | Template for dashboard Supabase keys |

## Phase checklist

1. **Hotspot** — ESP32 joins phone hotspot; Serial shows `connected, IP: ...`
2. **Supabase** — `readings` table exists; manual insert works
3. **Sniff** — promiscuous RX; avg RSSI + packet count; density accumulator
4. **Push** — HTTPS POST every window; failures logged, loop continues
5. **Dashboard** — color status from latest density
6. **Venue** — retune thresholds with real foot traffic

## Firmware setup (PlatformIO)

1. Install [PlatformIO](https://platformio.org/) (VS Code / Cursor extension is fine).
2. Copy secrets:

   ```text
   firmware/include/config.h.example  →  firmware/include/config.h
   ```

   Fill in:

   - `WIFI_SSID` / `WIFI_PASSWORD` — **phone hotspot** (not campus WiFi)
   - `SUPABASE_URL` / `SUPABASE_API_KEY` — project URL + **anon** key
   - Optional: `LOCATION_ID` (default `dining_hall_main`)

3. Open `firmware/` in PlatformIO, build & upload to the ESP32.
4. Open Serial Monitor at **115200** baud.

### What you should see

```text
[wifi] connected, IP: 192.168.x.x  channel: N
[scan] Nearby APs ...
[sniff] promiscuous ON on channel N
[ready] window=300000 ms ...
---------- window ----------
  avg_rssi=...  packet_count=...
  density=...
[http] POST ok ...
```

### Tunables (top of `firmware/src/main.cpp`)

| Constant | Default | Meaning |
|----------|---------|---------|
| `RSSI_THRESHOLD` | 10 | % RSSI drop required |
| `PACKET_THRESHOLD` | 15 | % packet-count rise required |
| `STEP_UP` / `STEP_DOWN` | 10 / 5 | Density accumulator steps |
| `WINDOW_MS` | 5 min | Averaging window |

For faster bench testing, add build flag `-DSHORT_WINDOWS` in `platformio.ini` (30s windows).

### Channel / radio notes

- Default sniff channel = hotspot AP channel (`SNIFF_CHANNEL 0`).
- At the venue, use a WiFi analyzer (or the boot `[scan]` log) to see campus AP channels.
- To sniff a different channel, set `#define SNIFF_CHANNEL N` — firmware **pauses sniff → reconnects STA → POSTs → resumes sniff** so one radio can still upload.
- **Top risk:** promiscuous + STA + HTTPS on one radio. If POST fails while sniffing, check Serial; the pause/resume path is the intended fix.

### Privacy

Firmware never reads or stores MAC addresses — only RSSI sums and packet counts.

## Supabase

Project: **ProjectSolver** (`myjfbuathehfghagbnot`)

Table `public.readings`:

| Column | Type |
|--------|------|
| `id` | bigint identity PK |
| `created_at` | timestamptz default now() |
| `avg_rssi` | float |
| `packet_count` | int |
| `density` | int 0–100 |
| `location` | text |

RLS: anon can `SELECT` and `INSERT` (hackathon demo).

Manual smoke test (SQL editor or curl):

```bash
curl -X POST "https://myjfbuathehfghagbnot.supabase.co/rest/v1/readings" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{\"avg_rssi\":-60,\"packet_count\":100,\"density\":50,\"location\":\"dining_hall_main\"}"
```

## Dashboard

1. Copy `dashboard/config.js.example` → `dashboard/config.js` and set URL + anon key.
2. Open `dashboard/index.html` in a browser (double-click or any static server).
3. Status mapping: **0–33 Quiet**, **34–66 Moderate**, **67–100 Busy**.
4. Layout lists multiple locations; only `dining_hall_main` is live for the demo.

Hosting (optional): GitHub Pages / Netlify / Vercel — not required for the demo.

## Venue demo script

1. Phone hotspot on; ESP32 powered; Serial shows connect + sniff.
2. Wait one window (or use `SHORT_WINDOWS`); confirm row in Supabase Table Editor.
3. Open dashboard; status should match density.
4. Walk the chokepoint repeatedly; watch Serial `%Δ` and density; retune thresholds.
5. Pitch: “Should you wait in this line, or go elsewhere?” — relative busyness, privacy-preserving, one cheap sensor.

## Out of scope

MAC tracking, entry/exit counting, multi-sensor logic, historical “come back in 15 min” prediction, campus WiFi enterprise auth.

## Minimum viable demo

ESP32 pushing real numbers to Supabase + dashboard updating — even with rough thresholds — beats a perfect design that never ships.
