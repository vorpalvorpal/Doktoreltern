# Red Team, round 2: appendix

Scratch (scripts, every note written, logs): `reviews/scratch/round-2-red-team/`. Markers: **[C]** checked by me this round, **[U]** not
verified.

## B1. The record of substrates against jobs [C]

From `git log` in each repository on 2026-10-06.

| Repository | Commits | Span | Real work it has done |
|---|---|---|---|
| Doktoreltern v1 | 251 | 2025-11-21 to 2026-08-11 (then 8 today) | A seven-node toy (auditor row 5). No commit to `ctx/` or `store/` after 24 July |
| werkbank | 722 since 2026-08-09, on 31 distinct days | | Round 1: since July, phases 5 to 7 of one package of outside work |
| sampleTidy | 230 | 2026-06-18 to 2026-08-09; 228 of them from 14 July | Itself: 15.8k lines of R, 1,286 tests, first live batch on 9 August. Nothing since |

- sampleTidy was built with the `tdd-plan` skill as it stood in July (`dev/tdd-run/`; werkbank CHANGELOG v3.3, "the sampleTidy harvest").
  The tool being replaced produced the job's whole code base in under four weeks. What stopped work on the job was work on the tool.
- sampleTidy `dev/STATE.md`, "Next": (1) ACIRL gas readings, "scoped below, no blockers found"; (2) the corpus run, about 265 files; (3)
  six dust conflicts and one alias. A port is not on the list.
- Robin's words of 8 August (`research/lean-on-existing-code-synthesis.md:3`): "I think we have been going about this all wrong. Let's try
  and lean on existing code." That review kept the store and the scheduler and was not acted on (auditor row 14).

## B2. Growth of the plan in one afternoon [C]

| | Synthesis §3 | After Architect and SRE, round 2 |
|---|---|---|
| Tool verbs | 7: `mark`, `rewind`, `put`, `get`, `lint`, `render`, `next` | 15: + `marks`, `ready`, `record`, `sign`, `answer`, `migrate`, `work begin`, `work end`; `next` becomes `rank` |
| Mod commands | 0 | 4: `/handover`, `/mark`, `/hold`, `/go` |
| Operator commands | 0 | 3: `rewind --undo`, `leitf handover`, `leitf doctor` (plus a `claude-rw` alias) |
| Rung 1 parts | "Rewind alone. A handover note at a context threshold" | Mod (five states), Node helper and SDK install (274 MB), run-state file, note checker (nine headings, cap, paths), route A fallback, manual fallback, undo log, version table, launch check, heartbeat, notify-only watcher, a 30-reset test |
| Files with schema | Item files | Item files, records, run state, `classes.toml`, `wiring.toml`, `rewinds.jsonl`, `events.jsonl`, format version with migrations |

Round 1's equivalent was `lst`: 9 commands in the draft, 23 after two reviewers. Mod sizes: F1 99 lines, spike-reset 201, spike-live 470
(`wc -l` on `research/spike-*/mod/hooks/register.ts`).

## B3. Spike: does a fact survive a chain of handover notes? [C]

**Question.** With the mark fixed at the first turn, everything learned later reaches the next context only through the note, and the next
note is written from that one. How fast do planted facts decay?

**Method.** `chain.py`. No mod, no session state: each generation is one `claude -p --model haiku --max-turns 1 --tools ""` call, run in the
scratch folder. Input: the previous note, plus six log lines of new work (synthetic: test runs, small decisions, a dead end, file edits, an
assumption). Instruction: write the next note under the Architect's nine headings, at most 400 words, "the only thing the next context will
have". Note 0 holds a quoted goal and twelve planted facts as a list: three owner rules ("Robin said: ..."), three decisions, three dead
ends, three paths or commands. Three chains, eight generations. Scoring: a loose regex per fact (`rescore` in the log below), then a read of
the notes for the owner rules.

**Cost.** 25 calls (one smoke test), $0.46 by the CLI's own figure. Nothing left running.

