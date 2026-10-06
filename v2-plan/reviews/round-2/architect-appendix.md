# Architect, round 2: appendix

Sketches, not designs. Names (`dok`, the verbs) are placeholders. Markers: **[C]** checked in a file this
round, **[U]** not verified.

## 1. Dependency diagram

Solid arrows are "is configured with a command string of". No arrow is an import.

```
                         wiring file  (the only place names cross; versioned with the pack)
                               |
   +-----------+---------------+----------------+----------------+
   |           |               |                |                |
   v           v               v                v                v
 pack F     rank (H)        work (E)         watch (G)       session mod
 card,      pure fn of      begin / end      watchdog         (host: draws status,
 classes,   `store ready`   record           process          trigger, hold, kept
 lookups,   output                                            messages, sign)
 gates         .              |  \              .                 |      .
               .              |   \             .                 |      .
               v               v    v           v                 v      v
            STORE (B)        GATES (D)        run state  <----  REWIND (A)
            put get lint     one command      (machine-local;   mark / rewind
            ready render     0 / 1 / 2        marks, ids,       route F | A | manual
            owner policy     stellwerk        heartbeat)
            records
```

Three independent bases: **A**, **B**, **D**. None needs another to run or to be tested.
Dotted links are optional: `rank` reads the text of `store ready`; the watchdog reads a timestamp file; the
mod's status line runs a command string and prints what comes back.

Deletion test, per row: remove the module's tool from the path, run the others' tests.

| Remove | What must still work |
|---|---|
| A | Store, gates, work. Robin types `/compact` or `/clear` and pastes `store render` |
| B | Rewind with a handover note (rung 1). Gates. Work without records in a store (records to a folder) |
| D | Rewind, store. `work end` reports "no gates configured" |
| E | Rewind, store, gates run by hand |
| pack | Everything; the notes pack is the store with no classes |
| rank | Everything; `store ready` still lists ready work unranked |
| watchdog | Everything while Robin is at the keyboard |

## 2. Module contracts as I would specify them

### A. Rewind

| | |
|---|---|
| Verbs | `mark <name> [--key K]` ; `rewind <name> [--if-key K] --then <command>` ; `marks` (list) |
| In | A name; an opaque key the caller chooses (for example a digest of what it rendered); a command whose output is submitted |
| Out | Exit 0 done; 1 the mark is unknown or its key differs ("stale"); 2 the route faulted and nothing was discarded |
| Owns | Run state: `{name -> source session id, marker text, key}`, the current session id, reset count. Machine-local |
| Never knows | Stores, items, steps, thresholds, what the submitted text means, why the caller thinks a mark is stale |
| Routes | F: fork the source session at the mark, resume the fork, submit. A: compaction answered by the mod's own hook, submit. Manual: print the text and tell Robin to `/clear` |

Notes.
- A cut is valid only at a finished turn's last row, and fork remaps every id (F1 §4, guards) [C]. So a
  mark is planted by the mod at turn end and found again by marker text in the **source** session, as
  `helper.mjs` `cutAt` does [C]. Every fork is cut from the session that holds the mark, never from a fork
  of a fork, unless the mark was planted in that fork.
- Staleness is the caller's judgement, carried as the opaque key. A stale mark is re-planted by the caller
  from the parent mark (round 1, M1). A does not learn what a file is.
- Under route A there is no prefix to return to; `rewind` degrades to "replace everything with the output
  of `--then`". The caller must therefore make `--then` complete by itself. That is the contract that lets
  routes substitute.
- Sessions that hold a live mark are exempt from pruning; forks older than the last N are deleted
  (`deleteSession` exists, untested [U]).

### B. Store (with the owner rule, which was C)

| | |
|---|---|
| Verbs | `put` ; `get [--json]` ; `lint` ; `ready` ; `render <scope>` ; `record <item> <kind> <file>` ; `sign <items>` ; `answer <question>` ; `migrate` |
| In | Item header and body; an actor (`agent` by default; `robin` only by the signing channel) |
| Out | Exit 0 written and committed; 1 refused (schema, links, or owner rule; a refusal by the owner rule has also filed a `question`); 2 fault |
| Owns | The item files, the records, the format version, the signed digests, one lock file (one writer) |
| Never knows | Sessions, marks, context, gates as programs, product files, languages, what a step is, what a class means beyond its lint row |
| Pure | `lint`, `ready`, `render`, and the gauges are functions of the files alone and byte-stable |

`ready` returns tasks whose `blocks`-predecessors are closed and which are not blocked by an open question.
This is where "park only what depends on it" is computed. Nothing is ever marked parked.

