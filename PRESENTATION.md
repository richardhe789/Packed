# Packed — Judge Presentation Script

Spoken script for the live demo. Read the **Say** lines; use **Do** / **If asked** as cues. Aim for ~4–6 minutes talking + demo; leave room for questions.

**Before you start:** phone hotspot on, ESP32 powered and flashed with the default **short-window** firmware (`esp32dev_short`, ~30s), Serial Monitor open (115200), Vercel (or localhost) ready on **Live** (`?live=1`). Keep the board running the whole expo so a `readings` row already exists. Rainy-day path: Serial still proves the sensor; then **Demo** for the campus vision — never invent Live numbers for buildings without a board.

---

## 0. One-liner (memorize this)

**Say:**
> Packed tells you how busy a spot is — without tracking anyone. One cheap ESP32 listens to ambient WiFi noise, turns that into a 0–100 density score, and our web app shows Quiet, Moderate, or Busy so you can skip the packed line.

---

## 1. The problem (~30 sec)

**Say:**
> At Virginia Tech, lunch at Dietrick is a gamble. You walk over, the line is dead, or it’s a 20-minute wait — and there’s no honest public signal for “how packed is it right now?” Camera systems feel creepy and expensive. WiFi login data isn’t something students can see. We wanted something cheap, private, and useful in under a glance.

**Bridge:**
> So we built a relative busyness sensor — not a headcount.

---

## 2. What we built (architecture, ~45 sec)

**Say (point at the pipeline if you have a slide/whiteboard, otherwise just talk):**
> Three pieces.

> **One:** An ESP32 in promiscuous mode. It does not read MAC addresses. Every window — about thirty seconds on this judging build — it only keeps two aggregates: average signal strength and how many packets it heard. From those, on the device, it updates a density score from 0 to 100.

> **Two:** It joins a phone hotspot, not campus WiFi, and POSTs that reading to Supabase — our `readings` table: RSSI, packet count, density, location.

> **Three:** A Next.js dashboard on Vercel. Live mode polls the latest reading about every 30 seconds and paints Quiet / Moderate / Busy on a campus map. Today we have one real board, so Live is this room. Demo mode is where we show the multi-building “go here, not there” product.

**Optional one-liner:**
> Ambient WiFi → ESP32 → Supabase → map. End to end.

---

## 3. Live demo — hardware (~60–90 sec)

**Do:** Show the ESP32 (and Serial if judges can see the laptop). It should already be sniffing this room.

**Say:**
> This is the only sensor. It’s sitting as a STA on our hotspot so it can upload. Same radio also sniffs ambient traffic in promiscuous mode. What you’re about to see on the map is this board, this room — not six dining halls pretending to have hardware.

**Do:** Point at Serial lines like `[wifi] connected`, `[sniff] promiscuous ON`, then a window summary.

**Say:**
> When a window closes you see average RSSI, packet count, and density. If packets jump and RSSI drops enough versus the previous window, density steps up; if things calm down, it steps down. That’s intentional — we’re measuring relative change in the RF environment, not “there are exactly N people.”

**Say (privacy, hit this hard):**
> Critically: the firmware never extracts or stores MAC addresses. Aggregates only. If someone asks “are you tracking phones?” the answer is no.

**Do:** After a window, confirm a new row in Supabase Table Editor if you have it open — or just say “that POST lands in Supabase.”

**Say:**
> HTTPS POST to Supabase. Failures get logged; the loop keeps going so one bad upload doesn’t brick the demo.

---

## 4. Live demo — dashboard (~90–120 sec)

**Do:** Open the deployed app → **Live** (`?live=1`). Select the pulsing pin — **Goodwin Hall** / `goodwin_hall`.

**Say:**
> This is Live. We’re not scrubbing sliders. This pin is the ESP32 on the table. You’ll see density, how many seconds ago the last window landed, and the raw RSSI and packet count from that POST.

**Do:** Tap the judging pin; show density, Quiet/Moderate/Busy, “Ns ago”, RSSI/packets, trend if a previous reading exists, and the tip strip (“only one live sensor — can’t compare across campus yet”).

**Say:**
> Status bands are simple on purpose: roughly 0–33 Quiet, 34–66 Moderate, 67–100 Busy. We are not claiming West End or Newman are live. Those pins are the expansion path.

**Do — the proof it is real:** Ask a few people to step in with phones (Wi‑Fi on), crowd the board, then step back. Wait one ~30s window. Density, trend, RSSI, and packet count should move. Point at Serial and the panel together.