**Result.** Each cell is chains 1, 2, 3; 1 = fact still present.

| Fact | g1 | g2 | g3 | g4 | g5 | g6 | g7 | g8 |
|---|---|---|---|---|---|---|---|---|
| rule: no live database writes without Robin's word | 100 | 000 | 000 | 000 | 000 | 000 | 000 | 000 |
| rule: below the limit is stored with flag LT | 100 | 000 | 000 | 000 | 000 | 000 | 000 | 000 |
| rule: next free decision number is A87 | 000 | 000 | 000 | 000 | 000 | 000 | 000 | 000 |
| decision: tolerance 0.005 | 111 | 000 | 000 | 000 | 000 | 000 | 000 | 000 |
| decision: wells keyed by label | 101 | 000 | 000 | 000 | 000 | 000 | 000 | 000 |
| decision: CH4 canonical, Methane an alias | 111 | 000 | 000 | 000 | 000 | 000 | 100 | 000 |
| dead end: readxl on the 2019 workbooks | 111 | 101 | 101 | 101 | 101 | 100 | 100 | 000 |
| dead end: GW-14 sampled twice | 111 | 101 | 101 | 101 | 001 | 000 | 000 | 000 |
| dead end: ES2600185 is not a real xls | 111 | 001 | 001 | 001 | 001 | 000 | 000 | 000 |
| path: `R/adapter-acirl-gas.R` | 101 | 101 | 101 | 001 | 001 | 001 | 001 | 001 |
| command: `devtools::test(filter=...)` | 111 | 111 | 111 | 111 | 111 | 111 | 111 | 111 |
| command: never `grep -r` the corpus | 111 | 111 | 101 | 101 | 001 | 000 | 000 | 000 |
| **alive of 36** | 27 | 13 | 12 | 11 | 9 | 5 | 6 | 4 |

- **Owner rules went first:** 2 of 9 after one rewind, 0 of 9 after two. No heading asks for them. (The one "100" hit on g1 for each of two
  rules is chain 1; in chains 2 and 3 none of the three survived the first note.)
- **Decisions went second:** 8 of 9 at g1, 0 of 9 at g2. New, smaller decisions from the log displaced them under "Decisions made".
- **What survives is what has a heading and a literal form:** the quoted goal (every note), one command, one path.
- **A promotion.** Chain 1, note 2, "Decisions made": "H2S 'below threshold' is reported, never dropped (assumed from sheet patterns)". The
  log line said "Assumed reported" under an open question. Nobody ruled on it; by note 8 it is back to
  "assumed", so the label is not stable either.
- The model wrote 266 to 397 words against a cap of 400, so the cap was not what squeezed the old facts out; recency was.

**Limits.** Haiku. A synthetic log of six lines against real stretches of tens of thousands of tokens (which makes my test lenient). Note 0
listed the facts under the goal, not under the nine headings, which may have cost some at g1 (it does not explain g2). The regexes are loose
in the model's favour. Not a test of opus, of a note written with the whole context in view, or of a store.

**What it supports.** (1) A model-written note is a poor carrier for anything that must persist beyond one rewind. (2) Things that persisted
were literal and had a slot. So: an append-only file for rules, decisions and dead ends, re-planted verbatim by the route, and a note for
state only. (3) The acceptance test for rung 1 is this test on the real model: plant ten facts, rewind ten times, count.

## B4. Hand-run of v1's scheduler over the port slices [C]

`handrun.py`. Imports `ctx/scripts/ctx_schedule.py` unchanged and gives it a model with the eight attributes it reads. Nodes: a root and the
eleven slices of `research/sampletidy-port.md` §4 (0 harness to 10 snapshots). `Blocked-by` edges as I read the survey: 1 on 0; 2 on 1; 3
and 4 on 2; 5 and 9 on 3; 6 and 8 on 1; 7 on 0; 10 on 4. Loop: call `next_node`; a floor pick raises the node to `interface`; a deepen pick
sets it `correct`, confidence high, closed.