`render <scope>` has fixed sections: the focus item in full; its ancestor path, bodies only (v1's altitude
rule, `server.py` `get_context` [C]); open questions touching the path; ready tasks under the focus, one
line each; notes whose `applies_to` meets the path, capped; the last few records for the focus, one line
each. Siblings and children are titles only and opt-in, as in v1.

### D. Gates

Unchanged from stellwerk's grammar. Additions at this level only:
- A registry row in the wiring file per gate: command, tier, time cost, seeded-defect fixture.
- A **scope gate**: given a base tree and an allow list of path globs, exit 1 if the diff touches anything
  else. Protected expected values are globs that no task allows.
- Exit 2 always stops; it is never routed to a worker.

### E. Work

| | |
|---|---|
| Verbs | `work begin <task>` ; `work end <task>` |
| `begin` | Records the base tree (a tree hash of the working directory) and the task's allow list in run state. Refuses if a task is already open in this working directory |
| `end` | Computes the diff from the base; runs the scope gate and the gates the wiring names for the task's class; writes one immutable record (diff stat, gate results by path to full output, tree key, product commit); prints a verdict line |
| Out | Exit 0 met, 1 deviation (the record says which gate), 2 fault |
| Never knows | Which model or skill did the work, whether a sub-agent was used, what the store's kinds are |

The runner (a skill, a sub-agent, the orchestrator itself) sits between the two verbs and is not part of
the contract. This is the round 1 intent record: a restart finds an open `begin` with no `end`.

### F. Pack

A folder: `card.md` (rules, read by the model), `classes.toml` (class names and what each owes), `wiring.toml`
(lookups: gates per class, skill per task kind, allow globs, the `--then` and status commands), and a `gates/`
folder of scripts obeying D. Lint refuses `wiring.toml` keys that express order or condition. No step table.

### G. Watch

In the session: the status line and the threshold trigger, hosted by the mod, reading run state and one
configured status command. Outside the session: a watchdog process that reads the heartbeat timestamp and,
past a limit, notifies and (bounded) runs `claude --resume <current session id from run state>`. It chooses
no work. On rung 1 only the in-session half exists.

### H. Rank

`rank` reads `store ready --json` on standard input and prints the same items ordered, each with its two
factors. No writes, no state, no flags that pin or skip. Not called by any tool or wiring string.

## 3. Item schema

Four kinds, one header shape, body opaque.

```toml
+++
id      = "S-014"
kind    = "item"            # item | task | question | note
class   = "property"        # pack-defined; lint looks up what this class owes
title   = "Units are normalised before reconcile"
state   = "open"            # item: open|closed ; task: todo|doing|done|dropped ; question: open|answered
owner   = "agent"           # agent | robin ; set to robin only by sign or answer
parent  = "S-010"           # optional; single parent; lint checks no cycle

[[link]]
rel  = "tested-by"          # blocks | discovered-from | supersedes | tested-by | applies-to | answers
to   = "T-031"
seen = "9f2c1e"             # fingerprint of the target when this link was last checked (suspect link)

[x]                         # the one open table for pack fields; never affects the format version
oracle_case = "xls-legacy-03"
+++
Free markdown. The tool stores it and renders it. It never parses it.
```

Records, under `records/<item id>/NNNN-<kind>.toml`, written once and never changed (v1's `append_record`
shape [C]):

```toml
kind     = "gate"           # gate | probe | sign
rung     = "gated"          # asserted is the absence of a record
item_fp  = "9f2c1e"         # fingerprint of the item when the record was made
tree_key = "4b1d..."        # product tree the result speaks of
commit   = "a1b2c3d"
result   = "met"
output   = "run/gates/4b1d/unit.json"   # path, with a hash, to the full output
```

Derived on read, never stored:
- `confidence(item)` = the highest rung among records whose `item_fp` equals the item's current
  fingerprint. A changed item falls back to asserted until re-checked.
