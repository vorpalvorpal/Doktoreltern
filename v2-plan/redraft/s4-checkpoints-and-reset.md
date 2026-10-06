# Redraft of §4.1 and §4.2 (SYNTHESIS actions 1, 5, 13, 14, 20)

Replacement text, then the edits other sections need (part 3) and the cold-reader test (part 4).
Every file body, id, commit and time is a mock for the running example, a pipeline that loads
station readings from CSV into DuckDB. **[P]** = proposed number, **[E]** = estimate,
**UNTESTED** = no spike has run it.

### 4.1 Checkpoints

**Kept, on every lens's advice [decided]:** one item per file; TOML; `lst` the only writer; state
rewritten whole with git as the history; no decision log (a decision is a field on the item it
changes); stable items apart from changing ones. The schema is the Rust types `lst` deserialises
into, so loading a file is the first lint.

```
leitstand/
  spec/items/S-012.toml        stable    one requirement
  spec/signed.toml             stable    digest of the signed item set, date
  spec/questions/Q-003.toml    changing  a decision waiting for Robin; names what it parks
  plan/packages/P-2.toml       stable    plan entry: goal, crates, constraints
  plan/interfaces/I-004.toml   stable    a pointer at Rust code, its producer and consumers
  plan/units/U-2-03.toml       changes   unit plan; edited by plan faults, so not in the prefix
  state/units/U-2-03.toml      changing  one per unit; package status is a fold over them
  state/findings/F-0101.toml, state/groups/G-0012.toml    changing  a finding; its group and ruling
  notes/N-0007.toml            changing  one process note
  run/    machine-local, never in git: cuts.toml, reset-pending.toml, hold.toml,
          kept-messages.toml, attest/<tree key>/<tier>.json, usage.jsonl
```

| Changed from the first draft | Why |
|---|---|
| **State is per unit**; units build one at a time in version 1 | A `state.toml` per package was the one file two writers would both rewrite. Four in parallel gained about 6% of run 3. |
| **An intent record per step, with the outcome of each dispatch.** `lst step begin` writes it before any dispatch; each dispatch is recorded when made and when it returns | A reader can tell a finished step from a half-finished one. The Bar Raiser's cold reader could not. |
| **The expected-red set is computed.** A unit plan names the tests it turns green; `lst expect` folds plans and states: a test is red by plan while its unit is not done, and all others must be green | A gate result becomes "matches the expectation". Nothing is remembered. |
| **Write scope by role**, in the unit plan | The implementer must not edit the tests it is judged by. |
| **Interfaces are Rust code**, in the tree with `todo!()` bodies before any unit starts; the TOML item only points at the code and names one producer | The compiler checks the rest. A second declaration in TOML is the fault being linted for. |
| **Notes are bounded:** one level, one file each, at most 20 open **[P]**; a note cites a test or commit, may not interpret a spec item, and says what retires it | The draft's notes only grew. Three promoted levels is the other option (D13). |

**The files, with content.** Every file begins `schema = 1`, left out below.