| Confidence given | Floor order | Deepen order |
|---|---|---|
| All low | 1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10 | 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 |
| Units (7) and ACIRL `.xls` (8) low, the rest tentative | the same | the same |
| Units and `.xls` stamped high on assertion | the same | the same |
| Variant: slices 2, 6 and 8 also blocked by units; all low | 1, 7, 0, 2, ... | 0, 1, 7, 2, 3, 4, 5, 6, 8, 9, 10 |
| Variant, risk-marked | 7, 1, 0, 2, ... | 0, 7, 1, 2, 3, 4, 5, 6, 8, 9, 10 |

Centrality (first three rows): slice 1 = 3; slices 0, 2, 3 = 2; slice 4 = 1; slices 5 to 10 = 0. Priority is centrality times (1 minus
confidence), so six of eleven slices have priority 0 whatever their doubt, the two named risks among them. In no run did ACIRL `.xls` leave
9th place. The Green Hat's runs over R files (units 8th, `.xls` 20th of 28) and over v1's own store (3 of 31 picks decided by the formula)
say the same from different inputs. `next_node(model, *, pins=(), skips=())` is the signature: the override controls of a driver are there.

Limit: the edges are my reading of a survey, eleven nodes, flat under one root.

## B5. Ten boundary violations, in the order I expect them

Each is small and defensible when it happens. "Caught by" is the Architect's own test (tool tests run alone; grep of each tool's source for
the others' names; lint for order or condition keys in `wiring.toml`).

| # | Pressure | Violation | Caught by |
|---|---|---|---|
| 1 | After a rewind the model needs a focus | `--then "cat card; store render $(store ready \| head -1)"` | No: it is a wiring string and names no ranker |
| 2 | Ties in `ready` look arbitrary | `ready` gains a sort (blocked count, age, class) | No: it is inside B |
| 3 | A rewind fired in the middle of a task | The mod reads `work` run state before triggering | No: run state is shared by design |
| 4 | A rewound model forgets an open `work begin` | The mod submits a nudge naming the task | No. This is a resume path |
| 5 | The oracle gate needs the item's case id | A pack gate calls `store get --json` | No: gates are scripts |
| 6 | Robin signs | The mod's command calls `store sign` through a wiring string | No |
| 7 | Open questions must reach Robin | The watcher runs `store ready` or a query | No: "a configured status command" |
| 8 | A pack needs a rule the tools lack | A gate in `pack/gates/` that always applies | No: gates are allowed. It is a refusal by another name |
| 9 | Two gates must run in order (build, then compare) | One gate script that calls the other | No: the order moved out of the wiring into a script |
| 10 | A gate fault (exit 2) at night | The mod holds, then retries once | No. This is a fuse |

After ten the tools still pass their tests alone, and the system's behaviour is in a TOML file of shell strings, a mod with a state machine
and a `gates/` folder. None of it is a driver by the Architect's definition; together it is one. What would hold the line: wiring strings as
a command and literal arguments only (a ten-line lint); `ready` in id order, stated; one end-to-end test of the wired system per wiring row,
each with a seeded defect; and one tripwire that sums mod lines, mod event handlers, wiring rows and pack gates, reported with every release.

## B6. Rung 0, and the hybrid, as I would try them

**Rung 0 (this week, nothing early-access).** Job: the ACIRL gas readings adapter in R, or the corpus run.
- A `/handover` command (a prompt file): write `HANDOVER.md` with state, in flight, next; append anything Robin said, decided or ruled out
  to `CARRY.md`, never rewriting it.
- A settings hook on `SessionStart`, sources `clear` and `compact`: print `CARRY.md` then `HANDOVER.md` (10,000 characters a field,
  `research/mods.md:63`) [U: not run; the Green Hat cites the same hook from fetched documentation].
- Protected paths: `CONTRACT.md`, `OPERATING-RULES.md` and any expected values, hashed, checked by one script after each task.
- A tally Robin or the session keeps, one line each: every pause with its cause (context, a question for Robin, a crash, a dialog, the
  throttle noted but not counted), every re-telling, every ruling asked. Two entries of the same pain earn a module.

