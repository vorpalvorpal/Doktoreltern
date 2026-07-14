---
name: review
description: >
  Final review of a completed change to a data-engineering R project, against
  its plan. Use when implementation is finished and committed and you need a
  judgement before merge. Reviews plan-conformance and data soundness, and
  delegates general code- and test-quality review to the existing reviewer
  skills.
disable-model-invocation: true
model: opus
effort: high
---

# Reviewing a data-engineering change against its plan

This is the judgement at the end of the flow. It answers: *does the committed
code do what the plan said, is the data handling sound, and is it clean enough
to merge?* It produces findings and a verdict; the **`implement`** skill owns
the merge/close decision that follows.

Don't re-derive general code- and test-quality heuristics here — **delegate**
them (section 3) and spend your own effort on the two dimensions only this
skill covers: conformance to the plan, and the data.

## 1. Conformance to the plan

Read the plan, then the diff for the whole change (`git diff main..HEAD`).

- For each behaviour the plan specified, confirm there is a **passing** spec
  for it. List any plan behaviour with no spec, or any pending spec for
  behaviour the change claims to deliver.
- Produce a **divergence list**: every place the implementation differs from
  the plan — different approach, added scope, dropped requirement, changed
  interface or delivered schema. For each, note whether it's an improvement, a
  regression, or neutral, and why. If it fully matches the plan, say so
  plainly.
- Divergences aren't automatically bad — but they must be *surfaced*, never
  silent. **An undocumented divergence is ALWAYS a finding — no exceptions.**

## 2. Data soundness

The dimension the general reviewers can't check. Go stage by stage:

- **Faithful to the contract.** Does the code implement the schema and
  business rules the plan cited, correctly? Spot-check against the plan's
  data-contract section. Watch for columns silently renamed, types weakened
  (int → dbl → chr), keys not actually enforced.
- **Row accounting.** Every join and filter accounts for its rows — fan-out
  proven impossible or bounded, fall-out either asserted zero or routed to
  quarantine. No row disappears without a reason the code states.
- **Missingness discipline.** `NA` vs `""` vs `"NULL"` vs sentinel values
  handled per the plan's decision, consistently, at ingestion — not
  re-litigated stage by stage.
- **Time and locale.** Timestamps carry explicit timezones (stored UTC);
  parsing declares formats and encodings; nothing depends on the session
  locale.
- **Idempotence and provenance.** Raw data untouched; re-running is safe;
  duplicate/late deliveries handled as documented; stochastic steps seeded.
- **Reconciliation.** Control totals asserted where the plan named them; the
  delivered output validates against its contract.
- **Justification and sources.** Non-obvious cleaning/business rules carry a
  comment with the reasoning and a source.
- **Integrity not traded for speed.** Confirm no optimisation silently
  changed the output; behaviour-changing shortcuts were deferred to the user,
  not applied.

## 3. Delegate general quality

- **Code quality** → invoke the **`critical-code-reviewer`** skill on the diff.
- **Test quality** → invoke the **`review-testing`** skill (it will use
  `testing-r-packages` for R conventions).

Summarise their findings in your report using the same severity tiers below;
don't repeat their analysis line by line.

## 4. Performance

Confirm the plan's benchmarks were run, before/after numbers were captured, and
the deferred-optimisations list is complete and accurately describes each
trade-off. Flag any unexplained regression.

## Severity tiers

Use the same tiers as the reviewer skills, so findings compose cleanly:

1. **Blocking** — data corruption or loss, rows dropped/duplicated silently,
   wrong business rule, an undocumented divergence that changes the delivered
   contract.
2. **Required** — unhandled edge case the plan named, missing source for a
   non-obvious rule, missing spec for a claimed behaviour, unasserted
   reconciliation the plan required.
3. **Suggestions** — better formulations, clarity, maintainability.
4. **Noted** — minor style; mention once.

## Report format

```
## Summary
[BLUF: is the change correct, faithful to the plan, and ready?]

## Plan conformance
[Divergences (intended vs actual), or "matches the plan". Behaviours with
no passing spec.]

## Data soundness
[Findings from section 2, with R/file:line references and the contract
checked against.]

## Code quality
[Condensed findings from critical-code-reviewer.]

## Test quality
[Condensed findings from review-testing.]

## Performance
[Benchmark before/after; deferred-optimisations list check.]

## Verdict
Request Changes | Needs Discussion | Approve
```

Use `file:line` references for every finding. "Approve" means no blocking
issues after a rigorous review, not perfection.

## Finalize — merge and close (only after Approve)

`/review` is the last phase, so the merge/close decision lives **here**.

- **Request Changes / Needs Discussion** → do not merge. Point the user at the
  phase that fixes it (`/implement` for code, `/tests` for a missing spec) — and
  for a major/data-contract problem, back to `/plan` (which decides whether to
  return to `/whiteboard`).
- **Approve** → present the verdict and **ask whether to merge and close**,
  listing any outstanding reasons not to. Only after an explicit **yes**:
  1. open a PR linking the issue (`gh pr create`),
  2. merge it (`gh pr merge`),
  3. add the divergence list as an issue comment if there was one,
  4. close the issue.

Never merge on your own initiative — the explicit yes is required.

## Next step

> Review complete — verdict: <…>. If approved and you're ready, I'll open the
> PR, merge, and close the issue. Otherwise, here's what to address and which
> command to run next.
