# Leitstand: scoping draft for the review panel

**Status.** First draft, 2026-10-06, not yet reviewed. Written from Robin's brief of the same day
(`BRIEF.md`), eight research reports, three spikes and two short interview rounds (§11 lists them; all
under `successor-plan/research/`). It follows the shape in `v8.4-plan/SCOPING-PROCESS.md` but is
shorter than V8.3-SCOPING: the aim is something sensible enough for the panel to attack.

Decisions Claude took are marked **[decided]**. Decisions Robin took in the interview are marked
**[Robin, 6 Oct]**. Decisions still open are marked **[open]** and collected in §9. Terms are in
the glossary (§12).

**What Robin asked for.** A model orchestrator whose context is kept fresh by a deterministic
mechanism, so a build runs unattended; borrowed skills doing the individual steps, easy to swap;
machine-readable checkpoints; audits that hand back failing tests; gates that run what was
edited; decisions held in the plan, not a log; Rust as the target language.

---

## 0. The design in half a page

One Claude Code session runs the whole build, and Robin can watch it and talk to it. That session
is the **orchestrator**: it decides what to do next, dispatches sub-agents to do the work, and
rules on what comes back. Three small deterministic parts sit around it.

```
            ┌───────────────── one live session ─────────────────┐
 Robin ───► │ orchestrator (model): order, dispatch, rulings      │
            └──┬───────────────┬───────────────────┬──────────────┘
               │ calls         │ dispatches        │ is reset by
        ┌──────▼─────┐   ┌─────▼──────────┐   ┌────▼─────────────────────┐
        │ lst (CLI)  │   │ sub-agents,    │   │ the mod (TypeScript)      │
        │ reads and  │   │ each running a │   │ 1 takes the session back  │
        │ edits the  │   │ borrowed skill │   │   to a known point        │
        │ checkpoint │   │ named in       │   │ 2 refuses a few actions   │
        │ files      │   │ flow.toml      │   │ 3 records usage per step  │
        └──────┬─────┘   └─────┬──────────┘   └────┬─────────────────────┘
               └───────────────┴────────┬──────────┘
                              checkpoint files (TOML, in git)
                              spec / package plans / unit plans / state / notes
```

- **The checkpoint files are the state.** The conversation is disposable. The spec and the
  current package plan are loaded into the session once, word for word from the files. At the end
  of each step the mod takes the session back to just after them and adds only the current unit
  and what is still to do.
- **The flow is data.** `flow.toml` names the steps, which skill does each, and which gates follow.
  Swapping a skill is a one-line change plus an acceptance run.
- **The model has the judgement; the tools have the memory and the refusals.** Nothing
  deterministic decides what happens next. The deterministic parts only hold state, run gates,
  and refuse a short fixed list of actions (§4.3).

---

## 1. What the record says

These are measured facts from werkbank's history unless marked otherwise. Sources are in
`research/werkbank-evidence.md`, which gives file and line for each. Most come from one run
(package F, phases 5 to 7) and one canary tape; phases 8 to 10 have never run live.

### 1.1 Where the cost went

| Fact | Figure |
|---|---|
| Share of run-3 spend that was judging findings | 62% ($929 run) |
| Share that was building | 7% |
| Cost of a round's fixes, against the cost of ruling on that round | $0.4 to $3.7, against $10 to $45 |
| Real stops in the run, and time halted | 53 stops; 46 h halted, 29 h net of work still running |
| Gain from running four in parallel | about 6% of the run |
| Escalation rows | 126: 106 for the 53 stops, 20 advisory |

Time went to stops and to judging, not to serial running.

### 1.2 Size

The driver's source grew from 10.8k lines (4 Sep) to 49.3k (6 Oct); one file, `phases.py`, went
from 929 to 6,722. Of the 55 patch releases in 8.2, 52 supplied one of ten missing rules
(readiness, pause and resume, write scope, supersession and so on). A caveat: much of the growth
is tests, harness and measurement, so product logic is smaller than 49k suggests.

### 1.3 Audits and gates

- 25 of 27 code-audit finds were reachable by an earlier check; 24 could have been failing tests.
- A reproduction alone did not filter noise: 12 of 19 noise findings had one. A mechanical intake
  check, replayed over the same findings, would have removed 17 of the 19.
- In the 8.3.9 canary, 81 findings were filed and 53% accepted; 21 of the 35 rejects read as duplicates (counted by pattern over the stated reasons).
- 9 of 12 canary finds were siblings of behaviour already tested.
- Same-vendor audit rounds plateau within one or two rounds.
- Running mutation testing first would have pointed at 9 of the 27 audit finds, 2 of them directly.
  Mutation did find 86 real test gaps at under $1 each.
- The full test suite grew from 10.7 minutes to a measured 85 minutes in three days (one
  projection put it at 3.5 hours) and was then skipped.
- Live model canaries passed 0 times in 13: they explore, they do not gate.
- **Fixes were a leading source of new defects.** The v3.3 shakedown recorded that "our own
  remediation became the leading source of new defects": one audit round's three sharpest
  findings all came from the previous round's fixes, and 3 of 12 in a later round did, one a
  blocking regression already pushed (CHANGELOG, v3.3). In the 8.3 build, 3 of 12 test-catchable
  finds came from the orchestrator's own fix lane, which had no brief.

### 1.4 What deterministic checks did well

- The write-scope check found 8 violations, 6 of which no model had noticed, with no false
  positives, in 0.6 s.