**The hybrid (rung 3 or 4, if the tally shows plumbing).** One blocking command the session model calls:
`run-until-decision <task>` = record the base tree, start the worker, compute the diff, run the scope check and the gates, write the record,
and return one of: met; deviation with the failing check; fault. It holds no table of cases. Anything but "met" goes back to the model as
text. A rule moves into the tool only when the model has made the same choice three times on record, and the rule cites those three records.
Compare on one slice: turns the session model spends, stops for Robin, and choices Robin later reverses, against the plain session.
Not tested here; a haiku spike of the 8-of-8 case with this tool in place of hand dispatch would be the first evidence, at about $0.50.

## B7. The three gate levels (added after the owner's second update)

The table in synthesis §6 (mechanism, profile, gate plan) and questions 45 and 46. Read: the table; sampleTidy's `tests/testthat/` listing;
the folder listings of v1's `r-data/` and `r-science/`. Nothing run.

**What the record says.** Per-project gates are what sampleTidy already has: `test-coverage-map-lint.R`, `test-mock-scope-lint.R`,
`test-payload-lint.R`, `test-e2e-corpus.R` and four corpus gates behind an environment variable [C, by file name]. They were added during
the build as needs appeared. No profile supplied them and nobody chose them at spec time.

**Story (a): the gate plan becomes a phase.** Before any code, a model drafts the plan from a profile's menu; because the plan is to be
signed, it is audited; the audit finds gaps; each gap is a ruling. That is a spec-time loop of model judging, which is where 62% of run 3
went. Its output is twenty items with pass marks. A pass mark set before the code exists is a guess: "mutation score at least 80%" is a
coverage threshold under another name, which §6 itself rules out.

**Story (b): Robin cannot tell a good plan from theatre.** He signs because the list looks thorough. Thoroughness is the theatre signal: a
long plan of checks that exist is not a plan of checks that can fail (the Green Hat's point on §6.1). Six weeks later a wrong value reaches
the database through a path no line covered, and every line was green.

**Story (c): the signed plan freezes its own mistakes.** A gate that is too slow or accuses wrongly is Robin-owned, so the agent may not
touch it; each one stops for him. In werkbank the harness's own faults were the commonest stop and 194 of 360 hours. If the answer is "the
agent may tune parameters", then pass marks are not protected and signing them meant nothing.

**Story (d): profiles multiply.** Four classes are named in the table before one project has used one. v1's two "advisors" are two trees of
eight and nine folders [C, listing]. A profile is a rule set held as defaults; classes cross with languages (a pipeline in R, in Python,
half-ported) and each crossing wants its own defaults. This is werkbank's rule growth with the rules moved into packs.

**What I would do.**

| Layer | Who owns | Form | Changes when |
|---|---|---|---|
| Outcomes | Robin, signed | A sentence in domain terms naming a wrong result that must not happen: "re-ingest changes nothing"; "no row is lost between file and database"; "a value below the reporting limit is never stored as zero" | He rules |
| Checks | The agent | Mechanism, parameters, pass mark, time budget, each linked to one outcome | Freely; the change is listed in the report |
| Proof | Mechanical | Each check has been shown red once on a planted violation of its outcome; Robin is shown that red run, as rows | The check changes |

- Robin can judge this plan without engineering: every line is a thing he fears, and he has watched it fail. A check linked to no outcome is
  theatre and lint can say so. An outcome with no check is a visible gap.
- Weakening an outcome is refused; tuning a check is not a stop. That answers question 46.
- The plan fits one screen. A check joins when an escape is on record, or when an outcome is new; never because a menu offers it.
- No profile exists until two projects' plans share lines; then the shared lines are copied out. Until then the mechanism level and one
  project's plan are all there is.
- Seeded proof per check is the narrow form of §6.5 that I would keep: it is tied to an outcome, so it does not become a canary suite.

Not verified: whether outcomes in this form cover what a numerical kernel needs; I have only sampleTidy in view.
