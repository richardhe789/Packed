# Plan 003: Deduplicate overlapping Live polls

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Operator gate**: Ask before any `git` or `pnpm`/`node` command.
>
> **Drift check (run first)**: `git diff --stat 555a50a..HEAD -- web/components/PackedApp.tsx web/lib/supabase.ts`
> On mismatch with excerpts, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (serialize after 002 if both edit `PackedApp.tsx`)
- **Category**: bug
- **Planned at**: commit `555a50a`, 2026-09-19

## Why this matters

Live mode calls `refreshLive` on mount and every `POLL_MS` (30s) without waiting for the previous fetch or aborting it. A slow Supabase response can finish after a newer one and overwrite state (`setState` / `setMeta`) with stale readings, and `liveLoading` can flicker. Fix with an in-flight generation counter and `AbortController` so only the latest poll may apply results.

## Current state

```62:95:web/components/PackedApp.tsx
  const refreshLive = useCallback(async () => {
    setLiveLoading(true);
    try {
      const liveIds = LOCATIONS.filter((l) => l.liveSensor).map((l) => l.id);
      const results = await Promise.all(
        liveIds.map(async (id) => {
          const { latest, previous } = await fetchLatestReadings(id);
          return { id, latest, previous };
        }),
      );
      // setState / setMeta ...
    } catch (err) {
      // ...
    } finally {
      setLiveLoading(false);
    }
  }, []);
```

```134:141:web/components/PackedApp.tsx
  useEffect(() => {
    if (demoMode) return;
    void refreshLive();
    const id = window.setInterval(() => {
      void refreshLive();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [demoMode, refreshLive]);
```

```18:44:web/lib/supabase.ts
export async function fetchLatestReadings(
  locationId: string,
): Promise<{ latest: ReadingRow | null; previous: ReadingRow | null }> {
  // ...
  const res = await fetch(endpoint.toString(), {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    cache: "no-store",
  });
```

Conventions: client component (`"use client"`); keep Demo path untouched; match existing error → `setMeta` pattern.

## Commands you will need

| Purpose   | Command (cwd `web/`) | Expected on success |
|-----------|----------------------|---------------------|
| Typecheck | `pnpm typecheck`     | exit 0              |
| Lint      | `pnpm lint`          | exit 0 (if available) |
| Build     | `pnpm build`         | exit 0 (optional smoke) |

## Scope

**In scope**:
- `web/components/PackedApp.tsx`
- `web/lib/supabase.ts` (add optional `AbortSignal` parameter only)

**Out of scope**:
- Changing `POLL_MS` value
- Batching multi-location queries
- Demo mode / recommendation logic
- React Query / SWR introduction

## Git workflow

- Branch: `advisor/003-live-poll-dedupe`
- Commit example: `Abort stale Live Supabase polls so older responses cannot overwrite newer state.`
- No push/PR unless asked.

## Steps

### Step 1: Thread `AbortSignal` through `fetchLatestReadings`

Change signature to accept an optional second argument or options object:

```ts
export async function fetchLatestReadings(
  locationId: string,
  init?: { signal?: AbortSignal },
): Promise<...>
```

Pass `signal: init?.signal` into `fetch(...)`. Do not change query params or return shape.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Generation + AbortController in `PackedApp`

Inside the Live `useEffect` (or a ref-based pattern owned by that effect):

1. Create `AbortController` for each refresh (or one controller replaced each tick).
2. On interval tick / mount: abort the previous controller, start a new one, call refresh with its `signal`.
3. Use a monotonic `generation` (ref) incremented per refresh; only the matching generation may `setState` / `setMeta` / clear loading.
4. On effect cleanup: abort in-flight fetch and clear the interval.
5. In `catch`: ignore abort errors (`err.name === "AbortError"` or `signal.aborted`) — do not show “Live error” for aborts.
6. Skip starting a new interval refresh while one is in flight **or** abort-and-restart on each tick — pick **abort-and-restart** so the UI always reflects the latest tick.

Keep `enterLive` / `enterDemo` behavior; ensure switching to Demo aborts Live fetches (cleanup of the Live effect when `demoMode` becomes true already unmounts the effect — confirm abort runs in cleanup).

**Verify**: `pnpm typecheck` → exit 0. Manual (operator): Live mode, throttle network in DevTools to Slow 3G, wait through overlapping intervals — meta/density should not jump backward; no abort error toast in meta.

### Step 3: Scope check

Update `plans/README.md` 003 → DONE.

## Test plan

- No existing component test harness; do not add React Testing Library in this plan unless 001 already did (it did not).
- Rely on `pnpm typecheck` + manual abort check.
- Optional: tiny unit test is N/A for the effect; do not invent a flaky timer test.

## Done criteria

- [ ] `fetchLatestReadings` accepts an abort signal and passes it to `fetch`
- [ ] Live effect cleanup aborts in-flight requests
- [ ] Abort does not surface as `Live error: ...` in meta
- [ ] Stale responses cannot call `setState` after a newer generation
- [ ] `pnpm typecheck` exits 0; only in-scope files changed
- [ ] `plans/README.md` 003 → DONE

## STOP conditions

- `PackedApp.tsx` was heavily refactored (e.g. already uses React Query) — reassess; do not rip out a working library.
- Typecheck fails due to unrelated project errors — report.
- Fix seems to require rewriting Demo mode — STOP.

## Maintenance notes

- When Live sensors > 1, batching (deferred) should still accept one shared `AbortSignal`.
- Reviewer: watch for loading spinner stuck `true` if `finally` is tied to the wrong generation — only the active generation should clear loading, or clear loading only if `!signal.aborted` carefully so a superseded request does not clear loading for the newer one incorrectly. Preferred: each generation sets loading true at start; only the latest generation’s `finally` sets loading false (compare gens).
