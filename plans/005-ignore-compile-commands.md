# Plan 005: Stop tracking firmware/compile_commands.json

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Operator gate**: Ask before any `git` command.
>
> **Drift check (run first)**: `git diff --stat 555a50a..HEAD -- firmware/compile_commands.json .gitignore firmware/.gitignore`
> On mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `555a50a`, 2026-09-19

## Why this matters

`firmware/compile_commands.json` is a **machine-local** clangd/PlatformIO compilation database (~1.6MB+) committed to the repo. Entries use absolute paths under the old folder name `ProjectSolver` and the operator’s `.platformio` packages tree. It is useless (and misleading) on other machines, creates noisy diffs, and is not listed in `.gitignore`. Stop tracking it and ignore it going forward.

## Current state

- File present: `firmware/compile_commands.json` (very large).
- Sample path pattern inside: `C:\\Users\\Richard\\Documents\\Github\\ProjectSolver\\firmware` (stale rename).
- Root `.gitignore` ignores `.pio` and `firmware/include/config.h` but **not** `compile_commands.json`.
- `firmware/.gitignore` also lacks `compile_commands.json`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Confirm tracked | `git ls-files firmware/compile_commands.json` | prints the path if tracked |
| After removal | `git ls-files firmware/compile_commands.json` | empty output |
| Status | `git status -sb` | shows ignore + deletion; no accidental secrets |

## Scope

**In scope**:
- Delete `firmware/compile_commands.json` from the working tree / git index
- Root `.gitignore` — add `firmware/compile_commands.json` (and optionally `compile_commands.json` under firmware)
- Optional one-line note in `README.md` firmware section: “PlatformIO may regenerate `compile_commands.json` locally; it is gitignored.”

**Out of scope**:
- Editing firmware source
- Committing a regenerated compile_commands from the current machine
- Changing PlatformIO `platformio.ini` unless required to stop emitting the file into git (ignore is enough)

## Git workflow

- Branch: `advisor/005-ignore-compile-commands`
- Commit example: `Stop tracking PlatformIO compile_commands.json and gitignore it.`
- Do not push/PR unless asked.

## Steps

### Step 1: Gitignore

Add to root `.gitignore` (near the firmware section):

```
firmware/compile_commands.json
```

**Verify**: file is listed in `.gitignore`.

### Step 2: Remove from version control

With operator permission:

```
git rm --cached firmware/compile_commands.json
```

If the file should also disappear from disk in the commit, `git rm` (without `--cached`) is fine — PlatformIO/clangd can regenerate locally.

**Verify**: `git ls-files firmware/compile_commands.json` → empty. `git status` shows deletion + gitignore change.

### Step 3: Optional README note

One sentence under Firmware setup is enough. Skip if operator prefers zero doc churn.

### Step 4: Mark DONE

Update `plans/README.md` row 005 → DONE.

## Test plan

- No code tests.
- Confirm a fresh clone will not contain the giant JSON (after merge).
- Local IDE: if clangd breaks, regenerate via PlatformIO; do not re-commit the file.

## Done criteria

- [ ] `firmware/compile_commands.json` is not tracked by git
- [ ] Root `.gitignore` contains `firmware/compile_commands.json`
- [ ] No secrets and no other firmware sources changed
- [ ] `plans/README.md` 005 → DONE

## STOP conditions

- File is required by a documented CI job that compiles firmware via this JSON — unlikely; if found, STOP and report.
- `git rm` would delete something other than this path — STOP.

## Maintenance notes

- Reviewers: reject future PRs that re-add `compile_commands.json`.
- If teammates need clangd, document “build once in PlatformIO to regenerate” rather than committing the DB.