- Killing the engine at random points made resume reliable, after 8 or more resume releases.
- State lessons: versioned ledger rows were miscounted; hand-built successor rows lost fields.

### 1.5 What a model orchestrator did badly

The hand-run 8.3 build had Claude orchestrating sub-agents. It skipped the full-suite gate at
four releases a day, let the checkpoint bloat until a rule stopped it, and produced planner
citations that were "often wrong". Earlier, the v2 orchestrator edited its own skill without
authority after four days of compaction.

### 1.6 What the spike and the research add

- **A mod cannot rewind or fork.** It can compact, and a hook can supply the whole
  post-compaction transcript itself. The spike confirmed this in headless mode: after a reset the
  model could not recall a planted word and could list markers that exist only in the checkpoint
  files. A reset took 4 ms and no model tokens; four resets in a row ran unattended.
  (`research/spike-reset/REPORT.md`)
- **A second spike ran it in a live terminal session** (`research/spike-live/REPORT.md`). Four
  ways of resetting worked with no keypress; none leaked old context or grew over 9 to 32
  resets with about 36k tokens of state. `/rewind`, `/branch` and `/fork` take no argument that
  selects an earlier turn. Holding for Robin, keeping his messages and a status line all worked.
  The spike was stopped early: no route reached 50 resets, and sub-agents in flight and long idle
  periods were not tested.
- **Borrowed skill collections churn.** superpowers rewrote its core skills in each of its last
  three releases; compound-engineering had a commit the day before it was read.
- **A failing test is a filter, not proof.** In the one study with numbers, 56% of agent bug
  reports that came with a failing reproducer were valid bugs.
- **Rust gates are dominated by compile and link time**, and cargo selects tests per crate at the
  finest.

---

## 2. The objection to answer first: this was tried

werkbank v3.0 was "segmented Opus + mini-runner": the model orchestrator kept state in files,
exited at phase boundaries, and a 150-line script relaunched it with a hydration prompt
(V3-SCOPING D4). It grew into the driver. So what is different?

**What the record shows** (`research/v3-segments.md`, with file and line):

- The segmented orchestrator was hardly tested. CHANGELOG records that v3.0 to v3.2 "were built
  but never run end-to-end", and later that "the segmented runner was never actually used on a
  real build" because the operator could not watch it, speak to it or stop it cleanly. When it
  was used, on stellwerk v4, one segment was killed by a 90-minute cap and one parked on a typo
  in its state file.
- No measurement exists, for or against. The record holds no cost, turn count or quality figure
  for segmentation, and no case of a hydrated model orchestrator working well.

**The recorded reasons for the driver, and whether each still applies:**

| Reason then | Here |
|---|---|
| Context grew without bound (837 turns, about 75% of spend) | Removed by the reset. |
| At least 80% of orchestrator turns were plumbing, 37% of them watching gates; segmenting did not fix that | Mostly removed: hooks run gates, `lst` does the bookkeeping. To be measured in S2 as the share of orchestrator turns that are plumbing. |
| The operator could not watch or steer a segment | Removed: one live session. |
| A hand-written state file with a typo parked the run | Removed: only `lst` writes state, and loading is the lint. |
| The state file had no slot for gate state or pending rulings, so a reset lost them | **Still applies.** Every piece of state a reset must carry needs a slot (§4.1). |
| A segment's end or a time cap killed a live worker | Partly: no reset while a sub-agent runs, and no wall-clock caps. A crash of the session still strands workers (§10). |
| The runner relaunched after crashes and parked on usage limits | **Still applies.** An in-session reset gives neither. A small watchdog outside the session is needed (§10). |
| Prose rules decay; "prose-only rules are presumed dead on arrival" | Decay from summarising is removed. Non-compliance is not, and the guard list will be under pressure to grow (§4.3). |
| The orchestrator made judgement errors that had nothing to do with context | **Still applies, and nothing here fixes it.** §10. |

So the honest position is that this design is not what v3.0 was (that one could not be watched,
wrote state by hand and summarised its own rules), but it has also never been shown to work. The
last three rows are the real risks, and the pre-mortem lens should start there.

---

## 3. Principles

1. **State is files; the conversation is cache.** Anything that must survive a reset is written
   by `lst` before the reset. (§1.4, §1.5)
2. **Rebuild, do not summarise.** Post-reset context is file contents, never a model's précis.
   This removes the cause of the decay seen in v2. (§1.5, §1.6)
3. **Judge less.** Every finding passes a mechanical intake and is grouped with its like before a
   model rules on it. (§1.1, §1.3)
4. **Check where the thing is made.** Prefer a test written before the code, then a cheap
   mechanical signal, then a model audit, in that order. (§1.3)
5. **A refusal, never a route.** Deterministic code may refuse an action and say why. It never
   chooses the next step or recovers from a failure; the model does. This is the rule meant to
   stop the mod becoming the driver. (§1.2)
6. **Only spec changes, and faults in Leitstand's own gates, reach Robin.** Everything else is decided, written into the plan, and
   reported at the end. A spec question parks its package while other work continues. (§1.1)
7. **Borrow the prompt, own the contract.** A borrowed skill may say how to do a step. What goes
   in and what comes back is fixed by Leitstand and checked mechanically. (§1.6)
8. **Functional by default.** `lst` is pure functions over files: read, fold, write whole.

---

## 4. The design

### 4.1 Checkpoints

Robin has asked the review panel for its views on this design in particular.

