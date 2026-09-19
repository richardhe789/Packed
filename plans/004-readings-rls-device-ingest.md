# Plan 004: Tighten readings RLS — anon read-only + device ingest

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Operator gate**: Ask before any `git`, `pnpm`/`node`, Supabase CLI deploy,
> or SQL that changes production policies. Confirm with the operator before
> applying migrations to the live Packed project.
>
> **Drift check (run first)**: `git diff --stat 555a50a..HEAD -- firmware/src/main.cpp firmware/include/config.h.example README.md web/lib/supabase.ts`
> On mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `555a50a`, 2026-09-19

## Why this matters

The Live dashboard and ESP32 both use the **anon** key. Live RLS on `public.readings` allows `anon`/`authenticated` to **INSERT** with `WITH CHECK (true)` and **SELECT** with `USING (true)`. The anon key is also `NEXT_PUBLIC_*` in the browser — anyone can invent density rows and poison Live. `NEXT_STEPS.md` already calls for: insert only from a device key or Edge Function; anon read-only. This plan implements that without putting the service role in firmware or the browser.

**Never write secret values into plans, commits, README, or chat logs.** Reference env var *names* only. If any key was ever committed or pasted, rotate it.

## Current state

Verified against Supabase project **Packed** (`myjfbuathehfghagbnot`) at plan time:

- Table `public.readings` — RLS enabled; columns `id`, `created_at`, `avg_rssi`, `packet_count`, `density` (0–100 check), `location`.
- Policies: `anon_insert_readings` (INSERT, with_check true), `anon_select_readings` (SELECT, using true).
- Index `readings_location_created_at_idx` already exists — do not recreate.
- Firmware posts JSON to `{SUPABASE_URL}/rest/v1/readings` with anon key headers (`firmware/src/main.cpp` `pushReadingToSupabase`).
- Web reads via anon GET in `web/lib/supabase.ts` — **must keep working**.
- README documents anon INSERT smoke curl (~lines 104–115).

Intent quote (`NEXT_STEPS.md`): “Tighten RLS for production (insert only from a device key or Edge Function; anon read-only).”

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| List policies (SQL editor / MCP) | `select polname, polcmd from pg_policy where polrelid = 'public.readings'::regclass;` | shows select; insert policy gone or not for anon |
| Deploy edge function | Supabase dashboard or CLI `supabase functions deploy ingest-reading` | function reachable |
| Firmware build | PlatformIO build `esp32dev` (operator) | success |
| Web Live | `pnpm dev` + `?live=1` | still loads latest density |

## Scope

**In scope**:
- Supabase: drop/replace INSERT policy; add Edge Function `ingest-reading`; secrets `DEVICE_INGEST_KEY` (and service role only on the function runtime)
- `firmware/src/main.cpp` — POST target + headers for ingest
- `firmware/include/config.h.example` — document new `#define`s (placeholders only)
- `README.md` — update Supabase / smoke-test sections (no real keys)
- Optional: `supabase/functions/ingest-reading/index.ts` (or project’s chosen functions path) committed to the repo

**Out of scope**:
- Changing SELECT openness (public read of aggregate density is OK for this product)
- Adding `source` / `device_id` columns (nice-to-have; skip unless required)
- Rotating keys in the plan text (operator does rotation in dashboard)
- Web UI changes beyond verifying Live still reads
- TLS `setInsecure` pinning

## Git workflow

- Branch: `advisor/004-readings-rls-device-ingest`
- Commit example: `Require device ingest key for readings inserts; keep anon select for the dashboard.`
- No push/PR unless asked.

## Steps

### Step 1: Design the ingest contract (no deploy yet)

Edge Function `ingest-reading`:

- Method: `POST`
- Headers: `Authorization: Bearer <anon or publishable key>` (Supabase gateway) **and** `x-device-key: <DEVICE_INGEST_KEY>`
- Body JSON: `{ "avg_rssi": number, "packet_count": number, "density": number, "location": string }` — same fields firmware already sends
- Validate: density integer 0–100; location non-empty string; reject extra privilege fields
- On success: insert via service role Supabase client into `readings`; return 200 minimal
- On bad key: 401; on bad body: 400

