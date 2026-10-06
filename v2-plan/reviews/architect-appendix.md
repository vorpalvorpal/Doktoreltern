# Architect: appendix

§A is the prior-art search behind the flow section of `architect.md`. §B is the schema sketch in full.

## A. Prior art on how agent-run builds are structured

One sonnet sub-agent searched the web on 2026-10-06; its raw report is `scratch/architect/prior-art-raw.md`.
Pages were read through a summarising fetch, so quotations are as relayed. M = has numbers, R = a
practitioner's account, O = opinion. I did not re-check the sources.

**No source measures one ordering against another.** No controlled comparison of skeleton-first against
bottom-up was found, for agents or otherwise; nor any study of seam tests written before unit code; nor any
figure on crate size or compile time in agent builds; nor a measured comparison of structured against
markdown task state. What follows is therefore reported practice.

| Source | What it did | What it reports |
|---|---|---|
| Anthropic, "Effective harnesses for long-running agents", Nov 2025 (R) | A first session writes a feature list (JSON, every entry `passes: false`), a progress file and a start script. Each later session takes one user-visible feature, tests it end to end, commits. | Failures named: building everything at once; declaring done early; marking a feature passed with no end-to-end test. Agents may change only the `passes` field. |
| Anthropic, "Building a C compiler with parallel Claudes", Feb 2026 (R, some M: about 2,000 sessions, about 100k lines of Rust) | Work divided by failing test area against an existing test suite; a fresh container per session; progress files. | "The task verifier must be nearly perfect, otherwise Claude will solve the wrong problem." New features "frequently" broke existing ones. For the kernel, GCC compiled a random subset of files so a failure could be located. Parallel agents fixed the same bug and overwrote each other. |
| Cursor, "Scaling agents", Jan 2026 (R) | Planners divide top-down; workers do not coordinate; a judge decides whether to continue; each cycle starts fresh. | Flat self-coordinating agents fell to the throughput of two or three; an integrator role was a bottleneck and was dropped. |
| Huntley, "Ralph", 2025 (R/O) | One item per loop, a fresh process each loop, a plan file and specs on disk. | No measurements. |
| spec-kit and Kiro (tool documents) | spec-kit: set-up, shared foundation, then one phase per user story. Kiro: requirements, design, tasks as three files. | No measurements. |
| E2EDev, arXiv 2510.14509 (M) | Benchmark of role-pipeline agents. | For MetaGPT, 44% of failures were inconsistent code across files. |
| "Constraint decay", arXiv 2605.06445 (M) | Multi-file backend tasks. | About 30 points of pass rate lost as structural constraints accumulate; data-layer defects lead. |
| Contract-Coding, arXiv 2604.13100; SEMAP, arXiv 2510.12120 (M, self-reported) | A contract as single source of truth. | Weak support for contract-first: own benchmarks, no clear baseline. |
| beads (Yegge) (R) | Issue graph: first JSONL in git plus a SQLite cache, later Dolt. | Left markdown plans because they had no dependencies and piled up. Left JSONL plus SQLite over merge conflicts and last-write-wins between many writers; the database migration brought its own faults. |

**What I take from it for §5.**
1. Every large reported success worked feature by feature against a whole that already ran. Bottom-up by
   package is unsupported, not refuted.
2. The one factor a source calls decisive is a whole-system check that can be trusted. For the pipeline that
   is an end-to-end run on sample data into DuckDB with expected tables, present from the first day.
3. The reported integration failure is new work breaking finished work, so each unit's gate must rerun the
   seam and end-to-end tests, not only its own.
4. Parallel writers on one tree collided in two of three accounts. Disjoint write scopes; serial builds.
5. A fresh context per small unit with state on disk is the common pattern, which supports the reset.
6. State: a flat structured file with a fixed schema and "change only the status" has the most support.
   beads' move to a database was driven by many writers merging, which a sole writer does not have.
7. The data layer is where agents fail most in the one measured study: test against a real DuckDB.

## B. Schema sketch

Conventions: the filename is the id; every file is written whole by `lst` with a canonical serialiser (sorted
keys, fixed formatting); a field ending in an id prefix is an edge the lint resolves. Stable items sit in
`spec/` and `plan/`; changing items sit beside them in files of their own; machine-local run state sits in
`run/`, outside git.