**Format: TOML, one item per file, edited only through `lst`. [decided]** TOML has multi-line
strings for prose, no indentation or type-guessing traps, and a Rust crate (`toml_edit`) that
edits in place. The schema is the Rust types that `lst` deserialises into, so loading a file is
the lint. YAML reads slightly better for long prose and is the alternative if TOML's tables prove
awkward; the choice is cheap to reverse while the files are few.

```
leitstand/
  flow.toml                     steps, skill for each, gates, guards; pinned skill versions
  spec/
    index.toml                  item ids and one-line titles
    items/S-012.toml            one requirement (see below)
    notes.toml                  process notes, spec level
    questions/Q-003.toml        a decision waiting for Robin
  packages/<p>/
    plan.toml                   goal, crates, interfaces consumed and produced, constraints
    units/<u>.toml              unit plan: files, spec items covered, interface
    notes.toml                  process notes, package level
    state.toml                  status of each unit, commit, gate attestations, open issues
    units/<u>.notes.toml        process notes, unit level
    findings/<id>.toml          an audit finding: its test, group, and ruling once made
  ledger/usage.jsonl            tokens and time per step, written by the mod
```

- **Stable and changing parts are separate files.** `plan.toml` and the unit plans change rarely;
  `state.toml` changes after every unit. Stable files are loaded first and stay in the session, so a change
  to state leaves the cached prefix intact (on route F, §4.2; the fallback route rewrites it).
- **A spec item** holds an id, the requirement in prose, its kind (behaviour, interface, numeric,
  non-functional), and for a checkable item a tolerance and a pointer to a reference result. The
  property itself is Rust test code tagged with the item's id. `lst lint` checks the link both
  ways: every checkable item has a test, and every test cites a live item. Properties are not
  written inside TOML, which would mean inventing a weaker language than Rust.
- **Everything a reset must carry has a slot.** Findings awaiting a ruling, gate results and
  sub-agent dispatches are files, not things the orchestrator remembers. werkbank v3 lost
  findings across a reset because its state file had nowhere to put them (§2).
- **State is current state.** `state.toml` is rewritten whole; git is the history. There is no
  decision log: a decision is a field on the spec item or plan it changes, with its reason.
- **Process notes** are small structured entries (text, what they apply to, the unit they came
  from, and optionally what would retire them). A note is admitted only if someone reading the
  finished code would still repeat the mistake; an overlapping note updates the old one. When a
  unit closes, the orchestrator promotes the notes that matter to the package file, and likewise
  from package to spec. Both rules are taken from compound-engineering's lesson store.
- **Cross-unit issues.** `lst issue add --against <unit> --from <unit> --test <path>` records a
  pointer on the accused unit and reopens it if closed.

**The `lst` commands (first cut):**

| Command | Does |
|---|---|
| `lst next` | lists what is ready, from the declared edges between units |
| `lst unit done <u> --commit <sha>` | marks a unit done; refuses without a gate attestation for that tree |
| `lst issue add …`, `lst note add …`, `lst decide …` | edit one entry |
| `lst hydrate --level spec\|package\|unit` | prints the context for a reset, stable files first |
| `lst intake <finding>` | mechanical check of an audit hand-back (§5.3) |
| `lst lint` | schema, id links, interface producers, edges without cycles |

`lst` is written in Rust and is itself property-tested (for example: any sequence of commands
leaves files that load; `hydrate` output depends only on file contents).

### 4.2 The reset

**The need, in Robin's words [Robin, 6 Oct]:** "a single terminal session that provides updates
about what is going on, where the build is up to, and that I can interact with an orchestrating
model from (say 'stop' if it is going off the rails, etc)". On the first runs he expects to help.

That is an interactive terminal session that lasts the whole build. Spike S0-a tried four ways
of resetting inside one; all four worked unattended. A fifth, found afterwards, is the one chosen
(below the table).

| Route | How | Cache on the first request after a reset (36k of state) | Cost per step, haiku | Main drawback |
|---|---|---|---|---|
| A | the mod triggers a compaction; its own hook answers with the hydrated text | reads 30.5k, writes 36.4k | $0.068 | rewrites the stable state to the cache at every reset |
| B | the mod clears, then submits the hydrated text | reads 30.5k, writes 36.4k | $0.074 | wipes the visible transcript; a new session file per step |
| C | a wrapper types `/rewind` and picks a marked prompt from the menu | reads 72.2k, writes 0.7k | $0.026 | depends on the menu's layout; the mod cannot tell the wrapper's typing from Robin's |
| E | the mod resumes a frozen base session, branches it, and submits the unit text | reads 66.5k, writes 0.8k | $0.032 | one step in 27 ran in the wrong directory; a new session id per step |

There is no route D: the mod cannot run a rewind to a chosen turn.

**A fifth route, F, came from the Agent SDK and was then tested**
(`research/sdk-and-frontends.md`, `research/spike-f1/REPORT.md`). The SDK can fork a session cut
at a chosen message, which the terminal interface cannot. A 46-line helper makes the fork in
about 10 ms with no model call; the mod resumes the fork inside the live terminal session and
submits the next prompt.

