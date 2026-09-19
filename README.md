# Packed

VTHacks project: estimate how busy a dining hall is using a **single ESP32** as a passive ambient WiFi sensor. No MAC tracking, no headcount — only aggregate RSSI + packet activity → a 0–100 density score → Supabase → a **Next.js** web dashboard (**Quiet / Moderate / Busy**), deployable on Vercel.

Formerly known as Campus Crowd / ProjectSolver.

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
| [`location.config.json`](location.config.json) | The one manual ESP32/dashboard testing location |
| [`LOCATION.md`](LOCATION.md) | Move-the-sensor instructions |
| [`NEXT_STEPS.md`](NEXT_STEPS.md) | Post-hackathon roadmap (sim data, multi-campus, etc.) |

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
   - The testing location is not a secret: edit only root `location.config.json`
     (default ID: `dining_hall_main`).

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

### Real ESP32 board: upload, verify, and debug

1. In ignored `firmware/include/config.h`, set the phone hotspot SSID/password,
   `https://myjfbuathehfghagbnot.supabase.co`, the project's anon key, and
   The manual location is in root `location.config.json` (default
   `dining_hall_main`). Enable the hotspot before powering the
   board; choose 2.4 GHz if the phone offers a band setting.
2. Connect a data-capable USB cable. From `firmware/`, upload a short test or
   the standard five-minute build:

   ```powershell
   pio run -e esp32dev_short --target upload
   pio run -e esp32dev --target upload
   ```

   If necessary, run `pio device list` and append `--upload-port COM<number>`.
   Hold the board's **BOOT** button as upload starts only when it cannot enter
   the bootloader automatically.
3. Monitor the board:

   ```powershell
   pio device monitor -b 115200
   ```

   Expect `[wifi] connected`, `[sniff] promiscuous ON`, then `[http] POST ok`.
   Confirm the row in Supabase Table Editor and wait up to 30 seconds for the
   dashboard's Live poll.
4. `[fatal] Invalid local config.h` means a placeholder key or Dashboard URL
   remains; Wi-Fi failure means hotspot band/credentials/range; HTTP 401/403
   means anon key or RLS; HTTP 404 means the schema or URL is wrong. Use the
   short environment while debugging.

### Channel / radio notes

- Default sniff channel = hotspot AP channel (`SNIFF_CHANNEL 0`).
- At the venue, use a WiFi analyzer (or the boot `[scan]` log) to see campus AP channels.
- To sniff a different channel, set `#define SNIFF_CHANNEL N` — firmware **pauses sniff → reconnects STA → POSTs → resumes sniff** so one radio can still upload.
- **Top risk:** promiscuous + STA + HTTPS on one radio. If POST fails while sniffing, check Serial; the pause/resume path is the intended fix.

### Privacy

Firmware never reads or stores MAC addresses — only RSSI sums and packet counts.

## Supabase

Project: **Packed** (`myjfbuathehfghagbnot`) — rename the display name in the Supabase dashboard if it still shows ProjectSolver.

1. In that project's Supabase dashboard, open **SQL Editor** and run
   [`supabase/schema.sql`](supabase/schema.sql). It creates `public.readings`,
   a location/time index, and the anonymous `SELECT` / `INSERT` RLS policies
   required for this demo.
2. Open **Project Settings → API** and copy the Project URL and its
   publishable/anon key. The Project URL is
   `https://myjfbuathehfghagbnot.supabase.co`; do not use the browser's
   `supabase.com/dashboard/...` URL.
3. Place the same URL and anon key in ignored local files only:

   ```text
   firmware/include/config.h    SUPABASE_URL, SUPABASE_API_KEY
   web/.env.local               NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
   ```

   The dashboard and firmware both take their manual location from root
   `location.config.json`; it defaults to `dining_hall_main`.

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

After the request returns 2xx, open the dashboard with `?live=1`. It queries
the newest rows for the ID in `location.config.json` every 30 seconds.

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
- **Live:** polls Supabase for the ID in `location.config.json` every 30s.
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

## After the hackathon

See [`NEXT_STEPS.md`](NEXT_STEPS.md) for realistic test data, other campuses, more sensors, and product follow-ups.

## Rename checklist (external)

Code/docs in this repo use **Packed**. Finish the rename outside the repo:

1. **GitHub** — Settings → General → Repository name → `Packed` (then update local remote / folder).
2. **Vercel** — Project Settings → General → Project Name → `packed` (or reconnect after GitHub rename).
3. **Supabase** — Project Settings → General → Project name → `Packed` (ref `myjfbuathehfghagbnot` stays the same).
4. **Local folder** — close Cursor, rename `ProjectSolver` → `Packed`, reopen.
