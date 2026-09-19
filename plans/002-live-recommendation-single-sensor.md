# Plan 002: Fix Live recommendation when only one location has data

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Operator gate**: Ask before any `git` or `pnpm`/`node` command.
>
> **Drift check (run first)**: `git diff --stat 555a50a..HEAD -- web/lib/crowd.ts web/lib/crowd.test.ts web/components/PackedApp.tsx`
> On mismatch with excerpts below, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/001-crowd-verification-baseline.md`
- **Category**: bug
- **Planned at**: commit `555a50a`, 2026-09-19

## Why this matters

Live mode only populates locations with `liveSensor: true` (today: `dining_hall_main`). Non-sensor pins stay `density: null`. `buildRecommendation` then sees a single scored location, so `busiest - quietest === 0 < REC_GAP` and Live **always** shows “Anywhere looks similar right now” — even when Dietrick is Busy. Demo mode works because `seedDemoState` fills every building. The pitch (“go here, not there”) is false on the real sensor path. Fix by being honest when fewer than two locations have data — **do not invent** densities for Preview pins.

## Current state

- `web/lib/crowd.ts` — `LOCATIONS[0]` (`dining_hall_main`) has `liveSensor: true`; all others `false`.
- `web/components/PackedApp.tsx:65–83` — Live refresh fetches only `liveSensor` ids into a fresh `emptyState()`.
- `web/lib/crowd.ts:146–180` — recommendation treats any non-null densities; gap check uses `REC_GAP` (20).

```65:83:web/components/PackedApp.tsx
      const liveIds = LOCATIONS.filter((l) => l.liveSensor).map((l) => l.id);
      const results = await Promise.all(
        liveIds.map(async (id) => {
          const { latest, previous } = await fetchLatestReadings(id);
          return { id, latest, previous };
        }),
      );

      setState(() => {
        const next = emptyState();
        for (const { id, latest, previous } of results) {
          next[id] = {
            density: latest ? latest.density : null,
            created_at: latest ? latest.created_at : null,
            prevDensity: previous ? previous.density : null,
          };
        }
        return next;
      });
```

Product constraints from README / `NEXT_STEPS.md`: relative busyness only; Preview locations without sensors must not be presented as live sensor readings. Seed/sim for non-sensor locations is a **later** direction item — out of scope here.

## Commands you will need

| Purpose   | Command (cwd `web/`) | Expected on success |
|-----------|----------------------|---------------------|
| Tests     | `pnpm test`          | exit 0              |
| Typecheck | `pnpm typecheck`     | exit 0              |

## Scope

**In scope**:
- `web/lib/crowd.ts` (`buildRecommendation` only)
- `web/lib/crowd.test.ts` (update expectations)

**Out of scope**:
- Changing which locations have `liveSensor`
- Seeding fake Live data for Preview pins
- Supabase schema / firmware
- UI copy outside what `buildRecommendation` returns (TopBar/DetailPanel already render `recommendation`)
- Poll abort logic (plan 003)

## Git workflow

- Branch: `advisor/002-live-recommendation-single-sensor` (or continue from 001’s branch if stacking)
- Commit message style: full sentence, e.g. `Show single-sensor status instead of false campus-wide recommendation in Live.`
- Do not push/PR unless asked.

## Steps

### Step 1: Confirm plan 001 landed

**Verify**: `web/lib/crowd.test.ts` exists and `pnpm test` passes on current main/branch. If missing, STOP and run/complete 001 first.

### Step 2: Special-case `scored.length < 2` in `buildRecommendation`

After the existing `scored.length === 0` early return, add a branch for `scored.length === 1`:

- Let `only = scored[0]`.
- `status = statusFromDensity(only.density).label`.
- Return `tone: "neutral"`.
- **Live** (`demoMode === false`):
  - `text`: `` `${only.loc.shortLabel} is ${status}` `` (e.g. `Dietrick is Busy`)
  - `detail`: explain that only one live sensor is online, so Packed cannot compare across campus yet.
- **Demo** (`demoMode === true`):
  - Same pattern is fine, or slightly different detail (“Scrub another building to compare”) — keep it short.
- Do **not** change the `scored.length === 0` messages or the multi-location `REC_GAP` / “Go to …” path.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Update unit tests

In `web/lib/crowd.test.ts`:

- Change the single-location Live case: must **not** expect “Anywhere looks similar right now”; expect the new single-sensor status copy and `tone: "neutral"`.
- Add/keep a multi-location case with gap ≥ `REC_GAP` still returning `tone: "go"`.
- Add a two-location case with gap `< REC_GAP` still returning “Anywhere looks similar…”.

**Verify**: `pnpm test` → exit 0.

### Step 4: Scope check

**Verify**: only in-scope files changed. Mark 002 DONE in `plans/README.md`.

## Test plan

- Update characterization test from plan 001 that asserted single-location → “Anywhere looks similar”.
- Add assertions for Live vs Demo detail strings if they differ.
- Manual (optional, operator): `pnpm dev`, open `?live=1`, confirm TopBar shows “Dietrick is …” when Supabase has a row — not “Anywhere looks similar”.

## Done criteria

- [ ] `buildRecommendation` with exactly one non-null density never returns the campus-wide “Anywhere looks similar” copy
- [ ] Multi-location behavior (≥2 densities) unchanged for go / similar paths
- [ ] `pnpm test` and `pnpm typecheck` exit 0
- [ ] No invented densities for `liveSensor: false` locations
- [ ] `plans/README.md` 002 → DONE

## STOP conditions

- Plan 001 not done and tests missing.
- Someone already “fixed” Live by seeding Preview locations with fake data — STOP; that contradicts this plan’s honesty constraint; report.
- Copy changes seem to require editing TopBar/DetailPanel beyond consuming `recommendation` — STOP (should not be needed).

## Maintenance notes

- When a second `liveSensor` goes live (or sim-backed locations are labeled), the `< 2` branch becomes rare; keep the guard anyway.
- Reviewers: reject any fix that sets Preview pin densities from hardcoded demo values while `demoMode === false`.
- Deferred: seed script / `source: 'sim'` from `NEXT_STEPS.md` §1.
