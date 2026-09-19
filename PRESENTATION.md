# Packed — Judge Presentation Script

Spoken script for the live demo. Read the **Say** lines; use **Do** / **If asked** as cues. Aim for ~4–6 minutes talking + demo; leave room for questions.

**Before you start:** phone hotspot on, ESP32 powered, Serial Monitor open (115200), Vercel (or localhost) ready on **Live** (`?live=1`). Rainy-day path: switch to **Demo** and keep talking — same story, simulated densities.

---

## 0. One-liner (memorize this)

**Say:**
> Packed tells you how busy a spot on campus is — without tracking anyone. One cheap ESP32 listens to ambient WiFi noise, turns that into a 0–100 density score, and our web app shows Quiet, Moderate, or Busy so you can skip the packed line.

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

> **One:** An ESP32 in promiscuous mode. It does not read MAC addresses. Every window — five minutes normally — it only keeps two aggregates: average signal strength and how many packets it heard. From those, on the device, it updates a density score from 0 to 100.

> **Two:** It joins a phone hotspot, not campus WiFi, and POSTs that reading to Supabase — our `readings` table: RSSI, packet count, density, location.

> **Three:** A Next.js dashboard on Vercel. Live mode polls the latest reading about every 30 seconds, paints Quiet / Moderate / Busy on a campus map, and recommends the quieter place when there’s a real gap between spots.

**Optional one-liner:**
> Ambient WiFi → ESP32 → Supabase → map. End to end.

---

## 3. Live demo — hardware (~60–90 sec)

**Do:** Show the ESP32 (and Serial if judges can see the laptop).

**Say:**
> This is the sensor. It’s sitting as a STA on our hotspot so it can upload. Same radio also sniffs ambient traffic in promiscuous mode on the hotspot channel — or we can retune the sniff channel at the venue if campus APs are elsewhere.

**Do:** Point at Serial lines like `[wifi] connected`, `[sniff] promiscuous ON`, then a window summary.

**Say:**
> When a window closes you see average RSSI, packet count, and density. If packets jump and RSSI drops enough versus the previous window, density steps up; if things calm down, it steps down. That’s intentional — we’re measuring relative change in the RF environment, not “there are exactly N people.”

**Say (privacy, hit this hard):**
> Critically: the firmware never extracts or stores MAC addresses. Aggregates only. If someone asks “are you tracking phones?” the answer is no.

**Do:** After a window (or short-window build), confirm a new row in Supabase Table Editor if you have it open — or just say “that POST lands in Supabase.”

**Say:**
> HTTPS POST to Supabase. Failures get logged; the loop keeps going so one bad upload doesn’t brick the demo.

---

## 4. Live demo — dashboard (~90–120 sec)

**Do:** Open the deployed app → toggle **Live** (or `?live=1`). Select Dietrick / `dining_hall_main`.

**Say:**
> This is Live. We’re not scrubbing sliders — we’re reading whatever the ESP32 last wrote for Dietrick Hall.

**Do:** Tap Dietrick on the map; show density, Quiet/Moderate/Busy, trend if previous reading exists, and the recommendation strip.

**Say:**
> Status bands are simple on purpose: roughly 0–33 Quiet, 34–66 Moderate, 67–100 Busy. The recommendation looks across locations — today only Dietrick has a live sensor; other buildings on the map are placeholders for a multi-spot campus. When only one sensor is live, the honest story is “how packed is Dietrick right now,” not “compare six halls.” Demo mode is where we show the multi-building “go here, not there” pitch with seeded data.

**If Live shows data:**
> Density here matches what Serial just posted. Refresh is about every 30 seconds, so if we just walked the chokepoint, give it a window and watch it move.

**If Live is empty / waiting:**
> Switch to honesty, not panic:
> “The pipeline is wired — waiting on the next window. Meanwhile Demo mode shows the full UX with realistic seeded densities.”
> **Do:** Toggle **Demo**, scrub a slider, show recommendation flip.

**Demo-mode talking points (use even briefly):**
> Sliders prove the UI and the recommendation logic. Live proves the sensor is real. Judges should see both if you have time: Live for credibility, Demo for the product vision.

---

## 5. Why this approach (~30–45 sec)

**Say:**
> We deliberately did not do MAC tracking, door beam counting, or campus enterprise WiFi auth. Those are either privacy-hostile, infrastructure-heavy, or both. Relative density from ambient RF is good enough to answer: should I wait in this line, or go somewhere else?

> One cheap board. One table. One deployable web app. That’s the MVP we shipped at the hackathon.

---

## 6. What’s next (if they ask / closing, ~20 sec)

**Say (pick 2–3, don’t list everything):**
> Next we’d calibrate thresholds with real foot traffic at Dietrick, add a second sensor so Live recommendations are real, seed realistic day curves so we can demo Live without standing in line for hours, and tighten Supabase so devices insert with a key while the public only reads.

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
| How often does it update? | Firmware window ~5 min (30s short env for bench). UI polls ~30s. |
| What if the POST fails? | Logged on Serial; sniff/upload loop continues. Pause sniff around upload when channel juggling needs it. |
| Can this work at other schools? | Same pipeline; swap location IDs / map coords. Campus profiles are on the roadmap. |
| Is Live multi-building today? | Map has several VT spots; only Dietrick is `liveSensor` today. Demo shows multi-spot recommendations. |
| Security of anon insert? | Hackathon tradeoff — anon can insert for demo. Production would use a device key / Edge Function and read-only anon. |

---

## 8. Demo runbook (silent checklist)

Use this while setting up — don’t read aloud.

1. [ ] Hotspot on; ESP32 joined; Serial: `connected, IP:…`
2. [ ] Promiscuous on; window ticking
3. [ ] After window: Supabase `readings` has a fresh row for `dining_hall_main`
4. [ ] App open on Live; Dietrick selected; density matches Serial
5. [ ] Backup: Demo toggle + slider works offline
6. [ ] Privacy sentence ready (“no MACs”)
7. [ ] One-liner ready for the first 10 seconds

---

## 9. Roles (optional split)

| Who | Owns |
|-----|------|
| Speaker A | Problem + pitch + privacy |
| Speaker B | Hardware / Serial / density math |
| Speaker C | Dashboard Live + Demo + recommendation |

If solo: follow sections 1 → 6 in order; skip section 9.

---

## Out of scope — say this if pressed

We are **not** claiming: absolute occupancy, entry/exit counts, identity of devices, historical “come back in 15 minutes” prediction (yet), or multi-sensor Live recommendations until a second board is online.

Relative busyness, one sensor, end-to-end — that’s the demo.
