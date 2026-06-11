---
name: implement
description: >
  Orchestrate implementation of an approved plan for a scientific R package by
  delegating coding to subagents, stage by stage — capturing benchmark
  baselines, turning the plan's pending behaviour specs green, and deferring
  behaviour-changing optimisations for the user. Use when implementing a
  non-trivial change that already has a plan and tests.
disable-model-invocation: true
model: opus
effort: high
---

# Implementing a non-trivial change

You are the **orchestrator**. You read, delegate, benchmark, test, review, and
commit — but you **delegate the feature coding to subagents**. You personally
own the scientific judgement: benchmarks, tests, correctness review, and the
decision to commit each stage.

Follow the `conventions` skill throughout, and require every subagent to do the
same.

## 0. Preconditions

- There must be an **approved plan** (`plan` skill) with ordered stages and,
  per function, the behaviours and their correctness basis.
- There must be a **behaviour spec** in `tests/testthat/` (`tests` skill) — the
  pending `it("...")` specs are your checklist.
- `plan` and `tests` are explicit commands (`/plan`, `/tests`); you cannot
  invoke them yourself. If either artefact is missing, **stop and tell the user
  to run `/plan` and/or `/tests` first**, then resume.

## 1. Verify git state and make your own branch

```bash
git branch --show-current
git status --short
```

- **Make your own branch — don't rely on the user.** If you're on
  `main`/`master`, create a feature branch yourself (`git checkout -b
  feat/<short-name>`, named for the work) rather than stopping to ask.
- Bring it up to date first: `git fetch origin main && git rebase origin/main`.
  If the rebase conflicts, stop and tell the user — never auto-resolve.
- Pre-existing uncommitted changes you didn't make: ask whether to stash,
  commit, or proceed.
- **Optional: isolate in a worktree.** For risky or long work, or to enable
  parallel subagents, offer to work in a git worktree. With the user's consent:
  `git worktree add ../<pkg>-<branch> -b <branch>`, `cd` in, then establish a
  clean **R baseline** (`devtools::test()`) before starting. Prefer a native
  worktree command if your environment provides one over raw `git worktree`.
  Skip silently if the user declines or the sandbox forbids it.

## 2. Map the plan to stages and specs

Read the plan. For each stage identify:

- the target files and the concrete change;
- the **pending specs** that stage is responsible for turning green;
- the **benchmarks** the plan named for that stage;
- dependencies — which stages must precede it.

**Default to sequential.** Scientific stages usually build on each other.
Parallelise only stages the plan *explicitly marked independent*, and even then
batch conservatively (2–3 at a time) so you can review each before proceeding.
Two stages touching the same file are never parallel.

## 3. The per-stage loop

For each stage, in dependency order:

### 3a. Baseline benchmark

Run the stage's `bench` benchmarks to capture a **pre-implementation
baseline**, and record the numbers. For a brand-new function there's no
baseline — note that. This can run in the background while you prepare the
delegation.

### 3b. Pre-flight the tests

Run the stage's tests (`devtools::test(filter = ...)`).

- The stage's target specs are pending (SKIPPED) — expected.
- Any **gap-filling specs** (characterising existing behaviour) should pass.

**If a pre-existing test fails, you've found a pre-existing bug. Don't block the
user with a question — record it for the end-of-implementation report (§5), and
fix it now only when the buggy code is being _touched but not replaced_ this
stage:**

- Bug in code this stage won't touch (e.g. in `g()` while you edit `f()`) →
  **don't fix**; record it.
- Bug in `f()` at a location you'll _edit but not rewrite_ → **fix it** if you
  reasonably can.
- Bug in `f()` at a location you're about to _rewrite or delete_ → **don't
  fix** — it's about to be replaced, so it needn't be correct first.

The rule: never block on a bug that isn't in your way; only fix what you're
already touching and keeping.

### 3c. Delegate the implementation

Dispatch the **`implementer`** agent — it already carries the house style and
the status protocol, so your per-stage prompt supplies only the **variable
part**: objective, scientific basis (equation/method + reference), the exact
files, and the stage's pending specs. (See `references/delegation.md` for the
variable template and model selection.)

- **Acceptance:** the stage's pending specs pass, without weakening them.
- **Match the model to the task.** Mechanical, verbose-but-easy stages →
  start cheap (haiku/sonnet). **Numerical or scientific stages → never start on
  haiku;** begin at sonnet or opus.
- **Hard stages can go to another opus.** "Delegate the coding" does *not* mean
  "always downshift" — if a sub-task needs deep reasoning, dispatch an opus
  implementer rather than forcing it onto a weaker model.
- Behaviour-changing optimisations are forbidden in-stage (deferred — see 3f).