**Say:**
> That’s the same pipeline we’d put at Dietrick. One cheap node per spot. We only brought one board, so you get one honest live reading — right here.

**If Live shows data:**
> Density here matches what Serial just posted. Refresh is about every 30 seconds, so give it a window after we perturb the room.

**If Live is empty / waiting:**
> Switch to honesty, not panic:
> “The pipeline is wired — waiting on the next window. Serial is still the sensor. Demo mode is simulated campus densities, not this board.”
> **Do:** Toggle **Demo** only after you’ve shown Serial. Never fill Preview pins with fake Live numbers.

**Demo-mode talking points (~20 sec, after Live):**
> This is Demo — seeded densities and sliders so you can see the multi-building recommendation. It is not live RF. Live is the board. Demo is the product vision once there’s a node per hall.

---

## 5. Why this approach (~30–45 sec)

**Say:**
> We deliberately did not do MAC tracking, door beam counting, or campus enterprise WiFi auth. Those are either privacy-hostile, infrastructure-heavy, or both. Relative density from ambient RF is good enough to answer: should I wait in this line, or go somewhere else?

> One cheap board. One table. One deployable web app. That’s the MVP we shipped at the hackathon.

---

## 6. What’s next (if they ask / closing, ~20 sec)

**Say (pick 2–3, don’t list everything):**
> Next we’d put this same node at Dietrick and calibrate with real lunch traffic, add a second sensor so Live recommendations are real, and tighten Supabase so devices insert with a key while the public only reads.

**Close:**
> Packed: privacy-preserving, relative busyness — so campus doesn’t feel like a coin flip.

---

## 7. Judge Q&A cheat sheet

| They ask | You say |
|----------|---------|
| How accurate is the headcount? | It’s not a headcount. Relative density vs recent windows. Good for Quiet/Busy, not “47 people.” |
| Are you tracking devices / MACs? | No. Never read or store MACs — RSSI sums and packet counts only. |
| Why a phone hotspot? | Campus WiFi is enterprise/auth-heavy. Hotspot is the reliable uplink for a hackathon ESP32. |
| Why not cameras / computer vision? | Creepy, expensive, power/network heavy. We wanted cheap + private. |
| Why Supabase? | Managed Postgres + REST. ESP32 POSTs rows; browser reads latest. No custom API server for the MVP. |
| How often does it update? | Judging firmware window ~30s (5 min is the production default). UI polls ~30s. |
| What if the POST fails? | Logged on Serial; sniff/upload loop continues. Show Serial, then Demo — don’t fake Live. |
| Can this work at other schools? | Same pipeline; swap location IDs / map coords. Campus profiles are on the roadmap. |
| Is Live multi-building today? | No. One ESP32, one live pin (this room). Other VT spots are Preview. Demo shows multi-spot recommendations. |
| Why Goodwin Hall? | That’s where the board is. We don’t label it Dietrick while sitting here. |
| Security of anon insert? | Hackathon tradeoff — ingest uses a device key on the Edge Function. Production stays read-mostly for the public. |

---

## 8. Demo runbook (silent checklist)

Use this while setting up — don’t read aloud.

1. [ ] Hotspot on; ESP32 joined; Serial: `connected, IP:…`
2. [ ] Flashed `esp32dev_short` (default PlatformIO env); window ~30s
3. [ ] Promiscuous on; window ticking
4. [ ] After window: Supabase `readings` has a fresh row for `goodwin_hall`
5. [ ] App open on Live; judging pin selected; density + RSSI/packets match Serial
6. [ ] Perturb plan ready (phones in / crowd / step back, wait one window)
7. [ ] Backup: Serial + Demo toggle; never invent Live densities
8. [ ] Privacy sentence ready (“no MACs”)
9. [ ] One-liner ready for the first 10 seconds

---

## 9. Roles (optional split)

| Who | Owns |
|-----|------|
| Speaker A | Problem + pitch + privacy |
| Speaker B | Hardware / Serial / density math / room perturbation |
| Speaker C | Dashboard Live (this pin only) + Demo vision + recommendation |

If solo: follow sections 1 → 6 in order; skip section 9.

---

## Out of scope — say this if pressed

We are **not** claiming: absolute occupancy, entry/exit counts, identity of devices, historical “come back in 15 minutes” prediction (yet), or live busyness at Dietrick / West End / Newman while this single board is in the judging room.

Relative busyness, one sensor, this room, end to end — that’s the demo.
