# Next steps — Campus Crowd

Post-hackathon roadmap. The MVP ships: one ESP32 → Supabase → Next.js map/dashboard (Demo + Live). What’s below is how to make it credible, portable, and easier to demo without standing in a dining hall for hours.

---

## 1. Realistic test / demo data

Sliders prove the UI; they don’t prove the product. Generate synthetic (or replayed) readings that *look* like a campus day.

### Goals

- Live mode can be demoed without an ESP32 on-site.
- Charts / trends (when added) have something interesting to show.
- Threshold tuning can be practiced offline before venue day.

### Ideas (pick one first)

| Approach | What it is | Why |
|----------|------------|-----|
| **Seed script** | Node/TS (or SQL) that `INSERT`s rows into `readings` on a schedule | Fast; uses real Live path |
| **Edge Function cron** | Supabase scheduled function writes fake density curves | No laptop left running |
| **Replay file** | Record a real afternoon of Serial/`readings`, replay with timestamps shifted to “now” | Most believable |
| **Pattern generator** | Parametric day curve: quiet morning → lunch spike → afternoon lull → dinner spike + noise | Good for judges; tunable |

### Suggested density curve (lunch hall)

Rough shape for one location over a weekday:

- 07:00–10:30 → low 10–25  
- 11:00–13:30 → ramp to 70–95, hold, taper  
- 14:00–16:30 → moderate 30–50  
- 17:00–19:30 → second peak 60–85  
- Night → drift toward quiet  

Add small random walk (±3–8 density) and occasional “bus burst” spikes so it doesn’t look synthetic. Stagger peaks across locations so the recommendation engine has a clear “go here, not there.”

### Implementation sketch

- Script under `scripts/seed-readings.ts` (or `.mjs`) using Supabase URL + **service role** (local only; never ship to the browser).
- CLI flags: `--location dining_hall_main`, `--hours 12`, `--interval 60` (seconds between rows).
- Optional: `--pattern lunch|flat|chaos` and `--campus vt` later.
- Document in README: “Demo Live without hardware.”

### Don’t forget

- Rate: match firmware window (5 min) or short-window env so the UI’s 30s poll still feels live.
- Cleanup: delete seed rows by `location` + time range, or use a `source: 'sim'` column if you migrate the schema.

---

## 2. Customization for other college campuses

Today VT is hard-coded: `CAMPUS_VIEW`, `LOCATIONS` (labels, coords, `liveSensor`) in `web/lib/crowd.ts`, and firmware `LOCATION_ID`.

### Make campus a config, not a fork

1. **Campus profile JSON** (example shape):

   ```json
   {
     "id": "vt",
     "name": "Virginia Tech",
     "map": { "latitude": 37.2278, "longitude": -80.422, "zoom": 15.35 },
     "locations": [
       {
         "id": "dining_hall_main",
         "label": "Dietrick Hall (D2)",
         "shortLabel": "Dietrick",
         "liveSensor": true,
         "coords": { "lat": 37.22455, "lng": -80.41895 }
       }
     ]
   }
   ```

2. Load via `NEXT_PUBLIC_CAMPUS=vt` or `?campus=vt`, with profiles in `web/campuses/*.json`.
3. Firmware: keep `LOCATION_ID` aligned with profile `locations[].id` (document the contract).
4. Branding: optional name/tagline/colors per campus without redesigning the whole UI.

### Onboarding checklist for a new school

- [ ] Pick 2–5 high-traffic spots (dining, library, rec) with public coords  
- [ ] Add campus profile + map center/zoom  
- [ ] Deploy one ESP32 (or sim data) for at least one `liveSensor: true` id  
- [ ] Retune RSSI/packet thresholds at that venue (Phase checklist item 6)  
- [ ] Confirm privacy story still holds (no MACs, aggregate only)

### Multi-tenant later

Separate Supabase projects per school vs one DB with `campus_id` on `readings`. One project is enough until a second school is real.

---

## 3. Sensor & firmware

- **Calibrate at venue** — walk the chokepoint; log `%Δ` and density; adjust `RSSI_THRESHOLD` / `PACKET_THRESHOLD` / step sizes.
- **More nodes** — second ESP32 for West End / library; same table, different `location`.
- **Channel plan** — document which campus APs matter; when to set `SNIFF_CHANNEL` vs hotspot channel.
- **Reliability** — offline queue / retry if POST fails; watchdog if radio wedges on promiscuous + STA.
- **Power** — wall wart vs battery + sleep between windows for longer installs.

---

## 4. Backend & data model

- Tighten RLS for production (insert only from a device key or Edge Function; anon read-only).
- Add indexes on `(location, created_at desc)` if not already.
- Optional columns: `campus_id`, `device_id`, `source` (`esp32` | `sim` | `manual`).
- History API or Supabase query for last N hours (feeds charts and “was it busier an hour ago?”).
- Alerts (optional): webhook / email when density stays Busy for X windows.

---

## 5. Product / UI

- **Trend sparkline** per building (last 1–2 hours of density).
- **“Come back around …”** heuristic from recent slope (still relative, not a headcount).
- **Shareable link** with campus + selected building (`?campus=vt&loc=dietrick`).
- **PWA / mobile polish** — map + recommendation are the pitch; make one-thumb use easy.
- Keep Demo for judges with no hardware; keep Live for the real sensor story.

---

## 6. Ops & demo readiness

- One-page **runbook**: hotspot → flash → Serial OK → Supabase row → Live URL.
- Vercel env checklist; preview deploys for UI experiments.
- Seed script + short-window firmware env as the “rainy day” judge path.
- Privacy blurb for judges/admin: what is measured, what is never stored.

---

## 7. Explicit non-goals (for now)

Still out of scope unless requirements change:

- MAC tracking / device identity  
- True entry/exit people counting  
- Campus enterprise WiFi auth for the ESP32 uplink (phone hotspot stays the path)  
- Perfect absolute occupancy — sell **relative** busyness

---

## Suggested order

1. **Seed / sim readings** — unlocks Live demos and UI work without venue time.  
2. **Venue calibration** — makes the one real sensor trustworthy.  
3. **Campus config files** — unlocks “works at other schools” without rewriting the app.  
4. **History + sparkline** — stronger story than a single number.  
5. **Second sensor + harder RLS** — when you’re past demo and into a real pilot.
