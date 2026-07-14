---
name: tests
description: >
  Turn an approved implementation plan into an executable behaviour
  specification for a data-engineering R project — describe()/it() tests that
  are the plan made verbose. Use after a plan is approved and before (or
  alongside) implementation, when converting planned behaviour into tests.
disable-model-invocation: true
model: sonnet
effort: high
---

# Turning a plan into a behaviour specification

The tests are the plan, expanded. The **plan** skill specified, for each
function or pipeline stage, the behaviours it must exhibit and the *integrity
basis* for each (a schema, an invariant, a reconciliation, a known-answer
fixture, an idempotence property, an edge case). Your job is to turn that raw
material into runnable testthat specs: you own the `describe()/it()` structure
and the concrete assertions; the plan owns the contract. Do not invent
behaviour the plan didn't specify — if you find yourself needing to, the plan
is incomplete: stop and revisit it with the user.

This skill covers the **workflow** of going plan → tests. For testthat
mechanics — file layout, expectations, fixtures, snapshots, mocking, withr
cleanup — defer to the **testing-r-packages** skill and only summarise here.

## 1. Construct the skeleton from the plan

**First, read the existing test file if there is one.** You are often *adding*
to `test-{name}.R`, not writing it fresh. Check whether any existing test
already covers a behaviour you were about to specify — if so, don't duplicate
it; extend or reference it. Place new specs next to similar existing ones,
match the file's style, and don't break or restructure what's already passing.

- One test file per code file: `R/{name}.R` → `tests/testthat/test-{name}.R`.
- One `describe("fn()", { ... })` per function the plan covers.
- Turn each behaviour bullet in the plan into one `it("...")` whose
  description restates the behaviour in plain language — this is the
  ubiquitous language tying tests back to the plan. Behaviour, not
  implementation.
- Leave each `it("...")` **pending** (no body) at this stage. Pending specs
  report as SKIPPED and become the checklist the implement skill burns down.
- Add an `it()` for every edge case and every error condition the plan listed.
- Where the plan **noted an existing coverage gap**, add those specs too and
  mark them (a comment) as characterising *existing* behaviour, so reviewers
  can tell them from the new work.

## 2. Test observable behaviour, not implementation

Each `it()` asserts what the function *does*, never how. Do not reach into
internal helpers, private state, or intermediate values. If a behaviour can
only be checked by inspecting internals, the API is probably wrong — flag it.

Prefer specific expectations over `expect_true()`/`expect_false()`, which give
poor failure messages. For errors and warnings use
`expect_snapshot(error = TRUE)` / `expect_snapshot()` so the full text is
reviewable, and assert a **classed** condition where the plan specified one.

## 3. Make the integrity oracle concrete

The plan states an integrity basis for each behaviour. Choose the matching
oracle and turn it into a real assertion — picking the encoding, fixtures, and
expected values is your job, not the plan's:

- **Schema** — assert the output's contract directly: column names, types,
  key uniqueness. Encode the plan's schema, not whatever the code returns.

  ```r
  it("returns one row per delivery line with the contracted schema", {
    out <- ingest_deliveries(fixture_path("delivery-ok.csv"))
    expect_named(out, c("delivery_id", "delivered_at", "sku", "qty"))
    expect_s3_class(out$delivered_at, "POSIXct")
    expect_identical(attr(out$delivered_at, "tzone"), "UTC")
    expect_false(anyDuplicated(out$delivery_id) > 0)
  })
  ```

- **Invariant / row accounting** — assert the property directly, ideally
  across several fixtures.

  ```r
  it("lands every input row in exactly one of output or quarantine", {
    res <- ingest_deliveries(fixture_path("delivery-mixed.csv"))
    n_in <- nrow(readr::read_csv(fixture_path("delivery-mixed.csv")))
    expect_identical(nrow(res$output) + nrow(res$quarantine), n_in)
  })
  ```

- **Reconciliation** — assert against the control total, citing its source in
  a comment.

  ```r
  it("matches the manifest control total", {
    # control total from the provider's manifest sidecar (per plan §2)
    res <- ingest_deliveries(fixture_path("delivery-ok.csv"))
    manifest <- read_manifest(fixture_path("delivery-ok.manifest.json"))
    expect_identical(sum(res$output$qty), manifest$total_qty)
  })
  ```

- **Known-answer** — a small, hand-checkable fixture in
  `tests/testthat/fixtures/` and its exact expected tidy output. Keep the
  fixture ugly on purpose — real encodings, real missingness markers.

- **Round-trip / idempotence** — `expect_identical(read(write(x)), x)`;
  re-running on the same input adds nothing:

  ```r
  it("re-ingesting the same delivery is a no-op", {
    first  <- ingest_deliveries(fixture_path("delivery-ok.csv"))
    second <- ingest_deliveries(fixture_path("delivery-ok.csv"))
    expect_identical(second, first)
  })
  ```

- **Property-based** — generate inputs and assert the property holds. Set a
  seed so failures are reproducible; report the seed in the test.

## 4. Reproducibility and edge cases

- **Seed every stochastic test. No exceptions.** Use `withr::local_seed()`
  (or `set.seed()`); never rely on ambient RNG state. An unseeded test that
  flakes is worse than no test — every time.
- Give each edge case from the plan its own `it()`: empty/zero-row input,
  duplicate keys, `NA` vs `""` vs `"NULL"` in every nullable column, schema
  drift (an extra column, a missing column, a renamed column), bad encodings,
  ambiguous dates, DST-boundary timestamps, and duplicate/late deliveries.
  Assert the *documented* behaviour (propagate `NA`? error? quarantine?), not
  whatever the code happens to do.
- Fixtures live in `tests/testthat/fixtures/` and are small enough to eyeball
  — a known-answer fixture nobody can hand-verify is not a known answer.

## 5. Keep tests self-sufficient

Each `it()` contains its own setup, execution, and assertions; clean up side
effects with `withr::local_*`. Repetition between specs is fine — clarity
beats DRY in tests. (See **testing-r-packages** for fixture and helper
patterns when setup is genuinely shared across a `describe()` block.)

## 6. Confirm the specification fails for the right reason

Before implementation begins, run the suite:

```r
devtools::test()
```

- Pending specs report as SKIPPED — expected.
- Implemented specs that fail should fail because the behaviour is *absent*,
  not because the test is malformed. Read each failure to confirm.
- Gap-filling specs for existing behaviour should **pass** now; if one fails,
  you have found a pre-existing bug — surface it to the user rather than
  silently adjusting the test.

The pending specs are the behaviour checklist the implement step turns green,
stage by stage.

## Next step

Once the behaviour spec is written and failing for the right reasons, offer the
next command:

> Behaviour spec ready (N pending specs). Run `/implement` to start turning
> them green?
