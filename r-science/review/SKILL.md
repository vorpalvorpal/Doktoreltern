---
name: review
description: >
  Final review of a completed change to a scientific R package, against its
  plan. Use when implementation is finished and committed and you need a
  judgement before merge. Reviews plan-conformance and scientific soundness,
  and delegates general code- and test-quality review to the existing
  reviewer skills.
---

# Reviewing a scientific change against its plan

This is the judgement at the end of the flow. It answers: *does the committed
code do what the plan said, is it scientifically sound, and is it clean enough
to merge?* It produces findings and a verdict; the **`implement`** skill owns
the merge/close decision that follows.

Don't re-derive general code- and test-quality heuristics here — **delegate**
them (section 3) and spend your own effort on the two dimensions only this
skill covers: conformance to the plan, and the science.

## 1. Conformance to the plan

Read the plan, then the diff for the whole change (`git diff main..HEAD`).

- For each behaviour the plan specified, confirm there is a **passing** spec
  for it. List any plan behaviour with no spec, or any pending spec for
  behaviour the change claims to deliver.
- Produce a **divergence list**: every place the implementation differs from
  the plan — different approach, added scope, dropped requirement, changed
  interface. For each, note whether it's an improvement, a regression, or
  neutral, and why. If it fully matches the plan, say so plainly.
- Divergences aren't automatically bad — but they must be *surfaced*, never
  silent. An undocumented divergence is a finding.

## 2. Scientific soundness

The dimension the general reviewers can't check. Go method by method:

- **Faithful to the source.** Does the code implement the equation/method the
  plan cited, correctly? Re-derive or spot-check against the reference. Watch
  for transcription errors, dropped terms, wrong signs, and off-by-one in
  indices or limits.
- **Constants and units.** Are physical/statistical constants right and
  consistent in units? Any implicit unit assumptions documented?
- **Numerical soundness.** Catastrophic cancellation, overflow/underflow,
  unstable formulations (e.g. naïve variance, `exp` of large numbers,
  near-singular solves). Is a more stable formulation warranted?
- **Edge cases as documented.** `NA`/`NaN`/`Inf`, empty/zero-length input,
  degenerate cases (singular matrix, zero variance, n = 1, boundary values) —
  handled the way the plan and docs say?
- **Reproducibility.** Stochastic code takes/sets a seed; no side effects on
  the global RNG stream.
- **Justification and references.** Non-obvious scientific/statistical choices
  carry a comment with the reasoning and a source.
- **Correctness not traded for speed.** Confirm no optimisation silently
  changed results; behaviour-changing approximations were deferred to the user,
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

1. **Blocking** — wrong science, incorrect results, data corruption, an
   undocumented divergence that changes behaviour.
2. **Required** — unhandled edge case the plan named, missing reference for a
   non-obvious choice, missing spec for a claimed behaviour.
3. **Suggestions** — better formulations, clarity, maintainability.
4. **Noted** — minor style; mention once.

## Report format

```
## Summary
[BLUF: is the change correct, faithful to the plan, and ready?]

## Plan conformance
[Divergences (intended vs actual), or "matches the plan". Behaviours with
no passing spec.]

## Scientific soundness
[Findings from section 2, with R/file:line references and the reference
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
issues after a rigorous review, not perfection. Hand the verdict and the
divergence list back to the `implement` skill, which presents them to the user
and drives the merge/close decision — `review` never merges on its own.