```toml
# spec/items/S-012.toml
id = "S-012"
title = "Loading a file twice stores each reading once"
status = "signed"                  # draft | signed | amended | question
requirement = "When the same readings file is loaded twice, `readings` holds each source row once."
class = ["lifecycle"]              # owes a re-run test
inputs = ["csv-file"]              # owes a property test over generated files
mirrors = "duckdb-sql"             # owes a differential test against `reference`
reference = "fixtures/S-012.sql"
failure_shapes = ["empty file"]    # owes one test per shape
needs = ["S-003"]
silent_on = ["a source row whose value changed between the two loads"]
[[decision]]
text = "a reading's key is (station_id, read_at)"
rejected = ["hash of the whole row: breaks when columns are reordered"]
by = "robin"                       # `orchestrator` sets status to `amended`
[[example]]
row = { given = "readings.csv with 3 rows, loaded twice", then = "readings has 3 rows" }
accepted_by = "robin"
# plan/interfaces/I-004.toml       the definition is the code; this file holds only the edges
id = "I-004"
kind = "table"                     # trait | type | table | file-format | cli
declared_in = "crates/contracts/src/schema.rs::ReadingRow"
producer = "U-2-03"
consumers = ["U-3-01"]
# plan/packages/P-2.toml           units are found by their `package` field, not listed here
id = "P-2"
title = "Load staged readings into DuckDB"
goal = "Staged rows reach `readings` once each, and a report says what was read and written."
crates = ["load"]
after = ["P-1"]
constraints = ["one DuckDB connection per run", "input values reach SQL only as bound parameters"]
# plan/units/U-2-03.toml
id = "U-2-03"
package = "P-2"
title = "Upsert staged rows into `readings`"
crate = "load"
covers = ["S-012"]
provides = ["I-004"]
uses = ["I-002"]
after = ["U-2-01"]                 # direct edges only
turns_green = ["u_2_03::reload_keeps_row_count", "u_2_03::prop_reload_is_idempotent",
  "u_2_03::diff_matches_duckdb_sql", "u_2_03::empty_file_writes_nothing",
  "seam_stage_load::staged_rows_reach_readings"]
[scope]
writer = ["crates/load/tests/u_2_03.rs"]
implementer = ["crates/load/src/upsert.rs"]
auditor = ["crates/load/tests/f_*.rs"]
# state/units/U-2-03.toml          caught mid-step: the session died after the dispatch
id = "U-2-03"
status = "open"                    # open | blocked | done | reopened
step = "write-code"
commit = "4be19d2"                 # the last step-end commit of this unit
issues = []                        # open groups against this unit
attest = { T1 = "4be19d2" }        # tree key; the result is run/attest/4be19d2/T1.json
counters = { redos = 0, nudges = 0, audit_rounds = 1 }     # the limits are in flow.toml
[intent]                           # written by `lst step begin`; removed by `step end` or `abandon`
step = "write-code"
base = "4be19d2"
began = 2026-10-09T14:02:11Z
[[intent.dispatch]]                # outcome: running | returned | failed
role = "implementer"
agent = "a7f3"
outcome = "running"
# state/findings/F-0101.toml
id = "F-0101"
from = { unit = "U-2-03", step = "audit-tests", role = "auditor", round = 1 }
target = "tests-weak"              # code | tests-weak | tests-wrong | plan | spec | harness
cites = ["S-012"]
where = "crates/load/tests/u_2_03.rs:21"
claim = "The generator makes one-row files only, so the property never sees a repeated key."
evidence = { prose = "`arb_file` draws its row count from 1..=1" }    # or test = …, mutant = …
born_of = "4a0c3e1"                # the commit that introduced the fault
intake = "accepted"
group = "G-0012"
# state/groups/G-0012.toml         the ruling is on the group, not the finding
id = "G-0012"
root_cause = "Test generators in `load` were written for the smallest case and never widened."
members = ["F-0101"]
against = "U-2-03"
ruling = "accept"                  # accept | reject | plan-fault | spec-question
reason = "S-012 owes a property over csv-file; a one-row file cannot hold a repeated key."
fix_commits = ["4be19d2"]
status = "closed"
# notes/N-0007.toml
id = "N-0007"
applies_to = ["P-2", "I-004"]
from = "U-2-01"
cites = "commit 9d02c7e"
text = "DuckDB returns rows in no fixed order; compare tables as sorted sets, never by position."
retire_when = "P-2 is closed"
```

```rust
// crates/contracts/src/schema.rs: interface I-004, in the tree before any unit starts
pub struct ReadingRow { pub station_id: String, pub read_at: NaiveDateTime, pub value: f64 }
// crates/load/src/upsert.rs: the stub that U-2-03 fills in
pub fn upsert(conn: &Connection, rows: &[ReadingRow]) -> Result<LoadReport, LoadError> { todo!() }
```

**The spec item is Green Hat's shape, not the Architect's (D14) [decided].** `class`, `inputs`,
`mirrors` and `failure_shapes` each name a test the item owes, so lint can check the debt; the
Architect's `kind` plus one `check.form` names one form and no input class. Kept from the
Architect: `needs`, and interfaces and groups as items. Dropped: his `kind`, and Green Hat's test
fingerprints (precedent unconfirmed). The panel's cheap test stands: run part 4 on both shapes.

**Where the checkpoint lives [open, D5].** `run/` is outside git either way.

- **In the product repo, under `leitstand/`** (Bar Raiser). A unit's close and its code are one
  commit; serial units merge nothing. But the tree key must leave `leitstand/` out, and undoing a
  step must restore only the unit's scope, or it undoes state too.
- **Its own small git repo**, found by absolute path, `lst` committing each write (SRE). Product
  branches and resets never touch state. But "unit done" and the product commit are two commits.

Decide by the kill test below, run in both layouts in S1a.