- `fidelity(item)` = for a leaf, the best gate-backed level; for a parent, the minimum over children that
  are not dropped (v1's fold, `ctx_schedule.py` `effective_fidelity` [C]).
- `suspect(link)` = `seen` differs from the target's current fingerprint.

Lint, beyond schema and links: every class debt paid; single parent and no cycles; no signed item whose
digest moved without an answered question; note caps per scope; `put(get(x))` byte-identical.

## 4. Rung 1, concretely

**Pieces.**

| Piece | Language | Size | From |
|---|---|---|---|
| mod `dok` | TypeScript | about 200 lines | `spike-live/mod/hooks/register.ts` with routes B to E, the fault tests and the dumps removed; the resume-and-verify block from `spike-f1/mod/hooks/register.ts` |
| helper `dok-rewind` | Node | about 60 lines | `spike-f1/helper.mjs`, `go` only, plus the run-state file |
| run state | JSON | one file under `.dok/run/` | new; replaces the mod's module variables, which do not survive a reload [C] |

**States of the mod.** `running` -> `asking` -> `checking` -> `resetting` -> `running`; any of them -> `held`.

1. **Trigger.** At `turn.complete` of the main agent: read `$.session.usage().context.percent` (documented
   for exactly this, `mods.md` §3 [C]; absent until the first response after a reset, so treat absent as
   0). If it is at or over the threshold, no sub-agent is running or pending, and there is no hold, go to
   `asking`. Robin can force it with `/handover`.
2. **Ask.** `$.prompt.submit` a fixed text: "Write `.dok/handover.md` using the headings below. Then run
   `dok-rewind` and end your turn." Asking the model costs one turn in the old context, which is the
   cheapest place to write the note since everything is still in view.
3. **Check, in the helper, before any fork.** The file is newer than the ask; all nine headings are
   present; under 1,500 words; every path under "Files that matter" exists; "Next actions" has at least
   one entry. On failure the helper exits 1 with the reason, the model fixes it once; a second failure sets
   a hold and a toast. Nothing has been discarded yet.
4. **Reset.** The helper forks the source session at the mark and writes `{seq, forkId}` to run state. At
   the end of that turn the mod runs `resume <forkId>`, verifies the session id and message count (F1
   guards [C]), and submits: the note inside a `<handover n="3">` block, then any messages Robin typed
   since the ask, then "continue". On a failed verification: hold, toast, nothing submitted.
5. **Fallbacks, same verb.** If the helper cannot fork: route A (the mod's `session.compact` hook answers
   with the note as the only message; 19 unattended resets in the spike [C]; it must add the working
   directory, and the skills listing is missing for a step). If the mod is off: the helper prints "type
   /clear, then paste @.dok/handover.md".

**The mark.** By default the end of the session's first turn, so Robin's opening message and the engine's
listings stay in the prefix word for word and are read from cache. `/mark` moves it to the end of the
current turn (for example after an orientation read worth keeping). One mark on rung 1.

**The handover note.** Fixed headings, in this order:

1. Goal, in Robin's words (quoted)
2. State now: what is done, and how each was checked
3. In flight: what was being done when the note was written
4. Next actions (at most three, each one command or one edit)
5. Decisions made and why
6. Open questions for Robin
7. Files that matter (paths)
8. Dead ends: what not to redo
9. Commands that work here

Each note is also copied to `.dok/handovers/NNN.md`, the last twenty kept, so a lost item can be traced.

**What Robin sees.** A status line: `ctx 61% | resets 3 | running`, or `HOLD (you typed) - /go`. A toast at
the ask. The note as the first message of the new context, which is where he can read what was carried and
catch what was not. Typing anything sets a hold, as in the spike (`origin.kind === 'composer'` [C]); `/go`
releases it.

**What it does not do.** No store, no second mark, no watchdog, no rules card (his `CLAUDE.md` is in the
prefix), no judgement of the note's content.

**Before building: one spike, about an hour, haiku.** F1 ran the helper from an outside shell while the
session was between turns. Rung 1 runs it from the session's own Bash tool, mid-turn. Show that the fork
cut at an earlier mark is unaffected by the open turn, and that `resume` at that turn's end lands. If it
does not, the fallback is a file watcher process, which costs a third thing to start. [U]

**The week's measure.** Resets; times Robin had to re-tell something (the count that decides whether the
note's headings are right); tokens written per reset; holds by cause.

## 5. v1 code: what carries

| File | Lines | Verdict | Why |
|---|---|---|---|
| `ctx_store.py` | 542 | Copy the shape | Validate, write, one commit; `append_record`; the empty-commit refusal. Not the layout (nested integer directories, a tree walk per id lookup, lines 81 to 94) or the header reader (unknown keys dropped, line 173) |
| `ctx_mcp/server.py` | 244 | Copy the rule | `get_context` is the ancestor path, bodies only, detail opt-in: that is `render`'s core. The server itself is not needed; a command will do |
| `ctx_schedule.py` | 275 | Take as code, later | Pure; reads eight attributes of a model (`nodes`, `tree_edges`, `dormant`, `gauges`, `confidence_inputs`, `boundaries`, `blocked_by`, `aspects`). A 30-line adapter from `store ready --json` feeds it |
| `ctx_core.py` | 1,172 | Leave | The marker grammar and its checks. The liability named in v1's own record |
| `ctx_lint.py`, `ctx_driver.py`, `ctx_run.py` | 833 | Leave | Bound to the marker model and to v1's move dispatch |
| tests | 361 pass [C] | Port the store and serving tests as the new tool's first specification | |

Schema node 64 gives three things worth keeping as rules: one authoritative home for the schema, referenced
and never restated; evidence in files that are only ever added; and "views over grants, never copies" for
anything whose real home is the product repository.

## 6. Scheduler notes

- The ladder in node 32 has seven rungs; the code has three labels. The rungs from "spiked" up were never
  wired to evidence. What v2 would inherit is the idea and the fold, not a working gauge.
- v1's own answer to its formula's blind spot (confidently wrong items get no attention) is a stratified
  audit lottery. That is a second mechanism the formula requires in order to be safe; count it in the
  price of the advisor.
- The readiness gate does most of the ordering in practice. v1 added dependency edges to it after a glue
  leaf was deepened out of order by luck of its confidence value (node 32, q5). `ready` over `blocks`
  edges is that lesson, and it stands without any ranking.
- A cheap test of question 20, at rung 4: before each slice, record the model's unaided choice and the top
  of `rank`. Where they differ, note which the model took and whether a later slice was reopened because
  of it. Twelve slices give twelve rows; no extra runs.

## 7. The split I would propose instead of A to H

Added after the coordinator's note that a different split is invited. It gathers the changes in the main
review into one table. Five things to build, one thing to write, in three layers.

| | Piece | Replaces | Contract in one line | Alone, it gives | If it is wrong |
|---|---|---|---|---|---|
| 1 | **Session** (the mod, the fork helper, run state) | A, the in-session half of G | `mark`, `rewind --then`; a status command; a threshold; hold and go; Robin's signing channel | Handover and rewind in any long session (rung 1) | Swap the route behind the verbs; nothing else moves |
| 2 | **Store** (items, records, owner rule, `ready`, `render`, derived gauges) | B, C, the structural half of H | `put get lint ready render record sign answer migrate` | A notes and questions store with consent, usable from any session or by hand | The header format: guarded by the six rules. `render`'s sections: one function |
| 3 | **Gates** (stellwerk, plus a scope gate and the registry lint) | D | One command per check; 0, 1, 2 | As today | Per gate; each is a script |
| 4 | **Work** (`begin`, `end`, the record) | The kernel of E | Base tree in; diff, scope and gate results, one immutable record out | An honest account of any piece of agent work, with or without a store | Delete it; gates still run by hand |
| 5 | **Watchdog** (outside process) | The out-of-session half of G | Reads a timestamp; notifies; bounded relaunch | Unattended running | Delete it |
| - | **Pack** (card, classes, wiring, gate scripts) | F, and the skills that were E's runners | Data and scripts only; no order, no conditions | Nothing alone, by design | Throw it away |
| - | **Rank** (optional function) | The opinion half of H | Text in, ordered text out | Nothing alone | Never build it |

Layers: 1, 2 and 3 are bases with no knowledge of each other. 4 sits on 3 and writes to 2 if a store is
wired. 5 reads 1's run state. The pack names everything and is named by nothing.

**What this makes easier to build alone.** Piece 1 is the whole of rung 1 and has no dependency on any
other piece. Piece 2 is the whole of rung 2, and consent comes with it instead of needing a second
contract across a boundary that carries nothing else. Piece 4 can be used at rung 3, the baseline, on a
plain session: it is what produces the number later rungs are compared with.

**What this makes easier to rethink.** The route (inside 1), the item format (inside 2, behind `get
--json` and `render`), each gate (a script), the flow (the pack). The two things that stay expensive are
the store's header and the sections of `render`; both now sit inside one piece with one owner.

**What it gives up.** Consent and the chooser stop being things one can point at in a diagram. In exchange,
neither is a module that cannot be deleted without the store, which is what they were.

**Consistency with the round-2 evidence auditor.** My reading of `ctx_schedule.py` agrees with the
corrected §4 (three declared levels, leaves first, no tracer path, no intensity). On reuse, the auditor is
right that `ctx_store._validate` calls `ctx_core.parse` (`ctx_store.py:401-404`), so the write path is
copied as a shape and not carried as code; §5 above already says so. `ctx_schedule.py` is the one file
that could be taken as code, and only because it reads eight attributes of a model object that an adapter
can supply without `ctx_core`. Format choice is left to the separate survey; the six rules in the main
review hold for any text format.
