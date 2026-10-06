# stellwerk's gate shims today, and what Rust needs

Research hand-back, 2026-10-06 (sonnet sub-agent, read-only), saved by the main session. Checked
at stellwerk HEAD 2f2c1ec (branch v8-migration, clean tree).

**Premise check.** There is no set of separate thin shims. There is one module, and werkbank does
not call it yet.

## 1. What stellwerk is

It lives at /Users/rjs/dev/stellwerk. It is a stdlib-only CLI that runs a project's tests and
returns a compact verdict, with a TDD expectation model and content-addressed receipts
(README.md:1-30).

## 2. The shim

One module, `src/stellwerk/gate.py` (840 lines; commits bbf316e, 4f665d3, 0297a21, 23-24 Sep).
Usage: `python -m stellwerk.gate lint|types|tests|mutate|cmd [--out] [--log-dir] [--baseline]
[--write-baseline] [--top N] [-- extra args]` (gate.py:592-625, 821-836). It is not in cli.py.

- lint: `ruff check --output-format json`, default targets src and tests (gate.py:62-105; parse at 293).
- types: `pyright --outputjson` (parse at 309). mypy is also known (parse at 342).
- tests: `pytest -q` with junit xunit1 (gate.py:93-105; parse at 378).
- mutate: runs werkbank's own harness through a configured `command` (gate.py:435-541); reads
  run.py's ledger overlaid by confirm.py's results.
- cmd: any argv after `--`; a nonzero exit gives exit 1.
- Output: one JSON object on stdout or in `--out`, with keys tool, role, argv, status, exit,
  counts{total, by_code, summary, new}, items, log_path, baseline, duration_s (gate.py:760-775).
- Exit codes: 0 clean, 1 items remain (or new items against a baseline), 2 error (gate.py:787-818).
- The full raw log goes to `.stellwerk/logs/<stem>-gate-<tool>.txt`.
- Not present: affected-test selection, coverage, `schema:1`, `--scope`, `describe`.
  V8.3-SCOPING §9.7 (lines 1272-1280) lists these as still to do; STAGE-8.md:1378 confirms.
- Affected selection and attestation are werkbank's own Python-only dev tooling:
  `scripts/v8/dev/affected.py` (492 lines, ast import graph, hard-coded pytest) and
  `dev/attest_run.py` (480 lines). Receipts go to `~/.cache/werkbank/{affected,attest}/<tree key>.json`.

## 3. How werkbank calls it

It does not. STAGE-3.md:1206 and STAGE-9b.md (about line 160) both say no werkbank code invokes
the shim, and no call sites were found in scripts/. Only `python -m stellwerk status` appears
(scripts/gate.py:8, scripts/test-gate.py). The nested-result contract is in V8.3-SCOPING §3.1
(lines 194-246): werkbank nests the shim's JSON verbatim under `gate` and sets its own `verdict`.
Routing runners through the shim is F-61, deferred until after H. STAGE-9b.md designs a "gate
mode" (a `--spec` runner spec, results as a CTRF JSON file, a vendored zipapp, a
`stellwerk_call.py` client); neither that client nor a vendor directory was found in the main
tree or on s8c-int, so 9b looks unbuilt.

## 4. Language abstraction

Partial. `_DEFAULT_TOOL_BY_LANGUAGE` has only python (gate.py:31-33); `[gate.ROLE]
tool/args/command/timeout` in `.stellwerk.toml` overrides it. `_KNOWN_TOOLS` is a closed set
(gate.py:30), and `_build_argv` and the parsers hard-code the tools. The core
`runner_pytest`/`runner_testthat` and `lang_r.py` are a real adapter seam. `KNOWN_LANGUAGES` is
{python, r} (config.py:19).

## 5. Rust equivalent

- Add `rust` to the language table: lint = clippy with JSON messages, types = cargo check with
  JSON messages, tests = cargo-nextest (junit or libtest JSON). Add parsers for these.
- Add a mutate tool wrapping cargo-mutants `--in-diff`; today mutate is hard-wired to werkbank's
  Python harness.
- Per-crate affected selection needs a new `affected` role.
- Awkward: `_KNOWN_TOOLS` and `_build_argv` are closed; ruff and pyright targets are hard-coded;
  `_env_with_venv` is Python-only; the tests parser is junit-only; no `--scope`; no `schema:1`.