**Write safety [decided].** Every write is temp file, fsync, rename, under one lock file. A new id
is the highest existing id of its kind plus one, taken under that lock. No index is stored: `lst
index` computes it. `lst doctor` (read-only unless `--fix`) checks that files load, ids are unique,
each done unit's commit exists and is attested, cuts are fresh or stale, and lists open intents;
it never invents state. `lst edit <id>` is the only hand edit: copy to the editor, validate,
refuse if invalid, write atomically. `lst restore <file> [--rev]` puts back a version from git.
Text is rendered from parsed values, so `toml_edit` or a canonical serialiser (D6) is free here.

**What `lst lint` checks**, beyond schema and links. Each rule ships with a file that must fail it.

1. Coverage both ways: each signed item is covered by a unit and cited by a test; each test tag
   cites a live item. Test debt: every item has an example; each `inputs` entry has a property
   test, `mirrors` a differential test, each failure shape a test, `lifecycle` a re-run test.
2. One producer per interface; each consumer has a direct `after` edge to it or a seam test;
   `declared_in` resolves to code; no cycles. Within a unit the roles' file sets are disjoint.
3. State agrees with plan and git: done means committed and attested; reopened or blocked names
   its group or question; one open intent at most. An accepted finding has one group, a closed
   group a ruling; counters are within the limits.
4. The signed digest matches, or an answered question covers each difference. Counts of
   `silent_on` entries and of items owing no test go on the page Robin signs.
5. Bounds: open notes; no note whose `applies_to` is all closed; `stable` and `delta` in budget.
   `stable(level)` is byte-identical across two runs; each cut is reported fresh or stale.

Refused, as transitions: done without an attestation; an edit to a signed item without an
answered question; a second open intent; `unit done` when a cited test vanished or gained
`#[ignore]`; rendering when any file fails to load.

**Commands this section needs:** `stable`, `delta`, `expect`, `step begin | dispatch | end |
abandon`, `unit done | block`, `note add`, `lint`, `doctor`, `edit`, `restore`, `index`; `hydrate`
is gone. Property tests: any sequence of commands leaves files that load; `stable` and `delta`
depend only on their inputs. **Kill test:** kill at a random point (also between `unit done` and
the commit, during a fork, during a write), restart from files alone, compare.

### 4.2 The reset

*(Keep the draft's quotation from Robin, both route tables, "Build route F first" and "What Robin
sees and can do", with the cost column labelled "haiku, filler state" and "hydrated text" changed
to "`delta`". Replace the rest with this.)*

**The reset is a replay, not a rebuild.** On route F the session after a reset is a transcript
prefix read from the cache plus one short fresh text. Two pure functions in `lst` render them:

- `stable(level)`, for `spec` and `package`: text that does not change during a unit. It ends
  with a digest of itself.
- `delta(unit)`: everything that does change. It reads the checkpoint files, the run records
  and the git head; never the conversation.

**The stack is three cuts.** The session opens with a one-line root turn; `stable(spec)` is the
next turn, then `stable(package)`. Each asks for the one-word reply `loaded`, so the prefix holds
no model prose. A **cut** is the last row of such a turn. `run/cuts.toml` records, per level, the
session it was made in, that row's id and the digest. Fork ids are remapped, so the id is looked
up in that session, and the session is never pruned while the cut is live.

**A cut is valid when its digest equals the digest of `stable(level)` over today's files.** No
record of which files built which cut is needed. A stale cut is rebuilt from its parent: fork at
the parent cut, submit the new text, record the new cut. It is never submitted again after the
old turn, which would leave both versions in the prefix. A stale spec cut makes the package cut
stale too.

**Unit plans are not in the prefix [decided].** The first draft said both. 14 of werkbank's 24
test-able finds ended in a spec or plan edit, so plan detail is not stable. The package prefix
holds goal, crates, constraints, interface index and one line per unit; the unit plan travels in
`delta`. How often an amendment makes the stack stale is unmeasured (D11): count rebuilds per unit.

**One path** for a step reset, the context-size guard and a restart after a crash:

1. `lst` writes `run/reset-pending.toml`.
2. For `spec`, then `package`: if the cut is stale, rebuild it from its parent.
3. The helper forks at the package cut; the mod resumes the fork, checks session id and message
   count, submits `delta(unit)`, and clears the pending record.

The mod starts it on `step_done`, when context passes a set share of the window, or when a
session starts with a build open; only between turns, and never while a sub-agent runs. Whether
resets come per step or per unit (D10) does not change the path.

