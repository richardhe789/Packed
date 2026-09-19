# Plan 001: Add a verification baseline for crowd logic

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Operator gate**: In this workspace, ask the operator before running any
> `git` or `pnpm`/`node` command. Do not proceed past a step that needs those
> until they approve.
>
> **Drift check (run first)**: `git diff --stat 555a50a..HEAD -- web/package.json web/lib/crowd.ts web/tsconfig.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `555a50a`, 2026-09-19

## Why this matters

Packed’s product brain is pure TypeScript in `web/lib/crowd.ts` (Quiet/Moderate/Busy bands, recommendation, demo seed). There are **zero** automated tests and no `typecheck` script — only `next lint` / `next build`. Later plans change recommendation behavior; without characterization tests those changes can ship silently wrong. This plan adds Vitest + a `typecheck` script and locks today’s crowd helpers so regressions fail locally.

## Current state

- `web/package.json` — scripts are only `dev` / `build` / `start` / `lint`; no `test` or `typecheck`; no Vitest.
- `web/lib/crowd.ts` — exports `statusFromDensity`, `buildRecommendation`, `trendDirection`, `seedDemoState`, `REC_GAP` (20), bands ≤33 Quiet / ≤66 Moderate / else Busy.
- `web/tsconfig.json` — `"strict": true`, `"noEmit": true`, paths `@/*` → `./*`.
- No `web/**/*.{test,spec}.{ts,tsx}` files exist.
- Package manager: **pnpm** (`packageManager`: `pnpm@11.20.0`). Work from `web/`.

Excerpt — recommendation collapse with one scored location (behavior to characterize, not “fix” yet):

```146:180:web/lib/crowd.ts
export function buildRecommendation(
  state: Record<string, ReadingState>,
  demoMode: boolean,
): Recommendation {
  // ...
  if (busiest.density - quietest.density < REC_GAP) {
    return {
      text: "Anywhere looks similar right now",
      detail:
        "Crowd levels are close across campus — pick what’s convenient.",
      tone: "neutral",
    };
  }
  // ...
}
```

Vocabulary from README: density is relative busyness 0–100; statuses Quiet / Moderate / Busy; privacy = no MAC tracking (do not add identity fields in tests).

## Commands you will need

| Purpose   | Command (cwd `web/`)        | Expected on success |
|-----------|-----------------------------|---------------------|
| Install   | `pnpm install`              | exit 0              |
| Typecheck | `pnpm typecheck`            | exit 0, no errors   |
| Tests     | `pnpm test`                 | exit 0, all pass    |
| Lint      | `pnpm lint`                 | exit 0 (if it already works; do not expand ESLint scope in this plan) |

## Scope

**In scope** (only these):
- `web/package.json`
- `web/pnpm-lock.yaml` (via `pnpm add -D`)
- `web/vitest.config.ts` (create)
- `web/lib/crowd.test.ts` (create)

**Out of scope**:
- ESLint config / CI workflows / `AGENTS.md`
- Changing recommendation or Live polling behavior (plans 002 / 003)
- Firmware, Supabase RLS, removing `react-map-gl`
- Editing UI components

## Git workflow

- Branch: `advisor/001-crowd-verification-baseline`
- Commit style (from recent history): full-sentence summaries, e.g. `Add Vitest coverage for crowd density and recommendation helpers.`
- Do NOT push or open a PR unless the operator asks.

## Steps

### Step 1: Add Vitest + typecheck scripts

In `web/`, add devDependencies: `vitest` (current stable compatible with the repo’s Node). Prefer Vitest’s default Node environment (no jsdom required — crowd.ts is pure).

Update `web/package.json` scripts:

```json
"typecheck": "tsc --noEmit",
"test": "vitest run",
"test:watch": "vitest"
```

Create `web/vitest.config.ts`:

```ts
import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

**Verify**: `pnpm typecheck` → exit 0. `pnpm test` → may exit non-zero until Step 2 adds tests; if Vitest says “no test files”, that is OK for this step only.

### Step 2: Characterization tests for `crowd.ts`

Create `web/lib/crowd.test.ts` importing from `./crowd` (or `@/lib/crowd`). Cover at minimum:

1. `statusFromDensity(null)` → `unknown` / `"No data"`
2. `statusFromDensity(0)` and `33` → Quiet; `34` and `66` → Moderate; `67` and `100` → Busy
3. `trendDirection(50, 40)` → `up`; `(40, 50)` → `down`; `(50, 49)` → `flat`; nulls → `none`
4. `seedDemoState("2020-01-01T00:00:00.000Z")` — every `LOCATIONS` id has non-null density; `dining_hall_main` is 78
5. `buildRecommendation` with empty densities → waiting copy; `demoMode` true vs false detail differs
6. `buildRecommendation` with **only** `dining_hall_main` density set (others null) → today’s “Anywhere looks similar…” (documents the Live bug for plan 002)
7. `buildRecommendation` with quietest far below busiest (≥ `REC_GAP`) → `tone: "go"` and quietest `shortLabel` in `text`

Do **not** change production `crowd.ts` in this plan.

**Verify**: `pnpm test` → exit 0; all cases above pass. `pnpm typecheck` → exit 0.

### Step 3: Confirm scope cleanliness

**Verify**: `git status` (with operator permission) shows only in-scope files changed/added. Update `plans/README.md` row 001 → DONE.

## Test plan

- New file: `web/lib/crowd.test.ts` (cases listed in Step 2).
- No prior test file to model after — keep tests small, table-driven where natural, no network.
- Verification: `pnpm test` → all pass.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0 with `web/lib/crowd.test.ts` covering the cases in Step 2
- [ ] `web/package.json` has `typecheck` and `test` scripts
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row for 001 is DONE

## STOP conditions

- Drift check shows `crowd.ts` / `package.json` already changed in conflicting ways.
- Vitest cannot resolve `@/` or `tsc` fails for reasons outside crowd tests — report the error; do not disable `strict`.
- Operator refuses `pnpm` — leave status BLOCKED with reason.

## Maintenance notes

- Plan 002 will intentionally change case (6) expectations — update that test when fixing Live recommendation.
- Prefer keeping crowd helpers pure so Node Vitest stays sufficient; do not drag React Testing Library into this plan.
- Reviewers: reject PRs that “fix” recommendation logic under the guise of adding tests.