| | Route F |
|---|---|
| Resets run | 8, at two stack levels, from a repository root and a sub-folder |
| Content | spec and plan known; the previous unit's planted word unknown; no leak |
| Cache on the first request | at the plan cut: reads 78.7k, writes 0.2k; at the spec cut: reads 73.0k, writes 0.1k |
| Engine listings and the mod's tool | present after every reset |
| Working directory | stayed put (E's fault did not occur; only two sub-folder resets) |
| Left behind | one full copy of the prefix per reset on disk and in the resume picker; a new session id per reset |

**Build route F first, with A as the fallback. [decided]**

- F is Robin's original stack made real: `[spec]`, then `[plan n]`, are turns in the session, and
  each unit starts from a fork cut just after the plan. The stable part is never rebuilt or
  rewritten to the cache.
- It needs no compaction hook, so the silent-fallback fault of route A cannot occur, and the
  engine's own listings survive.
- It is the least tested: 8 resets, and hold, message keeping, a sub-agent in flight and a long
  build's worth of forks have not been run on it. That is test F2 in §7. A stays as the fallback
  because those were all tested on it.
- E is dropped: F does the same without a frozen base.
- Route G (a program on the SDK owns the session and is its own front-end) is the fallback if the
  mods API is withdrawn. It replaces the fresh-session-per-step wrapper, because it meets Robin's
  need and the wrapper did not. It would mean rebuilding permission prompts, slash commands and
  the status line, and it is the shape of werkbank v3's runner. No existing front-end was found
  that lets a person attach live to a session another program drives.

**What F changes in the design:**

- **The stack is built once per level.** Entering a package, the mod submits `lst hydrate --level
  package` as a turn and records the id of that turn's last row as the cut. Units fork from it.
- **Only the changing part is sent at a reset**: unit plan, state, notes, and anything Robin typed.
- **A changed stable file makes its cut stale.** If a plan entry or spec item changes mid-build,
  that level is submitted again as a new turn and a new cut recorded. `lst` knows which files
  each cut was built from.
- **Forks are pruned** when their unit closes, so the resume picker and the disk do not fill.

The steps are the same on every route:

1. The orchestrator finishes a step and calls the mod's tool, `step_done(level)`.
2. The mod checks that no sub-agent is running and that `lst` shows the step's state written.
3. It runs `lst hydrate` for the changing part and holds the text in memory.
4. At the end of the turn it moves the session to a fresh fork cut at the right level and submits
   that text.

**What Robin sees and can do:**

- **A status line**, drawn by the mod from `lst`: package, unit, step, context used, open
  questions, and the last gate result. It does not depend on the conversation, so it survives
  resets.
- **Hold.** If Robin interrupts or types anything, the mod stops submitting "continue" until he
  says go. Without this the loop would talk over him.
- **Nothing he says is lost at a reset.** The mod keeps every message Robin typed since the last
  reset and adds it to the next hydrated text, until the orchestrator has filed it with `lst` as
  a note, a decision or a spec question.

"Rewind to the package" in Robin's flow is therefore `hydrate --level package`: spec, then that
package's plan, state and notes. "Rewind to the spec" drops the package files.

**Faults found and the answer to each** (from the spikes; T = the answer was tested). The first
two and the printing of the whole text belong to route A, the fallback, and do not arise on F:

| Fault | Answer |
|---|---|
| A slow or skipped hook lets the engine summarise instead, and the old context survives. It happened for real when the mod called the wrong API. | T: every reset plants a mark only a correct rebuild contains; the mod checks for it (tested) and is to stop the build on a miss (the stop itself is not yet tested). The hook does no file work (1 ms at most in the soak). Whether an error handler can close the gap entirely is test A1 in §7. |
| After a reset on route A the working directory is missing at first and the skills listing for the whole step; the model guessed a directory and stalled. | T (directory): `hydrate` states the working directory. It will also list the skills, agent types and tools the step needs, from `flow.toml`. |
| The mod's own tool needed a search before each use | T: the mod pins it in front. |
| Esc at a permission dialog does not report as an interrupt | T: the mod holds on the transcript's interrupt row instead. |
| A turn can end without `step_done` | The mod nudges twice, then stops with a fault. One nudge fired and recovered in the soak; the stop was not exercised. |
| Saving the mod's file mid-session reloads it and wipes its memory | Hold, pending resets and kept messages are stored outside the mod's variables. |
| The whole hydrated text is printed on screen at every reset | Open: collapse that row in the display. Robin should judge from the demo. |
| A sub-agent that finishes after a reset reports into a context that has forgotten it | No reset while any sub-agent runs. The guard is written and untested. |
| The mods API is early access, has already drifted from its docs, and can be switched off remotely | The reset sits behind one function. The fallback is route G. |

A context-size guard runs beside this: if usage passes a set share of the window inside a step,
the mod asks the orchestrator to checkpoint and resets at the next turn end.

### 4.3 How tightly the flow holds the orchestrator

Robin asked for two paths scoped, with a way back from the first to the second.

- **Path A, guard rails:** the mod refuses a short list of actions.
- **Path B, advice only:** the flow is text the orchestrator reads; nothing refuses anything.

**Does advice decay if we control the reset?** The decay on record (§1.5) came from a model
summarising its own instructions repeatedly. Rebuilding from files re-inserts the flow word for
word at every reset, so that cause is removed under either path. What remains is ordinary
non-compliance inside a step: the hand-run 8.3 build skipped a gate with its rules in view, and 6
of 8 write-scope violations went unnoticed by every model that saw them. Re-insertion does not
fix those, and they are the silent, costly kind.

**Proposal: one design with a switch per guard. [decided]** Each guard in `flow.toml` is set to
`refuse` or `warn`. Path B is every guard on `warn`. Start with four guards on `refuse`:

| Guard | Refuses | Evidence |
|---|---|---|
| G1 write scope | an edit outside the files the acting role may write | 8 violations, 0 false positives |
| G2 attested done | marking a unit or release done without its gate result for that tree | skipped full-suite gate |
| G3 readiness | dispatching an audit of something that does not yet exist | 29 withdrawn findings |
| G4 one committer | a commit by anyone but the orchestrator | silent out-of-target commits |

G2 lives in `lst`; the others are `tool.call` hooks in the mod. Two limits keep this from growing
back into a driver. A new guard needs a recorded silent miss from a real run. A guard may only
refuse with a message (principle 5). If the mod passes about 1,500 lines, that triggers a review
of whether path A has become a quagmire; the fallback is to set guards to `warn` and delete code.

### 4.4 Skills as swappable parts

`flow.toml` maps each step to a skill at a pinned version, with a contract: the files the
sub-agent is given, the files it may write, and the shape of its hand-back. A short wrapper
prompt, owned by Leitstand, tells the sub-agent to use the skill and to hand back in that shape.
`lst intake` checks the shape. The mod's `agent.spawn` hook applies the model and write scope
from `flow.toml`, so the orchestrator cannot dispatch a role wrongly by accident.

**First picks [decided, each swappable]:**

| Step | Skill | Note |
|---|---|---|
| Interview | superpowers `brainstorming`, cut down | interactive by design, which suits phase 1 |
| Scope and spec review | werkbank's seven-lens panel | used for werkbank 8.3's scoping and for this draft; its yield per token is not established |
| Package plan review | compound-engineering's document-review lenses | expected to cost less than the full panel; not measured |
| Planning | superpowers `writing-plans`, for its content | its markdown plan format is not used |
| Writing tests, writing code | superpowers `test-driven-development`, as two roles | superpowers has one agent do both; we split them |
| Debugging | superpowers `systematic-debugging` | |
| Code audit | compound-engineering review personas | structured findings, script for exact duplicates |
| Second audit signal | built-in `/code-review`; `/security-review` at release | black boxes, used as gates only |
| Re-review of a fix | superpowers' scoped re-review of the fix diff | |
| Lessons | compound-engineering `ce-compound` rules | applied to process notes |

superpowers' sub-agent-driven-development cluster is its best-engineered part, but it is tied to
its own plan format and ledger, which `lst` replaces. We take its ideas (hand-over by file, short
hand-backs, resume the author for the first rounds and a stronger fresh agent after) and not its
code. Its rule that sub-agents may not use sub-agents is dropped.

**A step's runner is replaceable too.** Today every role runs as a Claude sub-agent. The contract
is files in and a checked hand-back out, so `flow.toml` gives each role a `runner`, and a later
runner can be any command that meets the contract, such as a reviewer from another model vendor.
None is available now **[Robin, 6 Oct]**; the slot costs nothing and is where the "different
signal" of §5.2 would go.

**Updating a skill** is: change the pin, read the diff, and run the acceptance fixture (a small
fixed project) to check hand-backs still pass intake.

---

## 5. The flow, with changes to Robin's sketch

**Status of this section.** Robin describes the flow in his brief as his uninformed thoughts,
offered for discussion. This section follows it closely and has not weighed it against other
flows. The review panel is asked to propose alternatives, backed by prior art, spikes or
werkbank's record (`reviews/PANEL-BRIEF.md`).

### 5.1 Phases 1 and 2: scoping and planning

Robin's sketch is kept, with these changes.

- **A mechanical lint comes before every review panel.** `lst lint` on the spec or plans (ids,
  links, interfaces, cycles) costs nothing and removes the class of finding a panel should not
  spend tokens on.
- **The per-package review uses two or three lenses, not seven.** The seven-lens panel cost about
  893k tokens on one design. The full panel is kept for the spec.
- **Seams are data, and the gestalt review is where they are judged.** Each package plan declares
  the interfaces it consumes and produces. `lst lint` checks that every consumed interface has a
  producer with a matching declaration. A seam is an edge between units in different packages.
  Seam tests are written by the consumer's test writer against the declared interface. Robin's
  rule (a unit's code is not released until the tests of every seam unit that depends on it
  exist) becomes a declared edge that `lst next` honours. Edges are direct, never a computed
  closure, which deadlocked in werkbank.
- **Robin signs the spec and nothing after it. [Robin, 6 Oct]** Plan changes go through the
  package review lenses and are recorded in the plan.

### 5.2 Phase 3: implementation, per unit

```
write tests ⇄ gate T1      (writer; tests fail for the right reason)
audit tests                 (code does not exist yet, so the auditor cannot copy it)
   reset to unit
write code ⇄ gate T0, T1    (implementer; a different agent from the writer)
mutation on the diff        (survivors answered with tests)
audit code                  (hand-back is failing tests; §5.3)
   reset to package
… after the last unit: package gestalt audit, reset to spec
… after the last package: whole-release audit
```

Changes from the sketch:

- **Mutation runs before the code audit.** It is cheap and removes weak-test findings from the
  expensive step. It does not replace the audit: it pointed at only 9 of 27 audit finds.
- **Audit rounds stop on a signal, not a count.** A round that yields nothing new after intake
  and grouping ends the series. The next check is a different kind of signal (mutation, the
  built-in review, a property run), not the same auditor again.
- **The orchestrator never edits product code or tests.** Every fix goes to a briefed implementer.
- **Parallel units** each get a git worktree. The number that can build at once is set by the
  machine (§8, S0-b).

### 5.3 Audits that hand back failing tests

**The hand-back.** A code auditor reads the code and returns, for each finding, a failing test
and a small record: the spec item it cites, the file and line, and one sentence. The expected
value in the test must come from the cited spec item.

**Intake is mechanical.** `lst intake` accepts a finding only if the test compiles, fails on the
current tree and cites a live spec item. A finding about the harness is routed, not judged as a
product finding (below). An intake check of this kind, replayed over werkbank's findings, would have removed 17 of 19
noise findings.

**Grouping comes before judging.** Exact duplicates are removed by script. The orchestrator then
groups what is left by root cause and rules once per group. Judging is where the money went.

**Is the test right?** A failing test can encode the auditor's misreading. The ruling on a group
is exactly that question: does the cited item require what the test expects? A "no" is either a
rejected finding or a spec question for Robin.

**Fix once, everywhere.** For an accepted group the implementer first writes a test that finds
every site of the fault, then fixes them together. 9 of 12 canary finds were siblings.

**Keeping fixes from causing bugs.** werkbank recorded its own fixes as a leading source of new
defects (§1.3), so these are requirements, not insurance:

- a fix must turn its own tests green and keep the unit's tests and diff mutation green;
- a fresh reviewer reads the fix diff only;
- each fix is one revertible commit;
- after two fix cycles on one group, the question becomes whether the fix is at the right layer.

**What the finding is about decides its form.** Every finding names its target:

| Target | Form of the finding | What happens |
|---|---|---|
| Code | a failing test citing a spec item | fix loop above |
| Tests (weak) | a mutant the tests let through | the writer adds a test that kills it |
| Tests (wrong) | the test's expected value set against the spec item it contradicts | the writer corrects it; the unit's code is re-gated |
| Plan | prose citing the plan entry and the spec item or other plan entry it conflicts with; plus a failing test where the fault shows as behaviour | below |
| Spec | prose citing the items in conflict, or the gap | a question for Robin (§5.6) |
| Harness | prose naming the gate, tool, wrapper or fixture, with the output that shows it | below |
| Missing feature | prose citing the spec item with no code behind it | ruled on, then an ordinary unit of work |

**A fault in the plan.** The usual sign is a test that fails although the code does what the plan
says. The ruling then goes against the plan, not the code. The plan entry is changed through the
package review lenses, the change is written into the plan, and `lst issue add` reopens every
unit built on the old entry. Robin is asked only if the spec must change too. An auditor who sees
the plan fault directly, with no behaviour to test, files it as prose; `lst lint` rules are added
where a plan fault is of a kind a lint could have caught.

**A fault in the harness.** werkbank's auditors filed the harness's own artefacts as product
findings about 24 times, and its keyword screen for such findings caught 3 real defects among 19
hits. So intake **routes** these and never rejects them. A harness finding goes to Leitstand's own
issue list, not to the unit. If the fault makes a gate result wrong, the affected attestations
are withdrawn and the build holds for Robin, since a build cannot be trusted to repair its own
referee; otherwise the unit carries on and the issue is taken up in the run review (§5.5). The
project's own test fixtures count as tests, not harness.

The prose forms are watched: if most findings arrive as prose, the failing-test rule is not
working.

### 5.4 Gates

| Tier | When | What | Target time |
|---|---|---|---|
| T0 | after each edit, by hook | `cargo check`, clippy, fmt on the crate | seconds |
| T1 | end of a unit step | tests of the crate and its dependents; mutation on the diff | a few minutes |
| T2 | end of a package | all workspace tests | [open: measure] |
| T3 | a real release | full tests, full mutation, end-to-end run, `/security-review` | [open: measure] |

- **Hooks run T0 and T1**, because agents asked to run checks often do not.
- **A gate result is an attestation for a tree hash.** The same tree is never gated twice, and G2
  needs the attestation before "done".
- **The model sees a quiet result**: pass, or the failing lines and a pointer to the full output
  on disk.
- **The crate is the unit of gating**, since cargo cannot select tests more finely. Crate
  boundaries are therefore decided in the package plan, and small crates are preferred.
- **Versioning as Robin proposed [decided]:** `a.b.c`, with `c` a feature or fix, and only even
  `b` a real release. T3 gates the step from odd to even `b`.
- **T3 also runs on a schedule when the machine is idle, without blocking.** Its results enter as
  findings. Otherwise the full suite is run only at release, which is how werkbank's grew to 3.5
  hours unseen and was then skipped.
- **Live model runs are exploration**, never a gate.

**Gates run through stellwerk from the start, by thin shims. [Robin, 6 Oct]** Leitstand calls
stellwerk's gate command and never calls cargo itself, so its commands stay the same when
stellwerk's real Rust support arrives. This is the pattern Robin describes for werkbank 8.3. One
caution from the survey: werkbank does not yet call the gate module, and its `mutate` role runs
werkbank's own Python harness, so the pattern is designed but not yet proven in use.

What exists today (`research/stellwerk-shims.md`): one module, `stellwerk/gate.py` (840 lines),
run as `python -m stellwerk.gate lint|types|tests|mutate|cmd`. It prints one JSON object (status,
counts, items, path of the full log), writes the raw output under `.stellwerk/logs/`, and exits
0, 1 or 2. Its language table holds Python only, and its tools are a closed list.

What Rust needs there:

| Role | Rust tool behind it | Work in stellwerk |
|---|---|---|
| `lint` | clippy, JSON messages | table entry and a parser |
| `types` | `cargo check`, JSON messages | table entry and a parser |
| `tests` | cargo-nextest, junit output | table entry; the junit parser exists |
| `mutate` | cargo-mutants `--in-diff` | new: today this role is tied to werkbank's Python harness |
| `affected` | crates changed and their dependents, from `cargo metadata` | new role: stellwerk has no affected selection at all |

`flow.toml` maps tiers to these roles: T0 is `lint` and `types` on the crate; T1 is `tests` on
the affected crates and `mutate` on the diff. `lst gate <tier>` runs them, reads the JSON and
records the attestation, which stellwerk does not hold. Three things to settle in S1: the shim
has no scope argument, so the crate is passed as extra arguments for now; affected selection and
attestation in werkbank are Python-only dev tools that cannot be lifted as they are; and
Leitstand, though it targets Rust, needs Python present to run its gates.

### 5.5 Phase 4: review of the run

The mod writes tokens and time per step and per role to `ledger/usage.jsonl` as the build runs.
The review step reads that ledger and the process notes and proposes changes to `flow.toml`, the
wrapper prompts and the guards. Its output is those proposed edits, each with the figure behind
it, plus a one-page report for Robin. compound-engineering has nothing that reads cost; this step
is ours.

### 5.6 Decisions

As Robin specified. A decision with a clearly better option is taken and written into the plan or
spec item it affects. A decision that changes the spec is written to `spec/questions/` as a
problem, background, options with pros and cons, and a recommendation; its package is parked and
`lst next` offers other work. Robin sees open questions in a status pane and answers in the live
session.

---

## 6. Language

**Target Rust. [Robin's lean; adopted]** The case is Robin's: the model-skill advantage Python
once had has gone, and Rust's correctness advantages do not depend on who writes the code. Three
consequences shape the design.

- **Compile time is the gate cost.** Hence small crates, a shared build cache across worktrees,
  and T0 as `cargo check`.
- **The compiler says nothing about whether numbers are right.** Numeric spec items carry a
  tolerance and a reference result held as a fixture.
- **Statistics libraries have gaps** (mixed models, survival, GAMs, Bayesian regression). Robin's
  first year is tools, pipelines and numerical kernels, which Rust covers, so calling R is
  **deferred [decided]**. The pattern proposed for later is a thin R or Julia script run as a
  subprocess with Parquet exchange, used first as a reference for tests.

`lst` is Rust. The mod must be TypeScript. The spec and plan formats name no language, so a second
target later is a new gate adapter and new wrapper prompts.

**First outside job: a data pipeline writing to DuckDB. [Robin, 6 Oct]** Its natural checks are
schema and row-count contracts, idempotent re-runs, and property tests over generated input
against an in-memory database. One thing to measure early: building DuckDB from source inside
cargo is slow, and linking a prebuilt library may be needed to keep T1 short.

---

## 7. Build order

Built by hand first, then by itself. **[Robin, 6 Oct]** Each stage leaves something usable.

| Stage | Content | Built by |
|---|---|---|
| S0 | Spikes (below) | hand |
| S1 | `lst` core (schema, `done`, `issue`, `note`, `hydrate`, `lint`, `gate`); the reset mod; `flow.toml`; G1 and G2; the Rust shims in stellwerk | hand |
| S2 | The unit loop on Leitstand itself: writer, test audit, implementer, T0 and T1, diff mutation | itself, watched |
| S3 | Audits as failing tests: intake, grouping, fix loop, G3, G4 | itself |
| S4 | **The DuckDB pipeline**, with a hand-written spec and plan | itself, unattended |
| S5 | Planning phase and seams | itself |
| S6 | Scoping phase (interview, panel) and the run review | itself |

The pipeline comes at S4, before planning and scoping are automated, because it is the earliest
test of the two failures Robin named as most likely (§8).

**Spikes before S1:**

- **S0-a, reset in a live terminal session: done, stopped early** (§4.2). Two short tests
  remain, and Robin's own look at the demo (`research/spike-live/drive/demo.sh`):
  - **A1:** route A with a deliberately slow hook, with and without an error handler. Decides
    whether the silent fallback is closed or only detected. About 10 minutes.
  - **F2:** route F for 30 resets with a typed message, an Esc, a sub-agent in flight, a stale
    cut rebuilt mid-run, and forks pruned. Decides whether F is safe to build on or A is used.
    About 40 minutes. Best run as the first job of S1, on the real mod.
- **S0-b, gate times on Robin's laptop.** A skeleton workspace with DuckDB and three small crates:
  time T0, T1 and diff mutation, cold and warm, with one and with two builds at once on 8 GB.
- **S0-c, guards on `warn`.** A three-unit toy build with every guard on `warn`, counting what
  each would have refused. This is the first evidence on path A against path B.
- **S0-d, intake in Rust.** Twenty seeded faults in a small crate; an auditor must hand back
  failing tests. Count how many pass intake and how many are right.

---

## 8. Designing against the two likely failures

Robin's pre-mortem named two reasons he would stop using this. **[Robin, 6 Oct]**

**"I do not trust what comes out."**

- Tests are written before code, by a different agent, and audited before the code exists.
- Every checkable spec item is linked to a test, checked both ways.
- Diff mutation runs on every unit; audit findings are tests that stay in the suite.
- A fix is re-reviewed and revertible.
- **Acceptance bar for S4:** Robin reviews the finished pipeline by hand. The count of defects he
  finds that a spec item covered is the measure; the target is set after S0-d. **[open]**

**"It is too slow or too dear."**

- One ruling per group of findings, after mechanical intake.
- Gates scoped to the crate and never repeated for the same tree.
- Review panels sized to the document.
- No stops after the spec is signed.
- **Honest gap:** this draft has no cost estimate for a build. Nothing comparable has run. S0-b
  and S2 give the first figures, and the draft's targets must be set from them, not before.

When the two pull apart, Robin's attention wins **[Robin, 6 Oct]**; between usage and wall time
the draft puts usage first **[decided]**, since under the throttle usage is time.

---

## 9. Open decisions

| Id | Question | Recommendation |
|---|---|---|
| O1 | The name | Settled: Leitstand. **[Robin, 6 Oct]** |
| O2 | Gates through stellwerk or a thin wrapper | Settled: stellwerk from the start, by thin Rust shims in its gate module (§5.4). **[Robin, 6 Oct]** |
| O3 | A reviewer from another model vendor | Settled: none now; the runner slot allows one later (§4.4). **[Robin, 6 Oct]** |
| O7 | Which reset route | Settled: F (SDK fork at a message, resumed in the terminal), A as fallback, G if mods are withdrawn (§4.2). **[decided]** |
| O4 | TOML or YAML | TOML; revisit after S1 if nested tables are awkward |
| O5 | Mod size limit of about 1,500 lines as the trigger to reconsider path A | A tripwire, not a rule |
| O6 | Where Leitstand's own repository lives and when werkbank is frozen | New repository **[Robin, 6 Oct: new project, reuse parts]**. When werkbank is frozen is **[open]**; the draft assumes after 8.3 and H. |

**Parts to lift from werkbank [decided]:** the write-scope check, the mutation harness design,
the crash-at-random-points test method, the intake check, and the review-panel lenses.

---

## 10. What this draft does not settle

- **Orchestrator judgement errors.** werkbank's notes record orchestrator mistakes unrelated to
  context size. Guards catch only the kinds listed. This draft has no further answer.
- **A watchdog.** Something outside the session must restart it after a crash and wait out a
  usage limit. It should do only that (start the session with `lst hydrate`), but it is a second
  deterministic part the half-page design does not show, and it is where a driver could regrow.
- **Cost.** No estimate exists (§8).
- **The reset is tested only briefly.** The chosen route has run 8 resets, on haiku, with filler
  state and a toy step; the fallback 19. Sub-agents in flight, hours of idling at a usage limit, and a real build's
  permission prompts were not tested; permission dialogs were the commonest stall in the spike.
- **Recovery.** If the session dies mid-step, a new session hydrates from files and the
  orchestrator must work out what the half-finished step left. werkbank found resume its buggiest
  path. The draft relies on steps being small and state being written only at step end; S1 should
  test this by killing the session at random points.
- **Rate limits and the throttle** are treated as pacing. How the live session behaves when
  parked for hours has not been looked at.
- **The orchestrator's rulings are unaudited.** werkbank's self-check forks changed 9 rulings in
  100 overall (1 in 29 where the ruling touched only source or tests), so none are proposed here. The run review (§5.5) samples rulings instead.
- **Evidence limits.** Most werkbank figures come from one run. Rust figures for agents writing
  property tests were not found; the 56% figure is from Python.

---

## 11. Evidence index

| File (under `successor-plan/`) | Content |
|---|---|
| `BRIEF.md` | Robin's brief, 6 Oct, and the interview answers |
| `research/werkbank-evidence.md` | werkbank's record: size, cost, gates, audits, state, lessons, with file and line |
| `research/v3-segments.md` | why werkbank v3's segmented orchestrator became a driver |
| `research/stellwerk-shims.md` | stellwerk's gate module today and what Rust needs in it |
| `research/mods.md` | what Claude Code mods can and cannot do, from the docs |
| `research/spike-reset/` | the first reset spike (headless): report, mod source, run scripts, logs |
| `research/sdk-and-frontends.md` | the Agent SDK's session control (resume at a message, fork), ways to attach to a session, third-party front-ends |
| `research/spike-f1/` | the third reset spike (route F): report, fork helper, mod |
| `research/spike-live/` | the second (live terminal, four routes): report, mod, driver scripts, demo; run logs kept locally |
| `research/superpowers.md` | superpowers 6.4.2: inventory, wiring, weak spots |
| `research/compound-and-others.md` | compound-engineering 3.30.3 and other skill sources |
| `research/rust-proptest-interop.md` | Rust property testing, failing-test audits, gate cost, R interop |

Two articles Robin supplied as background, not as authority: awesome-testing on mutation testing
for agent-written code (August 2026), and Böckeler on sensors for coding agents (May 2026). The
tier table in §5.4 and "hooks run the gates" draw on the second; "survivors answered with tests"
on the first.

---

## 12. Glossary

- **Attestation:** a recorded gate result for one tree hash.
- **Checkpoint:** the TOML files under `leitstand/`; the build's whole state.
- **Guard:** a deterministic refusal of one kind of action (§4.3).
- **Hydrate:** produce the text a reset rebuilds the context from.
- **Intake:** the mechanical check of an audit hand-back.
- **`lst`:** the command-line tool that reads and edits checkpoints.
- **Mod:** a Claude Code plugin made of hooks, written in TypeScript.
- **Orchestrator:** the model in the live session that runs the build.
- **Package, unit:** a package is a planned group of units; a unit is one file or tight group of
  files with its tests.
- **Reset:** replacing the conversation with hydrated text.
- **Seam:** a dependency between units in different packages.
- **Step:** one entry in `flow.toml`; a reset follows it.
- **T0 to T3:** gate tiers, from per-edit to per-release.