**Redo, not resume.** An intent still open after a reset means the step did not end. `delta`
shows it, shows a dispatch without an outcome as lost, and names the rule: abandon and redo. `lst
step abandon` restores the unit's scope to the intent's base commit and counts a redo; at the
limit the unit is blocked. No code continues a half-finished step, so the size guard first asks
the orchestrator to end or abandon its step. (`delta` states which rule applies; the model acts.)

**The rendered text for the example**, at the moment the unit state above was caught:

```
[leitstand stable spec]
Build: readings-ingest. Working directory: /Users/rjs/dev/readings-ingest
This is the signed spec, rendered from the checkpoint files. It does not change during a unit.
If later text in this conversation disagrees with it, stop and say so.

S-003 [signed] A staged file holds one row per line of the source file
  Requirement: When a readings file is staged, each data line becomes exactly one staged row.
  Owes: property test over csv-file; one test per failure shape: empty file, header only.
  Examples: (robin) a file of a header and 3 lines -> 3 staged rows
  Silent on: nothing recorded.
S-012 [signed] Loading a file twice stores each reading once
  Requirement: When the same readings file is loaded twice, `readings` holds each source row once.
  Owes: re-run test; property test over csv-file; differential test against duckdb-sql
    (fixtures/S-012.sql); one test per failure shape: empty file.
  Needs: S-003
  Examples: (robin) readings.csv with 3 rows, loaded twice -> readings has 3 rows
  Decided (robin): a reading's key is (station_id, read_at).
    Rejected: hash of the whole row: breaks when columns are reordered.
  Silent on: a source row whose value changed between the two loads.

Signed set: 2 items, signed 2026-10-07.
Reply with the single word: loaded
[leitstand stable spec digest 7f3a9c12]
```

```
[leitstand stable package P-2]
P-2 Load staged readings into DuckDB. After: P-1.
Goal: Staged rows reach `readings` once each, and a report says what was read and written.
Crates: load
Constraints: one DuckDB connection per run; input values reach SQL only as bound parameters.
Interfaces. The code is the definition: read the file named.
  I-002 type   crates/contracts/src/staged.rs::StagedRow   producer U-1-02; used by U-2-01, U-2-03
  I-004 table  crates/contracts/src/schema.rs::ReadingRow  producer U-2-03; used by U-3-01
Units, in order. Plans and status are not here; they come with each unit.
  U-2-01 Read a staged file into staged rows
  U-2-03 Upsert staged rows into `readings`
  U-2-04 Report rows read, written and skipped
Reply with the single word: loaded
[leitstand stable package P-2 digest c2d81e40]
```

```
[leitstand delta U-2-03 on spec 7f3a9c12, package c2d81e40]
RULES (these outrank anything you remember)
- Only `lst` writes under leitstand/. `lst step begin` before any dispatch; `lst step end` after.
- After a reset, a step shown as begun and not ended is redone, never resumed. A dispatch shown
  as LOST is gone: do not wait for it or look for its output.
- Limits: redos per step 2; fix cycles per group 2; audit rounds 2; nudges 2. At a limit, run
  `lst unit block` and take what `lst next` offers.
- A signed spec item changes only through a question to Robin.
- When the step's state is written, call the tool step_done.

NOW
Working directory: /Users/rjs/dev/readings-ingest. Git head: 4be19d2.
Unit U-2-03 Upsert staged rows into `readings`. Status: open. Step: write-code.
Step state: BEGUN 14:02, NOT ENDED. Base commit 4be19d2.
  dispatch 1: implementer, agent a7f3. LOST: no outcome was recorded.
The redo rule applies: `lst step abandon U-2-03`, then begin write-code again.

PLAN
Crate load. Covers S-012. Provides I-004. Uses I-002. After U-2-01 (done, 9d02c7e).
Write scope by role; anything else is refused.
  writer crates/load/tests/u_2_03.rs | implementer crates/load/src/upsert.rs
  auditor crates/load/tests/f_*.rs

TESTS
Red now by plan; this unit must turn them green:
  u_2_03::reload_keeps_row_count        u_2_03::prop_reload_is_idempotent
  u_2_03::diff_matches_duckdb_sql       u_2_03::empty_file_writes_nothing
  seam_stage_load::staged_rows_reach_readings
Red now by plan; later units own them: 3 (U-2-04: 2, U-3-01: 1). `lst expect` lists them.
Every other test must be green. Last gate: T1 on 4be19d2 matched this expectation.

OPEN
Groups against this unit: none. Audit rounds used: 1 of 2.
Notes (1 open of 20 allowed):
  N-0007 DuckDB returns rows in no fixed order; compare tables as sorted sets, never by
    position. (from U-2-01, commit 9d02c7e; retires when P-2 is closed)
Questions: Q-003, which parks P-3 and does not touch this unit.
From Robin since the last reset, not yet filed: none.
[leitstand delta end]
```