Store `DEVICE_INGEST_KEY` only in Edge Function secrets / operator password manager — **not** in `NEXT_PUBLIC_*`, not in git.

**Verify**: Write the function file in-repo; operator reviews before deploy.

### Step 2: Apply RLS change (operator-approved)

SQL (run only with operator OK on project `myjfbuathehfghagbnot`):

1. `DROP POLICY IF EXISTS anon_insert_readings ON public.readings;`
2. Confirm `anon_select_readings` remains.
3. Ensure no other INSERT policy grants anon/authenticated unrestricted insert.

**Verify**: As anon key, `POST /rest/v1/readings` returns **401/403**. As anon key, `GET /rest/v1/readings?select=density&limit=1` still **200**.

### Step 3: Deploy Edge Function + secret

Deploy `ingest-reading`. Set secret `DEVICE_INGEST_KEY` to a long random value (operator generates; do not echo it into the repo).

**Verify**: curl POST to `/functions/v1/ingest-reading` **without** `x-device-key` → 401. With correct key and valid body → 200 and a new row visible via anon GET. (Use placeholders in any committed docs; run real curls only in a local scratch pad.)

### Step 4: Update firmware

In `config.h.example` (placeholders only):

```cpp
#ifndef DEVICE_INGEST_KEY
#define DEVICE_INGEST_KEY "YOUR_DEVICE_INGEST_KEY"
#endif
// Optional: override path if not using default functions URL
#ifndef INGEST_PATH
#define INGEST_PATH "/functions/v1/ingest-reading"
#endif
```

In `pushReadingToSupabase`:

- URL = `SUPABASE_URL` + `INGEST_PATH` (not `/rest/v1/readings`)
- Keep `apikey` / `Authorization: Bearer` with **anon** key (gateway)
- Add header `x-device-key: DEVICE_INGEST_KEY`
- Body fields unchanged

Update `hasUsableConfig()` to reject placeholder `YOUR_DEVICE_INGEST_KEY`.

**Verify**: PlatformIO build succeeds (operator). Serial shows POST ok after flash with real local `config.h` (gitignored).

### Step 5: Update README

- Replace “RLS: anon can SELECT and INSERT” with anon **SELECT** only; inserts via Edge Function + device key.
- Replace the anon INSERT curl smoke test with: (1) GET still works with anon; (2) ingest function curl using env var names, not values.
- Document that `config.h` needs `DEVICE_INGEST_KEY`.

**Verify**: README contains no literal secrets; `YOUR_` placeholders only.

### Step 6: Scope check

Mark 004 DONE in `plans/README.md`. Remind operator to rotate anon key if it was ever exposed in a public gist/repo (project ref is already in README — that is OK; **keys** are not).

## Test plan

- Policy: anon INSERT fails; anon SELECT works.
- Function: bad key fails; good key inserts.
- Firmware: one successful window POST after flash.
- Web: Live mode still updates from SELECT.

## Done criteria

- [ ] Policy `anon_insert_readings` removed (or equivalent: anon cannot INSERT)
- [ ] Anon SELECT still works for the Next.js Live path
- [ ] Edge Function ingest requires `x-device-key`
- [ ] Firmware example + `main.cpp` target the function
- [ ] README updated; no secrets committed
- [ ] `plans/README.md` 004 → DONE

## STOP conditions

- Operator does not approve production SQL — leave BLOCKED; do not partially drop insert without a working ingest path (that bricks the ESP32).
- Prefer applying **function first** (accepting keys) while insert policy still exists, smoke-test function insert via service role path, **then** drop anon insert — if the environment cannot soft-launch that way, STOP and ask rather than bricking upload.
- Discover service role key in the browser or firmware — STOP; that is the wrong design.
- Repo already has a different ingest design — STOP and reconcile.

## Maintenance notes

- Reviewers: confirm service role never appears in `NEXT_PUBLIC_*` or `config.h.example` real values.
- Seed scripts (`NEXT_STEPS` §1) should use service role **locally only**, never the device ingest key in the browser.
- Follow-up: rate-limit the function; optional `device_id` column; retire `setInsecure` separately.
