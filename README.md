# Campus Crowd (ProjectSolver)

VTHacks project: estimate how busy a dining hall is using a **single ESP32** as a passive ambient WiFi sensor. No MAC tracking, no headcount — only aggregate RSSI + packet activity → a 0–100 density score → Supabase → a **Next.js** web dashboard (**Quiet / Moderate / Busy**), deployable on Vercel.

## Architecture

```
Ambient WiFi frames
  → ESP32 (promiscuous sniff, 5-min windows, on-device density math)
  → Phone hotspot (STA uplink)
  → Supabase `readings` table
  → Next.js app in web/ (Demo mode locally, Live polls every 30s)
```

## Repo layout

| Path | Purpose |
|------|---------|
| `firmware/` | PlatformIO ESP32 firmware |
| `web/` | Next.js App Router UI (Vercel root) |
| `firmware/include/config.h.example` | Template for WiFi + Supabase secrets |
| `web/.env.example` | Template for Next.js Supabase env vars |

## Phase checklist

1. **Hotspot** — ESP32 joins phone hotspot; Serial shows `connected, IP: ...`
2. **Supabase** — `readings` table exists; manual insert works
3. **Sniff** — promiscuous RX; avg RSSI + packet count; density accumulator
4. **Push** — HTTPS POST every window; failures logged, loop continues
5. **Dashboard** — Next.js color status from latest density
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

For faster bench testing, use the `esp32dev_short` PlatformIO env (30s windows).

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

## Web UI (Next.js)

### Local run

```bash
cd web
cp .env.example .env.local   # then fill Supabase URL + anon key
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) (Demo by default). Use `?demo=1` / `?live=1` or the **Demo** / **Live** toggle.

- **Demo:** seeded crowd levels + sliders to scrub density and watch the recommendation update (no ESP32 needed).
- **Live:** polls Supabase for `dining_hall_main` every 30s.
- Status: **0–33 Quiet**, **34–66 Moderate**, **67–100 Busy**.

### Switching from npm

This app is standardized on **pnpm**. If you previously ran `npm install` in `web/`:

1. Stop any running Next.js process (`npm run dev` / terminal using that folder).
2. From `web/`, remove the old install leftovers:

   ```bash
   # PowerShell
   Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
   Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
   ```

   ```bash
   # bash / macOS / Linux
   rm -rf node_modules package-lock.json
   ```

3. Install and run with pnpm:

   ```bash
   pnpm install
   pnpm dev
   ```

If Windows says a file is locked (e.g. `next-swc*.node`), close Cursor terminals / stop the old server and delete `node_modules` again, then `pnpm install`.

### Deploy on Vercel

1. Push this repo to GitHub.
2. [vercel.com](https://vercel.com) → **Add New Project** → import the repo.
3. Set **Root Directory** to `web` (Edit → select `web`).
4. Framework Preset: **Next.js** (auto-detected). Vercel will use **pnpm** when it sees `pnpm-lock.yaml`.
5. Environment Variables (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase project URL  
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon/public key  
6. Deploy. Share the `*.vercel.app` URL with judges.

No custom server/API routes required — the browser talks to Supabase REST directly.

## Venue demo script

1. Phone hotspot on; ESP32 powered; Serial shows connect + sniff.
2. Wait one window (or use `esp32dev_short`); confirm row in Supabase Table Editor.
3. Open the Vercel (or localhost) app → **Live**; status should match density.
4. Walk the chokepoint repeatedly; watch Serial `%Δ` and density; retune thresholds.
5. Pitch: “Should you wait in this line, or go elsewhere?” — relative busyness, privacy-preserving, one cheap sensor.

## Out of scope

MAC tracking, entry/exit counting, multi-sensor logic, historical “come back in 15 min” prediction, campus WiFi enterprise auth.

## Minimum viable demo

ESP32 pushing real numbers to Supabase + dashboard updating — even with rough thresholds — beats a perfect design that never ships.