**Size [E].** Counted as characters divided by 4 (low) and by 3 (high), since ids and paths
split into more tokens than prose; no tokeniser was run. `stable(spec)` with two items: 1,347
characters, 340 to 450 tokens. `stable(package)`: 821, 205 to 275. `delta`: 2,058, 515 to 690.
One spec item like S-012 is about 610 characters, 150 to 205 tokens, so a 40-item spec would be
6k to 8k. Budgets **[P]**, to be set from a real count in S1a: `delta` 2k tokens, `stable(package)`
3k, and the whole spec in the prefix up to about 40k (the Economist's figure).

**What has been run.** Spike F1: 8 resets on haiku with filler state. A fork at a chosen message
took 8 to 16 ms with no model call; the mod resumed it and prompted with no keypress; cuts at two
levels; one alternative plan submitted from the spec cut; no planted word leaked; listings and
the mod's tool present each time; the first request read 78.7k from cache and wrote 0.2k.
**Everything else here is UNTESTED and belongs to F2:** the digest check and stale-cut rebuild;
the spec-to-package cascade; a root cut; the one-word reply; starting the path from a new process
(the spike stayed in one); a kill between resume and submit; an expired cache; 30 or more resets;
pruning (`deleteSession` was not called); hold, a typed message and Esc on F; a sub-agent in
flight; a permission grant across a changing session id; any model but haiku.

**Faults and the answer to each** (T = the answer was tested; "on A" = on route A only):

| Fault | Answer on F |
|---|---|
| The resume lands on the wrong session or content | The mod checks session id and message count after `resume`; `delta` opens with both digests. The check is in the spike mod; the stop on a mismatch is UNTESTED. |
| A stale level submitted again leaves both versions in the prefix | Rebuild from the parent cut. UNTESTED. |
| Each reset leaves a full copy of the prefix on disk and in the resume picker (0.56 MB in the spike) | Prune: keep the last 3 forks, any from a faulted step, and every session named in `cuts.toml`. UNTESTED. |
| The session id changes at every reset | Run records are keyed by unit, not session. What else depends on the id (permission grants, anything attached from outside) is UNTESTED. |
| The cache has expired after a long park | The first request writes the whole prefix once. UNTESTED. |
| A kill between resume and submit | The pending record is written first; on restart the path runs again. UNTESTED. |
| The working directory moves (route E's fault) | T, lightly: it stayed put in 8 resets, 2 from a sub-folder. `delta` states it anyway. |
| The mod's own tool needed a search before each use | T: present after every reset on F; the mod still pins it. |
| Esc at a permission dialog does not report as an interrupt | T on A: the mod holds on the transcript's interrupt row. UNTESTED on F. |
| A turn ends without `step_done` | The mod nudges twice, then stops with a fault. One nudge recovered on A; the stop was never exercised. |
| Saving the mod's file mid-session wipes its memory | Hold, pending reset and kept messages are files under `run/`. UNTESTED on F. |
| The previous unit's output leaves the view at a reset | Open: Robin should judge from the demo. Only `delta` is printed. |
| A sub-agent finishes after a reset | No reset while one runs. The guard is written and UNTESTED. |
| Slow hook, missing directory, missing listings | Route A only; they return if A is used. Test A1 (§7) covers the first. |
| The mods API is early access and can be switched off remotely | The path sits behind one function; route G is the fallback. |

**Fallbacks.** Route A if F2 fails: the same `stable` and `delta` texts, joined and handed to the
compaction hook, the prefix written to the cache at every reset. Route G (a program on the SDK
owns the session) if mods are withdrawn. Both call the same two functions, so a change of route
changes no file and no `lst` command.

## Part 3. Edits other sections need

| § | Old wording | New wording |
|---|---|---|
| §0 diagram | "spec / package plans / unit plans / state / notes"; three parts drawn | "spec / plan / state / notes / run records"; add the fork helper (Node, SDK) as a part |
| §0 bullet 1 | "The spec and the current package plan are loaded into the session once, word for word from the files … adds only the current unit and what is still to do." | "The spec and a package outline are rendered once from the files and stay in the session as a cached prefix. At a reset the mod forks the session just after them and submits one fresh text: the unit's plan and state, and the rules. If the files behind the prefix change, the prefix is rebuilt." |
| §2, row 5 | "needs a slot (§4.1)" | add: "including the outcome of each dispatch and the tests expected red" |
| §3 pr. 1 | "written by `lst` before the reset" | "written by `lst` before the step ends; an intent record is written before any dispatch" |
| §3 pr. 2 | "Rebuild, do not summarise. Post-reset context is file contents, never a model's précis." | "Render, do not summarise. Post-reset context is text rendered from the files by two pure functions: a cached copy of `stable`, valid while its digest matches, and a fresh `delta`. Never a model's précis." |
| §4.3 | "Rebuilding from files re-inserts the flow word for word at every reset" | "On route F the flow sits once in the prefix; a short rule card, with the flow's limits, opens every `delta`" |
| §5.2 diagram | "reset to unit", "reset to package", "reset to spec" | "reset" (one path; the cuts decide what is replayed) |
| §7 S1 | "`hydrate`" | "`stable`, `delta`, `expect`, `step begin/end/abandon`, `doctor`, `edit`, `restore`" |
| §10 watchdog | "(start the session with `lst hydrate`)" | "(start a session; the mod then runs the one reset path of §4.2)" |
| §10 recovery | "a new session hydrates from files and the orchestrator must work out what the half-finished step left" | "a new session runs the reset path; the open intent shows the step as not ended, and it is abandoned and redone. Untested; the kill test of §4.1 covers it." |
| §10 reset | "The chosen route has run 8 resets…" | append: "The digest check, the stale-cut rebuild and a restart from a new process have not run at all." |
| §12 | "Hydrate: produce the text a reset rebuilds the context from." | Remove. Add: "**Cut:** a recorded point in the session to fork from, valid while its digest matches. **`stable`, `delta`:** the two pure functions that render the prefix text and the per-unit text. **Intent record:** what a step set out to do, written before it starts." |
| §12 | "Reset: replacing the conversation with hydrated text." | "Reset: forking the session at a valid cut and submitting `delta`." |
| §12 | "Step: … a reset follows it."; "Checkpoint: the TOML files under `leitstand/`" | "Step: one entry in `flow.toml`."; add "apart from `run/`, which is machine-local" |

## Part 4. The cold-reader test (exit test of S1a, then a regression test of `lst`)

**Not yet run on this design.** The Bar Raiser's three runs used the Architect's schema.

**Set-up.** Freeze the mock build at five points **[P]**: (1) a dispatch in flight when the
session died, the example above; (2) a group ruled and not fixed; (3) a unit parked by a
question; (4) a stale cut; (5) between `unit done` and its commit. At each, a fresh reader gets
only the rendered text: `stable(spec)`, `stable(package)`, `delta(unit)`. The reader is haiku, no
tools, user and project settings off (the earlier reader drew on Robin's memory file). Twelve
keyed questions a point, a third keyed "not in the text"; five runs a point.

| # | The reader must answer | Key at point 1 |
|---|---|---|
| 1 | The current unit, step and working directory | U-2-03, write-code, the path shown |
| 2 | **Was a sub-agent dispatched, and did it finish?** (earlier: 3 of 3 asserted "did not finish" from a missing field) | Dispatched; no outcome recorded; it is lost |
| 3 | **Which tests are expected red now, which must be green?** (earlier: three different answers) | The five named, and three owned by later units; all others green |
| 4 | **What is the single next action?** (earlier: 3 of 3 waited for an agent that had died) | Abandon the step, then begin write-code again |
| 5 | Which files each role may edit; may the implementer edit the test file | As listed; no |
| 6 | What tests S-012 owes, and whether each exists | The four kinds; which named test pays which debt is not in the text |
| 7 | Why the key is `(station_id, read_at)`; what was rejected | As recorded |
| 8 | How many redos and audit rounds remain | 2; 1 |
| 9 | What the spec says about a row that changed between loads | Silent; ask, do not decide |
| 10 | Does an attestation hold for the tree now | T1 on 4be19d2, the head: yes |
| 11 | May P-3 start; what Q-003 asks | No; the question's text is not in the text |
| 12 | Which three tests later units own; what S-007 requires | Not in the text (both) |

**Pass mark [P].** At every point: 95% of keyed answers right over the five runs; no confident
answer where the key says "not in the text"; questions 2, 3 and 4 right five times in five, with
the same next action each time. A "not in the text" that a resume needs is a missing slot: add
it and rerun. Run once more on the Architect's spec-item shape to settle D14 by result.
