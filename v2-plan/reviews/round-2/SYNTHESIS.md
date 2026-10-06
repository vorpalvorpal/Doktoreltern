# Round 2 panel, consolidated

2026-10-06, for the next draft of `V2-SYNTHESIS.md`. Sources: AUD = `evidence-auditor.md`, ARCH = `architect.md`, ECON = `economist.md`, SRE = `sre.md`, GH = `green-hat.md`, RT = `red-team.md`, BR = `bar-raiser.md`; `-A` = that lens's appendix; FF = `research/file-formats.md`; S = the synthesis. A cite is file plus heading or part. **[inf]** marks my inference. Every model spike in both rounds ran on haiku. Section 10 holds things to weigh, not demands; only its first row is needed before rung 0.

## 1. The module split
| Concern | Synthesis (S §3) | Architect (ARCH-A §7) | Green Hat (GH "The modules"; GH-A C1–C6) | Bar Raiser (BR §1) | Others |
|---|---|---|---|---|---|
| Returning a session to an earlier point | A Rewind: `mark`, `rewind --then` | **Session**: mod, fork helper, run state; the same verbs, route behind them | Long-session kit, first built from native `/rewind` and a hook | **Session**: `handover`, `mark`, `rewind --then` | SRE "Rung 1": three parts (mod, helper with a 274 MB SDK, command file); helper-only path first |
| Standing rules across a reset | The rules card, in pack F | A wiring string: `cat card; store render` | A hook re-plants the card and a state file | **Carry**: a file under 9,000 characters, re-planted word for word | RT "The modules" 3: two carriers, a note for state, an append-only file for rules |
| Trigger, status, watching | G Watch; the trigger written under A | Trigger and status inside Session; **Watchdog** a separate process | "Say who pulls the trigger"; triggers are G's | As Architect; Watchdog later | SRE MUST 4: flow-less, notify-only, own dead-man check |
| Structured items and `render` | B Store: `put get lint render` | **Store**: `put get lint ready render record sign answer migrate`; `render` inside, sections fixed | Four markdown files and a lint script first; **`render` outside** the store | **Store** `put get lint ready`, "only when plain files fail twice"; `render` a separate command | RT story 3: a linter over files he already keeps. ECON MUST 1: only if the baseline shows notes failing |
| Ownership / consent | C: owner field, a store refusal | A policy on `put` in the store; Robin signs through the mod | A **rule over paths** (permission deny or hook), no store | A rule over paths, **checked by a gate** | RT 2: hashed paths, scope gate. SRE: C is not a clean boundary |
| Checks, and what they compare against | D Gates; §6.6 protected values | **Gates** plus a scope gate and registry lint; hashes checked by a gate | D split: running exists; **Expectations** is a new piece | **Gates** (with scope and hash checks) and **Expectations** (Robin's files, not a tool) | ECON: the oracle gate has the highest return. All keep exit 0 / 1 / 2 |
| Agent work | E Workers | **Work**: `begin`, `end`, one immutable record | Sub-agents with worktrees | Work, after the baseline | RT-A B6: later one tool, `run-until-decision` |
| Flow | F: schema, card, step table, "no code" | **Pack**: card, classes, wiring, gate scripts; lint against order and condition keys | A **skill**, scripts allowed | A skill: card, classes, gate profile, scripts | RT-A B5: pack gates are refusals outside any line count |
| Choosing next work | H Chooser | `ready` in the store; optional **Rank** | Habit and a risk list; no `next` | `ready` in id order; Rank not built | ECON, RT: do not build |
| Where names cross | "Lower never names higher" | No imports; one **wiring file**; machine-local **run state** | Layers, plus the artefact-and-owner cut | Architect's rule with RT's guards | RT MUST 3 |

- **Agreed** (six lenses; AUD gave evidence only): base-and-pack is the right cut; C and H are not modules; readiness is separate from ranking; no step table; gauges derived, never stored; two verbs with the route behind them; `render` is first to need a rethink (ARCH Q40, GH-A C6) and the store's format is the dear thing to change (AUD "The modules").
- **Conflict, ownership.** ARCH MUST 2 folds C into the store; GH, RT and BR make it a rule over paths. BR-A F overrules ARCH "for now": he concedes the store refusal is a tripwire, and the path rule works on sampleTidy's `CONTRACT.md` today. Open inside the majority: refused before the write (GH: permission deny or `PreToolUse` hook, from knowledge) or caught after it (RT, BR: hashes and a scope gate).
- **Conflict, `render`.** ARCH in; GH and BR out. BR: ARCH's own rule that only the tool reads the files makes the separation free.
- **Conflict, the pack.** S: data only. ARCH: data plus gate scripts. GH, BR: a skill. All now allow scripts; open is whether "no control flow" is linted (ARCH, RT) or only stated.
- **Conflict, store location and thin modules.** ARCH and SRE want the store in its own repository; RT story 3 says that moves 86 rulings away from the code they govern (not ruled; the store is deferred). GH MUST 2 wants every module thin from day one; RT and ECON want a module only when a pain has occurred twice; BR takes the second and keeps GH's "first implementation of every contract is configuration".
- **The split the panel as a whole supports** is the Bar Raiser's: the Architect's pieces plus Carry and Expectations, ownership as a path gate, `render` outside the store, packaged as two kits (long-session: Carry, Session, Watchdog; trust: Gates, Expectations, Work).

| Piece | Contract | When |
|---|---|---|
| Carry | One file of standing rules, decisions and dead ends; under 9,000 characters, size-checked at every write; re-planted verbatim at each context start; never written by summarising | Rung 0 |
| Session | `handover` (write and check a state note), `mark`, `rewind --then`; exit 0 done, 1 unknown or stale mark, 2 fault with nothing discarded (ARCH-A §2); run state machine-local | Note at rung 0; the rest when the tally asks |
| Gates | One command per check; 0 met, 1 deviation (to the worker), 2 tool fault (always stops); includes the scope gate and the hash check on owned paths; knows no project | Exists; two additions |
| Expectations | Robin's files: marked examples, goldens, the gate plan, any normaliser; changed only by his ruling | Rung 0 |
| Work | `begin` records the base tree; `end` computes the diff, runs scope and gates, writes one immutable record; knows no model or skill | After the baseline |
| Store, Render | `put get lint ready`, `ready` in id order; fixed kinds, classes as lint rows, bodies never parsed, six format rules (ARCH). Render: a separate pure command that passes the cold-reader test | When plain files fail twice |
| Watchdog, Pack, Rank | A separate notify-only process; a skill with card, classes and scripts, no order or conditions; Rank not built | Later |

**Modularity tests proposed.** ARCH: each tool's tests run with the others absent; a grep of each tool's source for the others' names is empty; a deletion table (ARCH-A §1); lint that the wiring has no order or condition keys. RT MUST 3: a wiring string is one command and literal arguments (no pipe, `$(`, `;`); one wired end-to-end test with a seeded defect per wiring row; one tripwire summing mod lines, handlers, wiring rows and pack gates. BR-A C: M1 deletion run for real, each fallback used for a real session; M2 a second implementation before a contract is called fixed; M3 three sessions ending in sampleTidy commits before the next piece starts; M4 one rethink drill in week three or four; tripwire of 1,500 lines and eight verbs before any pack [P]. ECON: one directory and test file per module, removal test once in week 4.

## 2. Rung order
| Lens | First thing built | Then | Cite |
|---|---|---|---|
| Synthesis; Auditor | Rewind alone (AUD: plus tokens per reset and one cold-reader check) | Store and consent; baseline; pack; chooser | S §8; AUD "Rung 1" |
| Architect | The mod (about 200 lines), helper and nine-heading note on route F, after an hour's spike | Store at rung 2; baseline at 3, before any pack | ARCH "Rung 1"; ARCH-A §4 |
| SRE | `leitf handover`: the SDK helper alone, no mod | Mod with deferrals; `rewind --undo` and a notify-only watcher; a 30-reset test | SRE "Rung 1" |
| Economist | Rewind with a per-reset log, as a measuring instrument | **Baseline with an oracle before the store** | ECON "Rung 1", MUST 1 |
| Green Hat | A thin skeleton of every module on one sampleTidy **port** slice; the "no tools" run first as baseline | Code where the thin part hurt | GH "Rung 1"; GH-A C5 |
| Red Team | **Rung 0:** the gas adapter or the corpus run, in R, in a plain session | "Rung 1 is whatever the tally asks for"; `run-until-decision` at rung 3 or 4 | RT "Rung 1"; RT-A B6 |
| Bar Raiser | **Rung 0**, "not a module": a real sampleTidy job in R | The Architect's mod with the SRE's additions, only if the tally asks | BR §2 |

- **Rung 0 in both versions:** a plain session on the gas readings adapter (or the corpus run) in R; a `/handover` command; a `SessionStart` settings hook; `CARRY.md`; a tally of pauses by cause, re-tellings and rulings asked. RT adds protected paths hashed and checked by a script, an append-only `CARRY.md`, and "two entries of the same pain earn a module". BR adds a **signed gate plan** (BR-A E), a script check on the note, a size cap on Carry, and a tally column for **decisions the model took unaided, later marked kept or reversed**.
- **Agreed first build:** RT, BR and ECON put real sampleTidy work before the store, RT and BR before any module; SRE's first step needs no mod; GH agrees on baseline first but as a port slice, which RT and BR reject. ARCH and AUD keep rewind first.
- **Stop lines, BR §2, §4, §5 [P]:** two weeks with no sampleTidy commit, stop tool work; context under a quarter of pauses and fewer than five hand handovers, do not build the mod; Carry fails ten facts through ten resets, or a cold reader scores under nine of ten, fix that first; more than one unaided decision in five reversed, the case for a resident model is weaker; three rulings and thirty minutes of Robin per slice; ten minutes of gates per slice.
- **Others:** RT MUST 1 wants a date for sampleTidy commits and stops and hours per slice (no figures); RT also uses the quarter-of-pauses line. ECON MUST 4 wants a kill number per rung written before use; baseline $8 to $30 a slice, up to 3x acceptable for a mechanical check [E]. ARCH: threshold 60%, note under 1,500 words. SRE: T0 30 s, T1 5 min R-only (est.).

## 3. Handover and carry
- **A model-written note loses standing rules.** RT-A B3: 12 facts, 3 chains of 8 notes under the Architect's nine headings; 27 of 36 alive after one note, 13 after two, 4 after eight; owner rules 2 of 9, then 0 of 9; an "assumed" item turned up under "Decisions made". What survived had a heading and a literal form.
- **A settings hook carries a file verbatim.** BR-A A, Claude Code 2.1.291: a `SessionStart` hook fired at startup, resume and compaction, and the file reached the model word for word, including after compaction. Each resume adds a copy; old copies stay until a compaction.
- **The carrier has a silent cliff.** Whole at 9,658 characters; at 13,113 the model saw about the first 2,000 and nothing reported it. sampleTidy's two ruling documents are 59,508 and 58,594 bytes (118 KB), so Carry holds standing rules and pointers only and its size check is mandatory.
- **Green Hat's native claim, ruled** (BR-A B): `/rewind` is documented (truncate to a turn, cache kept, "Summarize from here") but user-triggered only; no native part gives a threshold trigger, a return to a named mark by a program, or a check of the note before discarding. "Right about function and wrong about attention."
- **So state and rules travel separately** (RT, adopted by BR). ARCH Q3: restore the prefix at the mark, the note, and what Robin typed since; GH adds the pending action. Rung 1's worth is the note and the trigger, not the cache (ECON: $0.15 to $0.30 saved per event [E]; SRE "Rung 1").
- **SRE's requirements for the mod** (MUST 1, 2): defer, never act, while Robin is typing, a sub-agent runs, a dialog is open or Esc was pressed in the note turn; note to a file first; `rewind --undo` from a recorded `{old id, fork id, cut}`; a launch check and version table so a mod that failed to load is loud; a helper-only path.
- **Still untested:** anything on the model that will orchestrate (BR §6.1); Carry through ten resets; the hook under a mod-run resume, which would make Carry route-independent (BR-A A.4); `/clear`; a typed `/compact`; native `/rewind` in use; the helper run from the session's own Bash mid-turn (ARCH-A §4); a half-typed message at resume and what undo really does (SRE, U); cold cache after a park, an open dialog, 30 resets, the phone after Esc (S §2, SRE); whether a note beats the automatic summary (ECON); what restores the database on a rewind (GH). B3's own limits: a synthetic six-line log, a 400-word cap.

## 4. The scheduler
| Lens | Habit | Advisor | Driver | Keeps | Cite |
|---|---|---|---|---|---|
| Auditor | Cheap; unsupported either way | Only as `ready` plus a tie-break, after rung 3 | No evidence | The readiness rule | AUD "The scheduler" |
| Architect | Adopt | Sound only if no gauge is stored; unstable next to a rewind | No | Derived gauges and `ready` at rung 2; `rank` at rung 5 if order mattered | ARCH "The scheduler" |
| Economist | Adopt | $40 to $70 plus fidelity kept true by hand; not until a misorder is priced | No | Confidence for a report, if free | ECON "The scheduler" |
| SRE | Adopt now | Not until the model is seen picking badly; departures made visible | (none) | Gauges for the report, marked when stale | SRE "The scheduler" |
| Green Hat | Adopt, with a risk list | No `next`; no gauges on ordinary items | (none) | Risk list of at most ten; lexicographic if ever ranked | GH "The scheduler" |
| Red Team | Adopt, reworded | Against | No | Risk list; fidelity fold as a per-slice report | RT "The scheduler" |
| Bar Raiser | **Habit only; delete rung 5** | Not built | No | Readiness in id order; risk list; habit paragraph; derived confidence, later | BR §3 |

- **Evidence.** AUD rows 8 to 12: the code is three confidence labels (share of resolved questions, else a declared marker), a floor to `interface`, leaves-first readiness, and the formula only among nodes ready together; no ladder, tracer path or intensity. GH-A A1: on v1's own store the formula alone decided 3 of 31 picks; 23 were ties broken by node number. GH-A A2, A4: over sampleTidy's R files centrality ranks units 8th and legacy `.xls` 20th of 28, while rework sat in reconcile and commit (ranked 12th and 19th). GH-A A3 (n = 5 an arm): unaided, `.xls` was named a risk and placed 7th, 8th or absent; with one paragraph, units came 2nd in 5 of 5, `.xls` forward in 4 of 5. RT-A B4 (no model): the same order at three confidence settings; `.xls` never left 9th; redrawn edges moved units to 2nd or 3rd.
- **Kept:** readiness as a plain query; a risk list (the doubt, what is wasted, the cheapest check, the closing evidence), which is the design's "intensity"; the habit paragraph; confidence shown to Robin never self-reported. Open: ARCH and SRE would still put gauges in a store; RT says a fingerprint over an unparsed body drops an item to "asserted" on a typo fix; ECON says fidelity cannot be derived.
- **What would reopen it:** GH's ordering test on the orchestrating model, twenty runs an arm (unaided; paragraph; paragraph plus a ranked list), scored by how early a plan reaches what later proved costly; reopen only if arm three beats arm two in 15 of 20 [P]; under $5, an hour (GH; BR §3). Also ARCH-A §6: log the model's pick against `rank` per slice, free; ECON: two slices both ways, $60 to $100.

## 5. Tests and gates
| | Synthesis (S §6) | Red Team (RT-A B7) | Bar Raiser (BR §4) |
|---|---|---|---|
| Shape | Mechanism (tool), profile (pack), gate plan (spec) | Outcomes (Robin), checks (agent), proof (mechanical) | The spec is the place; claims signed, code not |
| What Robin signs | Checks with parameters, pass marks, budgets | A sentence in domain terms naming a wrong result | The claim, the **pass mark, the budget and the expected values** |
| Who proposes; when | Open (Q45) | Not from a menu at spec time; a check joins on a recorded escape or a new outcome | The agent, while the spec is written, from the risk list |
| Proof | Every gate on a seeded defect, again on change | Each check shown red once on a planted wrong row, shown to Robin | The same, plus a "not covered" list and totals |
| Profile | Named for four product classes | None until two projects' plans share lines | None until a second project |
| Wrong or slow gate (Q46) | Open | Weakening an outcome is refused; tuning a check is not a stop | Code wrong: agent fixes and reruns the red demonstration. Over budget: moves to the release tier, never dropped. Claim wrong: a question shown as rows; the gate runs as a warning |

- **Agree:** a per-project plan in the spec; Robin signs in his own terms; one red demonstration; one screen; no profile yet. **Differ:** RT gives pass marks and budgets to the agent ("a pass mark set before the code exists is a guess"), BR has Robin sign them; BR drafts the plan up front, RT grows it from escapes.
- **Other lenses on S §6.** ARCH: an owed kind is a lint row; no gate registers without a seeded fixture and a time cost; exit 2 never goes to a worker. GH: SQL checks on the database; the oracle reports a ladder; a proof for the normaliser (each rule has a pair it must equate and one it must not, hits counted); oracle-free relations; §6.5 for the normaliser only; drop the selector; owed-kind lint is not trust. ECON: oracle best per dollar, model review lowest. RT: build proposals 2, 3, 6, 8; hold 1, 4, 5, 9 until an escape is recorded; claim the oracle at adapter level only. SRE MUST 3: measure before budgeting.

| Merged checks for a sampleTidy slice (gas adapter, R) | Pass mark | Budget | From |
|---|---|---|---|
| Ten readings Robin marked by hand come out as written | 10 of 10 | 30 s | BR-A E G1 |
| Row accounting per file over the 16 workbooks: loaded, rejected with a reason, or duplicate | 0 unaccounted | 5 min | BR G2; GH 3; RT |
| Load twice or shuffled changes nothing; one work order in three formats gives the same rows | 0 rows differ | 2 min (second: none given) | BR G3; GH 3; RT |
| No source column or sheet ignored without his say; named edge cases (blank `Location`; `0` against non-detect) | all read or signed; each case a row | 10 s each | BR G4, G5; GH 4 |
| Hashes of the files Robin owns | match | 5 s | BR G6; RT; S §6.6 |
| R tests for the files touched (full suite at release); one end-to-end run on real files | pass | measure first (SRE est. 5 to 15 min full) | BR G7; S §6.3; ECON |
| The 12,656 gas analyses already in the database agree, if their source holds up | every difference ruled | 2 min | BR G8; RT; unverified |
| One fresh model read per slice; if a port, the oracle at adapter level with the normaliser proved | one round; each divergence ruled | $2 to $6 (ECON); 10 min both languages (SRE est.) | BR; GH; RT; ECON |

Totals (BR): under ten minutes a slice, three rulings, thirty minutes of Robin; budgets are guesses until measured. BR leaves out owed-kind lint, the selector, a canary suite, coverage, second reads, mutation in R and the shadow run.

## 6. Resident model or thin driver
- **The Economist's model** (ECON "Residency"; ECON-A A; all [E], nothing run): rewinding every 35 turns saves 15% to 26% of the orchestrator line, 2% to 4% of a build. A zero-token driver saves about 11% of a build by removing plumbing turns. A cold cache makes the two equal per step. If the meter weights cache reads fully, rewinds save 40%: "the most important unknown".
- **The owner's reason** (S §1): a model "can make decisions so not every possibility needs to be pre specified". Evidence: the driver's growth from 10.8k to 49.3k lines. Not evidence: that a model makes those decisions well.
- **Red Team** ("The resident orchestrator"): the 11% omits the cost of pre-specifying. But the record shows no model deciding well: 8 of 8 haiku stopped, 6 of 8 made a wrong first move, 2 of 8 misstated the signed item; v3's orchestrator had no measured win. Five of the ten missing rule groups were memory across interruptions, which a resident model moves into the note. Those figures are measured; the reading is argument.
- **Her hybrid** (RT-A B6, untested): `run-until-decision <task>` runs the worker and gates and returns on anything but a plain pass; a rule enters only after the model chose the same way three times on record. "The wish justifies a model at every decision, not a model holding the loop between decisions."
- **Bar Raiser** (§2, §6.2): "Every lens measured context or cost; none measures decisions." A plain session is already a resident model, so rung 0 tests the owner's reason through the decisions column. Do not build the hybrid now. No lens argued for a driver; ECON's cheap lever is "a mod doing bookkeeping, not a driver".

## 7. sampleTidy and language
- **Port or features.** RT (story 5, MUST 4) and ECON: features and the corpus run in R first; no document records what a port buys Robin. ECON [E]: features in R $100 to $400; a bounded typed core $120 to $500; a full port $300 to $1,200 at baseline, $1,500 to $5,000 under a flow pack. BR §6: Robin answers Q36 in one sentence. GH alone starts with a port slice.
- **The R corpus run.** AUD row 36: R's behaviour on the whole corpus (about 265 files) is not established, so R is not yet an oracle; no port slice before it (RT, AUD, BR). sampleTidy's last commit is 9 August; its own "Next" list has gas readings, the corpus run and six dust rulings, and no port (RT-A B1).
- **Port spikes** (legacy `.xls`, unit strings): GH run both now; ECON $2 to $10; BR only if the port stays live. SRE: no Rust toolchain installed; a port's Rust budget is unmeasured.
- **Language of the tool.** ARCH: Python 3.11, standard library; "Rust buys nothing in a few thousand lines of file handling". He wrote that before the owner's lean to Rust (brief, "Things to know"); his objection is size, not capability [inf]. FF §6: comment-preserving edit is best in Rust (`toml_edit`) and Python (`tomlkit`); only `tomlkit` was tested. BR §5: neither language nor format is needed to start. The mod and helper are TypeScript whatever is chosen.
- **File format.** FF §8: TOML, flat items, two levels at most, typed structs as the schema, cross-item lint in code, long example tables as CSV; 70% over markdown with frontmatter, 90% over any exotic language; token cost is no reason to choose. ARCH's item is a TOML header over an unparsed markdown body, which FF allows only "if the body is a single opaque string" [inf: the two agree on that condition].

## 8. MUST-fix
| Id | MUST | Action |
|---|---|---|
| R2-AUD-M1 | §4 rewritten to match the code | applied |
| R2-AUD-M2 | Reuse claim; "3,300 lines"; "1,172-line marker language" | applied |
| R2-AUD-M3 | "No tool rewinds"; "no tool selects work"; canaries; "45%" | applied |
| R2-AUD-M4 | 837 turns is werkbank v2's; hedge 30 to 38% | applied |
| R2-ARCH-M1 | No imports; wiring file; run state local; deletion test; a pack holds no control flow and may ship gates | 2 |
| R2-ARCH-M2 | Fold C into B; name Robin's signing channel | 3 |
| R2-ARCH-M3 | Fixed kinds, classes as lint rows, unparsed bodies, format rules, before the first item | 8 |
| R2-ARCH-M4 | Gauges derived; `next` called only by the model and Robin; focus chosen before a rewind | 8 |
| R2-ECON-M1 | Baseline with an oracle before the store | 1 |
| R2-ECON-M2 | Three measurements: meter weighting, cold-cache rewind, turns per step and state size | 10 |
| R2-ECON-M3 | No chooser; habit; delete rung 5 | 7 |
| R2-ECON-M4 | A kill number per rung and module; a time budget per gate; defer schema-as-data | 5, 8 |
| R2-SRE-M1 | In-flight cases and the undo verb in rung 1's definition | 9 |
| R2-SRE-M2 | A mods failure is loud; a helper-only path | 9 |
| R2-SRE-M3 | Measure before budgeting | 6 |
| R2-SRE-M4 | A flow-less spec for the watcher | 9 |
| R2-GH-M1 | Name expectations; state ownership once | 2, 3 |
| R2-GH-M2 | Baseline and a thin skeleton of every module first | 1 |
| R2-GH-M3 | Correct "risky parts would surface first"; the risk list | 7 |
| R2-GH-M4 | Normaliser proof; oracle-free relations; narrow §6.5; drop the selector | 6 |
| R2-RT-M1 | Rung 0 is outside work; the abandon line | 1, 5 |
| R2-RT-M2 | Rules never pass through a model-written note; 10 facts, 10 rewinds, 9 alive | 4 |
| R2-RT-M3 | Guard the wiring and the mod | 2 |
| R2-RT-M4 | No port slice before the corpus run and a named benefit; oracle at adapter level | 11 |
| R2-BR-M1 | §8: rung 0 as a sampleTidy job with Carry, `/handover`, a signed plan, the tally; a dated abandon line | 1, 5 |
| R2-BR-M2 | §3: the amended split and four modularity checks | 2, 3 |
| R2-BR-M3 | §6: claims signed; red demonstration; "not covered"; three cases; no profile | 6 |
| R2-BR-M4 | §4: habit, risk list, readiness; rung 5 deleted; the reopening experiment | 7 |

1. **§8: rung 0 is a real sampleTidy job in R,** with `CARRY.md` and the hook, `/handover`, a gate plan and the tally; BR §5 asks for one page only (the job and a date, four real files, three contracts in full, numbers that can fail, a tripwire). *Agreed* by RT, BR, ECON; half by GH (BR-A F rejects "every module at its thinnest"); ARCH and AUD had rewind first. *Owner:* which job.
2. **§3: the amended split, the no-names rule with RT's guards, the modularity checks.** *Agreed* (ARCH, RT, BR, GH).
3. **Ownership stated once.** *Conflict:* store policy (ARCH) or path gate (GH, RT, BR); BR rules for paths. Robin's signing channel is named only by ARCH (a mod command).
4. **Two carriers; Carry's contract and size check; the ten-resets test.** *Agreed* (RT, BR). The pass mark differs: 9 of 10 (RT), 10 of 10 (BR-A D).
5. **Stop lines with dates and numbers.** *Agreed* in form (RT, BR, ECON). *Owner:* the numbers.
6. **§6 rewritten:** claims in Robin's terms, red demonstration, "not covered", the wrong-or-slow cases, exit 2 always stops, no profile, normaliser proof, oracle-free relations, no selector, budgets after measurement. *Agreed*, except who owns pass marks (RT against BR) and a seeded fixture per gate (ARCH keeps; GH, RT narrow).
7. **§4: habit, risk list, readiness in id order; rung 5 deleted; the reopening experiment.** *Agreed* by six; ARCH alone keeps `rank` as a possible rung 5. *Owner:* he liked it.
8. **Rules for the day a store is started:** derived gauges, fixed kinds, unparsed bodies, format rules. *Agreed, deferred* (BR-A F). Kinds differ: item, task, question, note (ARCH); item, question, note, risk (GH); item, task, note (ECON). RT and ECON doubt derived gauges work.
9. **Rung 1, when built:** deferrals, undo, loud failure, helper-only path, the 30-reset test. *Agreed.* The watcher is *deferred* by BR until a stall is recorded twice.
10. **Measurements:** the meter's cache weighting; cold-cache rewind; turns per step and state size. *Agreed*; the last two fold into the tally.
11. **Port: nothing before the corpus run and a named benefit.** *Agreed* (RT, AUD, BR, ECON); GH's rung 1 conflicts. *Owner.*

## 9. Open questions
| Q | Answer | Who |
|---|---|---|
| 1, 2 | Rewinds 2% to 4% cheaper than none, a driver about 11% again [E]; unknown until pauses are counted by cause. Route F is as stable as the mods API; a week without it is native `/rewind`, a hook and `/compact` | ECON, RT; SRE, GH, BR |
| 3, 4 | The prefix at the mark, the note, what Robin typed; rules by verbatim file; the pending action. At a threshold plus manual; **or** per step (about 35 turns) with a backstop at 150k | ARCH, RT, GH; ARCH, SRE against ECON |
| 6 to 10, 43 | Fixed kinds, schema as data only when a second pack needs it; one TOML file per item; flat ids with `parent` as a link; copy v1's shape, leave `ctx_core.py`; the store in its own repository (RT objects) | ARCH, GH, ECON, FF, AUD, SRE |
| 11 to 13 | A render token budget in lint, a size script for Carry. 12 not answered: test on sampleTidy's files and a real note. Records needed (ARCH); **or** git is enough until workers exist (SRE); evidence append-only (GH) | SRE, BR, RT |
| 16 to 21, 25 | Park only dependent work. Habit; v1's confidence was already self-report; as built the rule is dependency order, so it neither fights nor completes the skeleton. No step table. The orchestrator stops; plan for it | ARCH, BR; all; AUD, GH; RT |
| 26 to 30 | Oracle comparison, a failure-shape test per reader, a property per parser; mocks and snapshots are theatre. Normaliser: key map, timestamp mask, decimal rule, order independence. R budgets yes, Rust unproven, serial only. Diff mutation plus an adversary's finds. Growth: fixture and time cost to register, a failing test on budget, a gate only on a recorded escape | ECON; GH; SRE; ARCH, RT |
| 32 to 34 | A shadow run (rejected by RT, BR); held-out checks starting from the ten marked readings. $8 to $30 a slice [E], up to 3x. A kill number per rung | GH; BR §6.6; ECON |
| 36 to 38 | Features and the corpus run in R first; spikes are cheap, run if the port stays live; two languages possible, serial | RT, ECON; GH, BR; SRE |
| 39 to 42, 44 | Section 1. Hardest contract: `render`. First rethink: the route, then the store's header (AUD: the store). Ladder realistic (ARCH); its value is the note (SRE). "So far a build tool with no build" | ARCH, GH, SRE, AUD; RT |
| 22, 45, 46 | The pipeline is 58% database logic, and nobody defined a slice. Gates: section 5 | AUD row 35; RT, BR |

- **Not answered by any lens:** 5, 14, 15, 23, 24; 31 and 35 only through BR's "one read per slice" and "three rulings" [inf].
- **Called most important:** Q12 by four (ARCH, AUD, RT, BR); Q1 by three (ARCH, AUD, RT as pauses by cause); Q36 (RT, BR); Q33 (ARCH, GH); Q32 (GH, AUD); Q45 (BR); Q39 (GH); Q41 (AUD); Q2 and Q28 (SRE). ECON: the meter's cache weighting, whether a baseline with an oracle is enough, Robin's minutes per slice.
- **New:** What does a port buy Robin; what fraction of pauses is context; what survives ten notes; what order does `ready` print in; who tests the wiring (RT)? How does Robin sign; which state is machine-local; what makes a mark stale; a second session on one store (ARCH)? What if the note is wrong; how is "mod did not load" noticed; may the store sit in a synced folder (SRE)? Who owns a golden once R retires; what restores the database on a rewind (GH)? How does the meter weight cache reads; what does a divergence ruling cost Robin (ECON)? How good is the oracle on the corpus (AUD)? How are unaided decisions measured (BR)?

## 10. Things only the owner can weigh
| Problem | Options | The panel's leaning |
|---|---|---|
| Which sampleTidy job comes first, and from what date | The gas readings adapter; the corpus run | BR: gas adapter "unless Robin prefers the corpus run". RT: either. AUD: the corpus run is what makes R an oracle |
| What a port is for | One sentence from Robin; or leave the port off the table for now | RT, BR, ECON: features in R first. The sentence decides whether two spikes are worth running |
| The scheduler he liked | Habit and a risk list; keep `rank` as a later rung; run the ordering test first | Six lenses: habit only. The test costs under $5 if he would rather have evidence than a ruling |
| Resident model, driver or hybrid | Stay resident and count decisions; try `run-until-decision` later | No lens wants a driver. BR: let rung 0's decisions column speak first |
| Language of the tool | Rust (his interest; `toml_edit`); Python (ARCH); decide later | BR: not needed to start. No lens weighed his interest in Rust |
| Stop lines and his attention per slice | BR's numbers (two weeks; thirty minutes and three rulings a slice); his own; none yet | RT, BR, ECON want them written before use; every figure is [P] |
| Where "Robin's" ends (Q14) | Only what he ruled; or also files he names | GH: the path cut makes this the first decision. Nobody answered it |
| Who sets pass marks and budgets; whether to lean on early-access mods | He signs them (BR) or the agent owns them (RT). Hook and typed commands only, or the mod | Split on the first; timing himself on BR-A E would inform it. BR, RT, GH: mod second; ARCH, SRE: build it with fallbacks |

## 11. Spikes and experiments
| Run this round | Cost | Result | Limits |
|---|---|---|---|
| RT-A B3: note chain, 3 chains of 8 | 25 haiku calls, $0.46 | Owner rules 0 of 9 after two notes | Synthetic log; 400-word cap; loose scoring |
| RT-A B4 and GH-A A1, A2, A4: v1's scheduler over the port slices, v1's store and sampleTidy | Scripts, no model | Same order at every setting; 3 of 31 picks; `.xls` 20th of 28 | Eleven nodes with her own edges; a design tree; regex matching |
| GH-A A3: ordering, unaided against one paragraph | 10 haiku calls, $0.30 | Units 2nd in 5 of 5 with the paragraph | n = 5; a plan on paper; scored by eye |
| BR-A A: `SessionStart` hook as carrier | 7 haiku calls, $0.20 | Verbatim under 10,000 characters; silently cut above | Print mode; no `/clear`; no mod; asked the model, did not read the request |
| FF §1; SRE; AUD: token counts and round trip; machine inventory; v1 `pytest` | Local | 15% spread, `tomlkit` byte-identical; 8 GB, R ready, no Rust; 361 pass | Not Claude's tokenizer; one file; no timings taken |

| Proposed | Decides | Cost | From |
|---|---|---|---|
| Carry: ten facts through ten resets, on the orchestrating model; also the hook under a mod-run resume and `/clear` | Whether rules survive; whether Carry is route-independent | An hour; cents to a few dollars | RT MUST 2; BR-A A, D |
| Cold reader on a real handover note, and on a `render` written by hand from sampleTidy's files | Q12; whether a store is needed | Haiku, cents | RT story 3; BR-A D; AUD; ECON |
| Ordering test, three arms, twenty runs; later the per-slice log against `rank` | Whether to reopen the scheduler | Under $5, an hour; then free | GH; BR §3; ARCH-A §6 |
| Rung-0 tally; Robin times himself on the example gate plan | Which piece is next; the owner's reason for a model; Q45 | Free with the job; twenty minutes of Robin | RT; BR §2, §6 |
| R timing on three test files with peak memory; a Rust build only if a port is live | Gate budgets | Half a day, no model | SRE MUST 3 |
| The meter's cache weighting; a cold rewind after an hour's park | Whether residency is a 3% or a 40% matter | $5 to $15 | ECON MUST 2 |
| Helper from the session's own Bash mid-turn; then thirty resets with a typed message, Esc, a sub-agent and a dialog in flight | Whether rung 1 needs a watcher process; rung 1 acceptance | An hour on haiku; the second not priced | ARCH-A §4; SRE; BR-A D |
| `run-until-decision` on the 8-of-8 case; `.xls` and units spikes; the source of the 12,656 gas rows | The hybrid; Q37 if a port is live; whether G8 is independent | About $0.50; $2 to $10; a file read | RT-A B6; ECON, GH; RT, BR |
| Round trip in the tool's language; a reading test across three formats; a week of the notes pack; the deletion run and rethink drill | TOML or frontmatter; whether a store gets used; whether the modules are modules | Cheap; a week; week three or four | FF §8; SRE-A; BR-A C |

## 12. Contradictions and unsupported claims
1. **Rung 1 this week.** ARCH: "buildable this week" at about 200 lines. SRE: "not yet a thing Robin uses next week". ECON prices a mod of about 400 lines; RT notes spike-live's is 470. AUD: the evidence supports rewind first. RT, BR: it is not first.
2. **Derived gauges.** ARCH, GH: derive from records. RT: that fights "never parse a body". ECON: confidence derives, fidelity does not; ARCH says fidelity derives for a port. SRE writes of "gauges as store fields" against ARCH's "never a stored field".
3. **Seeded defects and mutation.** S §6.5 and ARCH (a fixture to register any gate) against GH ("werkbank's canaries as a standing duty") and RT ("a second suite"). GH makes diff mutation the proof for tests; BR leaves it out in R; AUD and SRE: no R tool verified or installed. ECON's "canaries caught 0 of 13" repeats wording AUD row 29 corrected.
4. **The oracle.** ECON: highest return, and his reference slice is a port slice. RT: R has committed 48 rows and reconcile has no goldens. AUD: R is unproven on the corpus. BR: the first job is not a port, so "oracle" becomes "the gate plan".
5. **Carry.** RT: append-only. BR: under 9,000 characters. An append-only file must grow past the cliff [inf]. RT-A B6 names hook sources `clear` and `compact`; BR tested startup, resume and compact, not `/clear`. GH's claim rested on fetched documentation; native `/rewind` is still untried by anyone.
6. **Small misreadings.** BR: GH's paragraph "moved a haiku's plan in 5 of 5 runs"; GH-A A3 has units in 5 of 5, `.xls` and spikes in 4 of 5. RT: "Every lens now says rung 1's worth is the handover note"; ECON and SRE do, ARCH and AUD not in those terms [inf]. BR read RT's appendix from scratch files ("not in the folder"), so his rulings on B7 may rest on a draft [inf]. SRE's numbering: his added Q45 to Q48 collide with the synthesis's Q45 and Q46; and he read module H as the oracle harness (SRE-A table) while assessing the scheduler separately.
7. **Borrowed, assumed or unsupported figures.** ECON uses "30% to 38% broken after compaction" as a reason for rung 1 while marking it unverified (AUD row 17: overstated, one preprint). His claim that most resident steps are cold assumes a 5-minute cache; the 1-hour case is unverified. **Unsupported as they stand:** all of ECON's dollars ([E], "about 3x either way"); SRE's R and Rust timings (est.); BR's stop numbers ([P]); GH's outside sources (sub-agent summaries, none re-opened); the 12,656 gas rows as an independent oracle; GH's permission-deny route (from knowledge); and anything about the orchestrating model, since no spike ran above haiku.

## Added by the main session after this file was written

- **The hook's size limit** was re-run on sonnet (`research/hook-context-cap.md`). It is a Claude
  Code cap, not a model limit, and it is not silent to the model: over about 10,000 characters
  the context gets a 2 KB preview, a notice that the output was too large, and the path of a file
  holding the rest. Read "silently truncates" above in that light. The design consequence stands:
  the carried file stays under the cap, with a size check.
- **The hook and route F.** The hook is the carrier where there is no mod (rung 0, or mods
  withdrawn) and a safety net for unplanned compactions. Under route F the rules are already
  before the cut point and the hook would plant a duplicate at each rewind.
