# Stage 3 — linter: delete the platform-derived checks

The two consistency checks that diff in-text markers against **GitHub platform
state** (sub-issue edges, aspect labels) are meaningless once there is no
platform. Delete them. Every other check (I3–I9, I12, I13) already ignores the
`platform` argument and stays as-is.

Read CONTRACT.md → A5 first. This stage edits `ctx_core.py` only (plus
`_platform_from` in `ctx_lint.py` if Stage 2 did not already gut it — coordinate
via the drift log).

---

### R1 — delete `_check_i1`

I1 (`ctx_core.py` ~873) diffs `model.tree_edges` (from `Part-of` markers) against
`platform.subissue_edges` (from GitHub). With edges sourced **only** from markers,
there is nothing independent to diff — it is vacuous.

- Delete the `_check_i1` function and its `"I1": _check_i1,` entry in `CHECKS`.

### R2 — delete `_check_i2`

I2 (`ctx_core.py` ~899) diffs aspect markers against `aspect:*` labels. Aspect
labels are no longer stored (CONTRACT → node.md: `labels` holds only `dormant`).
Vacuous — delete.

- Delete the `_check_i2` function and its `"I2": _check_i2,` entry in `CHECKS`.

### R3 — remaining checks unchanged; `Platform` passed empty

I3–I9, I12, I13 take `(model, platform)` but **do not read `platform`** (verified:
only I1/I2 reference `platform.*`). Leave their signatures and bodies untouched so
their tests don't churn. `Platform` is now vestigial — it is constructed empty by
`ctx_lint._platform_from` (`Platform(set(), {}, False)`).

- Do **not** remove the `platform` parameter from the check signatures or from
  `run_checks` — that would churn 9 functions and `test_ctx_checks.py` for no
  behavioural gain. Leave a one-line comment at the `Platform` dataclass noting it
  is vestigial post-migration, slated for a later cleanup.

### R4 — `ctx_lint._platform_from`

If Stage 2 already replaced its body with `return ctx_core.Platform(set(), {},
False)` and removed the `gh` calls, this is done — just confirm. Otherwise do it
here: delete the `gh issue view --json parent` loop and the `_has_gh` probe;
return an empty `Platform`.

---

## Criteria

- `ctx_core.CHECKS` no longer contains `"I1"` or `"I2"`; it contains
  `I3,I4,I5,I6,I7,I8,I9,I12,I13`.
- The full existing check suite passes with I1/I2 removed. **Delete the I1/I2
  test cases** in `test_ctx_checks.py` / `test_ctx_lint.py` (they assert
  platform-diff behaviour that no longer exists) — do not leave them skipped;
  remove them and note the deletion in the drift log.
- `ctx_lint <clean-store>` exits `0`; a store with a real I13 violation (a
  `correct` node with a non-dormant non-`correct` child) exits `1`.
- No `platform.subissue_edges` / `platform.labels` reference remains anywhere
  except the (empty) `Platform` construction and the dataclass definition.
- Grep-clean of `gh` within `ctx_lint.py`.

## Watch out

- I3–I13 are numbered with a gap (no I10/I11 in `CHECKS`). Do not "fix" the
  numbering — the ids are stable identifiers that appear in `Finding` output and
  possibly in issue-body references. Only remove I1 and I2.