```
leitstand/
  spec/   signed.toml                 digest of the signed item set, date
          items/S-012.toml            stable
          questions/Q-003.toml        changing
          notes/N-0007.toml           changing
  plan/   interfaces/I-004.toml       stable (points at code)
          packages/P-2.toml           stable
          units/U-2-03.toml           stable in intent, but edited by plan faults: kept out of the prefix
  state/  units/U-2-03.toml           changing: one file per unit
          findings/F-0101.toml        changing
          groups/G-0012.toml          changing
  run/    cuts.toml  hold.toml  kept-messages.toml  intents/  attest/<tree key>/<tier>.json  usage.jsonl
```

```toml
# spec/items/S-012.toml
id = "S-012"
title = "Re-running a load leaves the table unchanged"
kind = "behaviour"                 # behaviour | interface | numeric | non-functional
signed = true
needs = ["S-003"]
text = """..."""
[check]
form = "property"                  # property | example | contract | reference | none
tolerance = ""                     # numeric items only
reference = ""                     # path of a fixture holding the reference result
[[decision]]
what = "idempotence is judged on row content, not on row order"
why = "DuckDB gives no order without ORDER BY"

# plan/interfaces/I-004.toml
id = "I-004"
kind = "table"                     # trait | type | table | file-format | cli
declared_in = "crates/contracts/src/schema.rs::ReadingsRow"
producer = "U-2-03"
consumers = ["U-3-01", "U-3-02"]
covers = ["S-012"]

# plan/units/U-2-03.toml
id = "U-2-03"
package = "P-2"
crate = "load"
files = ["crates/load/src/upsert.rs"]      # the write scope for G1; disjoint across units
test_binary = "u_2_03"                     # crates/load/tests/u_2_03.rs
covers = ["S-012"]
provides = ["I-004"]
uses = ["I-002"]
after = ["U-2-01"]                         # direct edges only

# state/units/U-2-03.toml
id = "U-2-03"
status = "open"                    # open | blocked | done | reopened
step = "write-code"                # a step named in flow.toml
commit = ""
issues = ["G-0012"]
[attest]
T1 = ""                            # tree key; the result itself is run/attest/<key>/T1.json
[intent]                           # written by `lst step begin`, cleared by `lst step end`
step = "write-code"
dispatches = [{ role = "implementer", agent = "…", started = 2026-10-06T19:22:53Z }]

# state/findings/F-0101.toml
id = "F-0101"
from = { unit = "U-2-03", step = "audit-code", role = "auditor", round = 1 }
target = "code"                    # code | tests-weak | tests-wrong | plan | spec | harness | missing
cites = ["S-012"]
where = "crates/load/src/upsert.rs:88"
claim = "one sentence"
evidence = { test = "crates/load/tests/f_0101.rs" }      # or mutant = …, or prose = """…"""
intake = { result = "accepted", reason = "" }
group = "G-0012"

# state/groups/G-0012.toml
id = "G-0012"
root_cause = "one sentence"
members = ["F-0101", "F-0104"]
ruling = "accept"                  # accept | reject | plan-fault | spec-question
reason = "…"
class_test = "crates/load/tests/g_0012_sites.rs"         # finds every site
fix_commits = []
fix_cycles = 0
status = "open"

# spec/notes/N-0007.toml  (same shape at package and unit level)
id = "N-0007"
level = "spec"
applies_to = ["P-2", "I-004"]
from = "U-2-03"
text = "…"
retire_when = "DuckDB is linked prebuilt"
```

**Two functions over these files.** `stable(level)` renders, in a fixed order, the spec items and signed
digest (level spec) or the package file, its interface items and one line per unit (level package), and ends
with the digest of what it rendered. `delta(unit)` renders the rule card, the unit plan, the interface items
the unit provides or uses, the unit's state, open groups against it, notes whose `applies_to` reaches it, open
questions, and Robin's kept messages. Both are pure; neither reads the conversation.

**Why interfaces are items.** The draft has each package plan declare what it consumes and produces and
lints that the two declarations match. Two declarations of one thing is the fault being linted for. One item
with one producer and a list of consumers has nothing to mismatch, and its content is code that the compiler
checks.
