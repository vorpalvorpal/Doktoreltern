# Subagent-driven workflow

Adapted from superpowers' `subagent-driven-development` to our pipeline. Read
this when running the per-stage loop with the r-science/agents/ roster instead of
ad-hoc `general-purpose` dispatch.

**Core idea:** a fresh subagent per stage + isolated review = quality without
polluting the orchestrator's context. The orchestrator coordinates; it does not
write feature code.

## The agents (in `r-science/agents/`)

| Agent | Role | Edits? | Model |
|-------|------|--------|-------|
| `implementer` | Codes one stage to green; house style + status protocol baked in | yes | per task (haiku→opus) |
| `reviewer` | Final review: plan conformance + data soundness, then delegates code/test quality | no | opus |
| `benchmarker` | Runs predefined benchmarks, reports raw numbers (no ROI call) | no | haiku |
| `plan-reviewer` | Reviews a draft plan for testability before tests are written | no | opus |

Because the `implementer` bakes in the conventions and the status protocol, the
orchestrator's per-stage prompt shrinks to: objective + data contract +
files + the stage's pending specs. (The full prompt template in
`delegation.md` still applies when dispatching a `general-purpose` subagent
instead.)

## Per-stage loop with the implementer

1. Baseline benchmark (3a) — optionally dispatch `benchmarker` for a real dig.
2. Dispatch `implementer` for the stage. Read its **status line**:
   - `DONE` → go to review.
   - `DONE_WITH_CONCERNS` → address correctness concerns *before* review.
   - `NEEDS_CONTEXT` → supply exactly what's missing, re-dispatch.
   - `BLOCKED` → supply context, upgrade the model, split the stage smaller, or
     escalate to the user.
3. **Independently verify** — do not trust the report. Read the diff yourself
   and run the stage's specs (the `verify` skill's evidence rule applies).
4. **Route deficiencies by kind** (implement §3d): *minor* (typos, namespacing,
   simple bug, missing docs) → a fresh narrow-scope subagent ("fix exactly X"),
   keep the draft; *major* (wrong implementation) → discard the draft, fix the
   prompt, re-dispatch to a more capable model. On a failed attempt, bump one
   tier and retry once, then escalate to the user.

## Two-stage review — correctness before quality

Review checks correctness first so you don't polish code that may need
redesign. For a full review (end of implementation), dispatch `reviewer`: it
does Stage 1 (conformance + data soundness) itself and delegates Stage 2 (code/test
quality) to `critical-code-reviewer` / `review-testing`. When the reviewer
returns findings, the **same `implementer`** fixes them and resubmits for
re-review. Repeat until Approve — skipping the re-review defeats the gate.

## Open questions (wait-and-see)

- The `reviewer` agent currently **embeds** its checklist rather than loading
  the `review` skill (the skill is `disable-model-invocation`, which blocks
  subagent preloading). This works; leave it. *If* the duplication starts to
  bite, the fix is to flip `review` to `disable-model-invocation: false` and
  add "DO NOT CALL THIS YOURSELF unless asked" to its description — but note
  that re-enables auto-activation, and `review` carries `model: opus`, so a
  stray activation could shift a turn's model. Not worth pre-solving until it's
  a real problem.
- Confirm how this plugin exposes `agents/` once installed via the marketplace
  (skills are listed in `marketplace.json`; agent discovery needs verifying).