### 3d. Review the subagent's work

Read the diff yourself — completeness, **scientific correctness** (does it
implement the cited equation/method?), scope (no stray files), conflicts with
parallel work. Then route by the *kind* of deficiency:

- **Minor** (formatting, typos, namespacing, a simple bug, missing docs) →
  dispatch a fresh **narrow-scope** subagent: "fix exactly X." Cheap; keep the
  draft.
- **Major** (wrong implementation, misread method, wrong approach) → **discard
  the draft.** The prompt was usually the problem: reconsider it, add the
  missing context, and re-dispatch to a **more capable** model.

Don't paper over a major issue with patches — a wrong implementation is a fresh
dispatch, not a fix-up.

### 3e. Turn the specs green (debug loop)

Run the stage's tests. The previously-pending specs must now pass for the right
reason. If they don't, **debug systematically — don't symptom-chase:**

1. **Root cause first.** Read the full error/output, reproduce it reliably,
   review what just changed. No fix before you can name the cause.
2. **Compare to working code.** Diff against a similar passing case.
3. **One hypothesis, smallest test.** Change the least thing that confirms or
   kills it; don't stack speculative fixes.
4. **Fix the cause, re-run, confirm.** After **3 failed attempts, stop and
   question the approach/architecture** instead of trying a fourth.

(For the fuller method, superpowers' `systematic-debugging` skill — when it
calls for a failing test, add a behaviour spec via our `tests` approach, not
RED-GREEN.) The **`verify`** skill's evidence rule applies throughout.

When a delegated attempt fails the tests, **bump one model tier and retry once**
(e.g. haiku → sonnet); if it still fails, **stop and bring it to the user**
rather than burning repeated attempts up the ladder. Confirm roxygen is present
and the package re-documents cleanly.

### 3f. Re-benchmark and triage performance

Re-run the stage's benchmarks; compare to the 3a baseline. If there's a
significant bottleneck:

- First seek an alternative algorithm that produces **identical** outputs more
  efficiently. If one exists, it's in scope — implement it.
- If only an **approximation** would help, **do not implement it.** Add it to a
  running *deferred-optimisations* list with enough detail for the user to
  decide later (what it changes, the expected speedup, the correctness/accuracy
  cost). If it would affect later stages, raise it with the user now rather
  than at the end.

### 3g. Gate and commit

Run the **`verify`** skill as the quality gate. Then commit the stage with a
conventional-commit message, staging **specific files** (never `git add -A`).
Update the plan's checkboxes and the tracking doc (`working-on` skill, if in
use). Move to the next stage.

## 4. When the plan needs to change

If issues surface that need a plan change, **stop.**

- **Minor adjustment** → discuss the options with the user (correctness first,
  then performance, then effort), update the plan, and continue.
- **Major or scientific** change → tell the user to return to **`/plan`**, and
  let `/plan` decide whether the problem runs deep enough to go back to
  **`/whiteboard`**. Don't make that call here, and don't push through a flawed
  direction.

If you are sent back, the downstream artefacts already exist — `plan`, `tests`,
and the benchmarks are **revised**, not rewritten from scratch (those skills
know to work with what's there).

## 5. Stage completion — report and hand off

When all stages are committed and green, **report; do not merge or close
anything here.** Merge and close happen at the *end* of the flow, after
`/review` approves — see the Next step. Report to the user:

- Divergences from the plan so far (list them), or confirmation it matches.
- Test status: which behaviours are covered; any still pending.
- Benchmarks: before/after per stage, and the deferred-optimisations list
  (behaviour-changing speedups not applied).
- **Pre-existing bugs found during pre-flight (§3b) that you did *not* fix**,
  as a list, so the user can decide what to do about them.
- Offer to open GitHub issues for any out-of-scope problems surfaced.

## Orchestration rules

1. Delegate the coding; never hand-write feature code yourself.
2. Read relevant files before writing a subagent prompt — give accurate
   context, not "find the file".
3. **Correctness review is yours and is non-negotiable. NEVER rubber-stamp
   subagent output** — read the diff and check the science yourself, every
   stage. A delegated change you didn't verify is a change you don't understand.
4. Commit per stage, not all at the end. Stage specific files.
5. Never force-push; never amend — new commits for fixes.
6. Keep the plan file and tracking doc updated as you go.

## Next step

The pipeline order from here is **benchmark/optimise → review → merge & close**
(merge/close is owned by `/review`, only after it approves — never here).
Surface the next command:

> Stages complete (all specs green). Run `/benchmark-optimise` to work the
> deferred-optimisations list, then `/review` for the final pass. Merge and
> close happen after review approves.
