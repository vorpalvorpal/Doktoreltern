# Synthesis of the seven-lens review of SCOPING-DRAFT.md

For the redraft. Written from the seven review files; appendices read only for bar-raiser (all), red-team A3 and green-hat C2, C3, D. **How to read the citations.** `ARCH-M1` = `architect.md`, heading "MUST-fix", item M1. Likewise ECON = `economist.md`, GH = `green-hat.md`, SRE = `sre.md`, RT = `red-team.md`, BR = `bar-raiser.md`, EA = `evidence-auditor.md`. `-S` = that file's "SHOULD-fix"; `-Q` = "Questions the draft does not answer"; other headings are named. "app." = the lens's appendix. **[inferred]** marks my reading, not a lens's words.

**Two cautions.** (1) The Bar Raiser read the other six reviews and the Red Team read at least the Architect, Economist, Green Hat and SRE, so their agreement is endorsement, not independent arrival. (2) The Bar Raiser says "25 MUSTs from the other lenses"; the files hold 25 from five lenses plus its own 5 = 30. The auditor filed corrections, not MUSTs.

## 1. Every MUST-fix

### 1a. The 30 rows

| Id | Draft § | Change asked |
|---|---|---|
| ARCH-M1 | §0, §3, §4.1, §4.2, §10, §12 | Describe route F as it is: a cached copy of two pure, byte-stable functions, `stable(level)` and `delta(unit)`; a cut is valid when its digest matches. Say how a stale level is rebuilt; put only truly stable text in the prefix; one path for step reset, size guard and crash restart; a short rule card in `delta`. |
| ARCH-M2 | §0, §4.3, §4.4, §10 | Every guard is `lst check <action>`, a pure function of files; the mod only relays, resets and draws. Give run-time state (cuts, hold, kept messages, intents, ledger) a home in `leitstand/run/`. Name the helper, watchdog and the orchestrator's own skill as parts. |
| ARCH-M3 | §5.1, §5.2, §5.4 | Interfaces are Rust code with `todo!()` bodies, in the tree before any unit; a gate result is "matches the expectation", the expected-red set coming from `lst`. Correct §5.4: nextest selects by test binary. |
| ARCH-M4 | §4.1, §5.2 | State is one file per unit, package status a fold; add `lst step begin` (intent record before a dispatch); no parallel unit builds in version 1. |
| ARCH-M5 | §7 | F2 moves to S0; S1 splits into S1a (`lst`), S1b (mod, helper, watchdog, kill test), S1c (stellwerk Rust roles); "by itself" covers only `lst`; interface lint in S1a and seam tests in S2; give the watchdog, acceptance fixture and G4 a stage. |
| ECON-M1 | §8, §10 | Put a cost model and budget in the draft (all cells marked estimate); S2 reports cost per unit by role; S4 has a fixed line for tokens, wall time per unit and Robin's minutes. |
| ECON-M2 | §5.2, §5.3 | One code-audit layer, not three: drop the per-unit code audit, keep test audit, mutation, one opus audit per package, a release audit on the delta. Replace "nothing new" with a cap of 2 rounds a level plus a price rule. |
| ECON-M3 | §5.2 | Writer contract and test-audit checklist: one property test per open-input item, one differential test per item mirroring an external tool, one test per named failure shape; lint the map. |
| ECON-M4 | §3 pr. 3, §5.5 | Give "judge less" a number (at most 45% of spend; at most 2 judging points between code and package close); tag every dispatch in `usage.jsonl` with its role. |
| ECON-M5 | §4.2, §10 | Label spike costs "haiku, filler state"; add the cold-cache line; measure orchestrator turns per unit in S2. |
| GH-M1 | §5.2, §12 | Weigh the unit of work and change it: one behaviour through every layer, on a compiled skeleton, not one file. |
| GH-M2 | §7, §8 | Run a plain-loop baseline on a cut-down pipeline before S1; then add each step of §5 as a `flow.toml` switch that must beat the rung below on the seeded fixture. |
| GH-M3 | §4.1 | A spec item carries the kind of test it owes (`inputs`, `mirrors`, failure shapes, lifecycle), concrete examples and where it is silent; add the orphan and lifecycle lints; show one real file. |
| GH-M4 | pr. 6, §5.1, §5.6 | Three answers to "does the item require this": required, forbidden, silent. Silent is decided by the orchestrator, recorded as an amendment, listed for Robin at the end. Robin marks about ten examples at sign-off. |
| GH-M5 | §5.1, §12 | Seam tests drive the real producer into the real consumer; drop "written by the consumer before the producer exists"; seams inside a package count. |
| SRE-M1 | §4.2, §7 | Add to F2: Remote Control across a changing session id; a permission dialog open at reset and one from a sub-agent; 3 to 6 h idle then a reset; hold, `/go`, typed message and Esc on F; saving the mod file mid-session. |
| SRE-M2 | §10, new §4.5 | Specify the watchdog: reads a heartbeat, notifies, wraps the launch, relaunches only under four conditions; a forbidden list; tripwire 150 lines. |
| SRE-M3 | §4.2, §10 | S1 work: a permission allowlist generated from `flow.toml`, `lst preflight` driving each allowed command once, a heartbeat that flags "probably a dialog". |
| SRE-M4 | §5.4, §6, §7 | One cargo process tree at a time by a lock in `lst gate`; one shared target dir; parallel worktrees deferred; S0-b runs before S1 and records memory, swap, times, target size, DuckDB bundled vs prebuilt, mutants. |
| SRE-M5 | §4.1 | `leitstand/` in its own small git repo outside the product branch; atomic writes under a lock; ids issued by `lst`; generated index; ship `lst doctor`, `lst edit`, `lst restore` in S1. |
| RT-M1 | §7, §8 | Stage zero is the outside job (plain session, reset mod, one hand-kept checkpoint file); then one rung at a time. Write now: the date, the price and hours per unit, and the stops per build at which Robin stops. |
| RT-M2 | §5.3, §10 | (a) A fresh read for any ruling that amends a spec item or plan entry or accepts a test; (b) after a fix, the finding's test green and every previously green test citing another item still green; (c) amendments as fields with rejected options, and a rendered diff of the signed spec for Robin. |
| RT-M3 | pr. 5, §4.3 | (a) One table of every stop and park kind with owner and exit; (b) a third refusal of the same action parks the unit and `lst next` moves on; (c) guards and `step_done` count departures for good; (d) one tripwire over `lst`, mod, helper, watchdog and the orchestrator's skill. |
| RT-M4 | §4.2, §7 | F2 before S1, widened (session permission grant across a reset; 6 and 65 minute sub-agents; stale cut every third reset), re-run on each Claude Code upgrade; reset once per unit until it passes; a manual mode with no mod. |
| RT-M5 | §5.2, §5.3 | (a) An audit series ends on a check (mutation, property and end-to-end tests, a reviewer given callers and sibling sites); (b) findings record `born_of`; (c) `lst unit done` refuses if the test set shrank or gained `#[ignore]` without a ruling. |
| BR-M1 | §8 | Criteria that can fail: a held-out check set (at least 40 checks) written by a session no builder sees; thresholds for failures, usage multiple, stops and Robin's minutes, resets, and a date (app. E). |
| BR-M2 | §7, throughout | Make S0 and S1 decidable: fill the eleven gaps in app. C (models per role, orchestrator instructions, unit size, owner of signatures, a pass mark for every spike, the stops table, toolchain install). |
| BR-M3 | §5 | Do not redraft the flow from argument: fix what the lenses agree on and settle the rest by experiment E1. |
| BR-M4 | §4.1 | Show every file kind with content, and the exact `stable` and `delta` text with a token count; pass a cold-reader test at five frozen points. |
| BR-M5 | §7, §9 | A version 1 sized to the two tests (H1 reset, H2 flow); every accepted MUST gets a stage; deterministic code capped at 5k lines at S4. |

### 1b. Distinct actions (the redraft's working list)

| # | Action | Sources | Note |
|---|---|---|---|
| 1 | Rewrite the reset as route F in fact: `stable`/`delta`, digest validity, stale-cut rebuild, one resume path, rule card; remove route-A wording | ARCH-M1; BR "The bar" B3; EA §3 contradictions 2, 4 | Text only |
| 2 | Move every decision into `lst`; mod as adapter; a homes table for all deterministic parts and run-time state; name the orchestrator's skill | ARCH-M2 | RT "Attacks" accepts it only with action 12's wider tripwire |
| 3 | Compiled skeleton before any unit; expected-red set held by `lst`; a separate check for "fails for the right reason"; a named owner for signatures and one operation that changes a signature and all call sites | ARCH-M3; GH-M1 (skeleton half); BR-M2; SRE "The flow" 2 (not a MUST); holes from RT "Attacks" | The right-reason check and the signature operation are new machinery (RT) |
| 4 | Decide the unit of work | GH-M1; BR-M3 | Open: disagreement D1 |
| 5 | Serial units in version 1; state per unit; intent record with dispatch outcome; one cargo tree at a time by a lock | ARCH-M4; SRE-M4; SRE-S; EA §5; BR "Scope" | Outcome field is from BR app. A |
| 6 | F2 before S1, widened, with pass marks, kept as an upgrade canary; reset per unit first; manual mode | ARCH-M5a; SRE-M1; RT-M4; BR-M2 | Widened list in section 6. Remote Control item disputed (D12) |
| 7 | Restage §7: split S1; S0-b first; stages for watchdog, fixture, G4, orchestrator skill; decide whether "builds itself" stays | ARCH-M5b-e; SRE-M4; BR-M2; BR-M5 | Open: D7, R3 |
| 8 | A baseline run, and later flow steps earning their place by comparison | GH-M2; RT-M1; BR-M1; BR-M3 | Shape disputed: D7, D8 |
| 9 | Success criteria that can fail, and an abandon line written before S1 | BR-M1; RT-M1; ECON-M4 (the 45% target) | Numbers are Robin's (R2) |
| 10 | Cost model in the draft; role tag on every ledger row; spike costs labelled; cold cache priced | ECON-M1; ECON-M4; ECON-M5 | Text plus one field |
| 11 | Fewer audit layers; a round cap of 2 that ends on a check; no "nothing new" rule | ECON-M2; RT-M5a | Which layer goes is disputed (D2, D3) |
| 12 | One table of stops and parks; a generic third-refusal outcome; departures counted; one tripwire over all deterministic code | RT-M3; BR-M2; BR-M5 | Also resolves EA §3 contradiction 6 |
| 13 | Spec item schema: test class owed, examples as data, `silent_on`; writer and test auditor owe property, differential and failure-shape tests; lints for them | GH-M3; ECON-M3 | ARCH and GH sketches differ (D14) |
| 14 | Show the files and the rendered post-reset text; pass the cold-reader test | GH-M3; BR-M4 | S1a exit test |
| 15 | Spec silence, amendments, a second read of rulings that amend spec or plan, a post-fix check, a rendered diff for Robin | GH-M4; RT-M2 | Needs Robin's yes (R1). RT accepts GH-M4 only with RT-M2 |
| 16 | Seam tests real producer into real consumer, inside packages too | GH-M5 | ARCH "The flow" step 3 writes them at the skeleton as red-planned: compatible [inferred] |
| 17 | Tests cannot quietly leave; `born_of` on findings | RT-M5b, c | Needs test ids per run from stellwerk |
| 18 | Watchdog specified and bounded | SRE-M2 | Relaunch disputed (D9) |
| 19 | Permission allowlist, `lst preflight`, stall heartbeat | SRE-M3 | BR app. B: stage S1b |
| 20 | Checkpoint write safety (atomic, locked ids, generated index) and `doctor`/`edit`/`restore` | SRE-M5 | Location disputed (D5) |
| 21 | Cut version 1: one package, no parallel units, no automated planning or scoping, G3 and G4 on `warn`, no T3 on idle | BR-M5 | Robin's call (R4) |

**21 distinct actions from 30 MUSTs.** Seventeen can be written now; four (4, 8, 11, 21) wait on a disagreement or on Robin.

## 2. Agreement (three or more lenses, with independence noted)

| Point | Who | Verdict |
|---|---|---|
| Compiled skeleton / stub code first | ARCH-M3, GH-M1, SRE "The flow" 2 and "Unit size and order", RT "The flow"; BR endorses | Holds: three independent plus RT. The Economist takes no position; BR "The flow" cites ECON-M3 for it, which is about tests, not stubs. |
| Serial units in version 1 | ARCH-M4, SRE-M4, GH "The flow" ("parallel building mostly given up"); BR "Scope" | Holds. |
| Plain-agent baseline | GH-M2; ECON "Building Leitstand…" (build one unit both ways at S4, a different design); RT-M1 and BR-M1 adopt GH's | Weaker than stated: one independent proposal, one near relative, two endorsements. All four disagree on its shape (D8). |
| A cap on audit rounds | ECON-M2 (2 a level); SRE "The flow" 1 (2, test audit only); BR ruling (2, ending on a check) | Partly. RT "Attacks" accepts a cap only with RT-M5a as its tail. GH "The flow" keeps "stopping on no new signal", the rule ECON and BR say never fired. |
| F2 before S1 | ARCH-M5a, SRE-M1, RT-M4; BR | Holds. |

Also reached by three or more:

- **The test writer owes property and differential tests for input classes and mirrored tools.** ECON-M3, GH-M3, ARCH "The flow" step 5, EA §4.
- **An intent record per step.** EA §5, ARCH-M4, SRE-S; BR app. A adds the dispatch outcome.
- **A bound on notes.** ECON "The checkpoint files", ARCH lint 7, GH and SRE (a token budget on hydrate), RT and BR (a cap, and limits on what a note may say).
- **Robin signs a rendered document, recorded as a digest.** ARCH-S, GH-S 8, RT-M2c.
- **A check outside the build's own tests: an end-to-end run on real data, with DuckDB SQL as the reference.** ARCH "The flow" step 1, GH-S 2 and 3, RT story 2, BR-M1.
- **Plans written just before use, not all up front.** ARCH "The flow" step 4, GH "The flow", BR "The flow"; RT "The checkpoint files" (plans are not stable).
- **A second read only for rulings that edit spec or plan.** ECON-S "Fix re-review", RT-M2a, BR ruling.
- **The orchestrator has no named model, no prompt in any stage, and no test on its real tier.** ARCH-M2 table, RT-S and RT-Q3, BR "What the panel has still missed" 3.
- **A small mode or a minimum job size.** ECON "Minimum job size", GH "Small jobs", BR "Scope".
- **A manual mode without the mod.** RT-M4, SRE "The reset", BR-S.
- **The cold cache after a long park is untested and must be.** EA correction 13, ARCH-Q1, ECON-M5, SRE-M1c, RT-M4.
- **"Builds itself" can cover only `lst`.** ARCH-M5c, RT story 1, BR "Scope".
- **Keep:** one item per file, TOML, `lst` as sole writer, state rewritten whole, findings as failing tests through intake, the `refuse`/`warn` switch, §2 and §10 as written. Every lens's "What must survive revision".

## 3. Disagreements

| # | Question | Sides and their evidence | Cheap test |
|---|---|---|---|
| D1 | Unit of work: file-sized or a behaviour slice? | **File / crate-bounded:** draft; ARCH "The flow" (a slice through every crate breaks disjoint write scopes); SRE "Unit size and order" (one crate, at most 45 minutes, the redo granule). **Slice:** GH-M1 (every product seam bug on record sat between files of one package; ordering rules were 11 of 55 patches); RT "Attacks" (right for a pipeline; G1 shrinks to "writers write tests, implementers write source"). **BR ruling:** serial units remove ARCH's objection; size by experiment. | E1 arms U and S (BR app. D). GH's own reversal conditions: more seeded faults left by slices at equal tokens, or more than one signature change per slice after the third. |
| D2 | The one model check per unit: which? | **Keep test audit, drop code audit:** ECON-M2 (25 of 27 finds reachable earlier; test audit was the best round at $10.86 a find). **Keep a code reviewer, test audit last on the ladder:** GH "The flow", app. C2. **Both:** draft, ARCH. **Measure it:** RT "Attacks" ("25 of 27" is one reader's hindsight; the saving assumes a 50% catch unmeasured in Rust). BR: one per unit, placement by a `flow.toml` switch. | S0-d's seeded-fault fixture run with each placement. |
| D3 | Audit levels above the unit | **Unit, package, release:** draft; ARCH keeps package close. **Package and release, no unit:** ECON-M2 (gestalt kept, capped). **Unit and whole-tree only:** BR ruling. **Design-heavy:** GH-S 1 (one full review of spec plus skeleton, a whole-tree review every five slices). | Falls out of D2 and R4: with one package there is no package level to argue about [inferred]. |
| D4 | Does "no stops after the spec" survive, and who decides where the spec is silent? | **Park and ask:** draft. **Orchestrator decides, reports at the end:** GH-M4 (14 of 24 test-able finds ended in a spec or plan edit; 5 cited no clause). **Only with a second read and a rendered diff:** RT story 2, RT-M2 (8 of 71 such rulings changed on a second read); RT app. A1 spike: 8 of 8 haiku runs parked, 2 of 8 misstated the signed item. **Ask early, by letter:** SRE "The flow" 5 (question sweep at the end of planning). EA §4: 18 of 53 stops needed judgement. | Count silent-spec decisions per unit on the baseline or E1 run; re-run RT's spike on the orchestrator's real tier. |
| D5 | Where do checkpoint files live? | **Own git repo, outside the product branch:** SRE-M5 (removes merges; a typo parked run 14). **In the product repo for version 1:** BR-S and app. B (serial units merge nothing; two repos make "unit done" and its commit non-atomic). **Split:** ARCH-M2 table (`leitstand/run/` not in git; the tree key excludes `leitstand/`; `flow.toml` and wrappers apart from the project's folder). GH asks the question, takes no side. | Extend the random-kill test to the gap between `unit done` and the commit, in both layouts; check the tree key is unchanged by recording a result. |
| D6 | `toml_edit` or a canonical serialiser? | **`toml_edit`:** draft, SRE "The checkpoint files" (comments survive hand edits). **Canonical:** ARCH-S, BR-S (stable bytes are the cache; only `lst` writes). | None needed if hand edits go through `lst edit` (SRE's own rule) [inferred]. |
| D7 | Build order | **Staged S0 to S6, restaged:** ARCH-M5. **Ladder from the smallest loop, six rungs on a fixture:** GH-M2, app. C2. **Outside job as stage zero, no stage whose only product is Leitstand:** RT-M1. **Two parallel tests, H1 (reset) and H2 (flow, E1), then S1 to S4; two switches, not a ladder (15 or more runs):** BR-M3, "Scope". ECON: settle at S4 by building one unit both ways. | E1 itself; GH warns fixture results may not predict the real job (canaries passed 0 of 13). |
| D8 | Shape of the baseline and of the trust measure | **Baseline:** plainest loop with gates and mutation (GH); plain session plus reset mod, Robin counting (RT); plain, no mod (BR: RT's version tests two things at once). **Measure:** Robin's hand count (draft, GH, ECON, RT) or a held-out check set (BR-M1: the hand count is one run, unblinded, and spends Robin). RT story 6: one job counted by one reader shows only a two-to-one difference. | Write the held-out set once (one session, ten minutes of Robin). |
| D9 | Watchdog: relaunch or notify only? | **Relaunch held, under four conditions:** SRE-M2. **Notify only until S4 has run:** RT "Attacks" (relaunch is a resume path; resume took 8 releases); BR "Scope". | None; a scope choice. SRE's "redo, not resume" narrows the gap. |
| D10 | Reset per step or per unit? | **Per step:** draft, SRE (about 6 a unit). **Per unit until F2 passes:** RT-M4, BR "The flow". | F2. |
| D11 | Cut levels in the cached prefix | **Levels with digests:** ARCH-M1. **Measure first:** RT story 5 and "The checkpoint files" (if most finds amend spec or plan, the stale cut is the normal case). **One level:** BR "Scope". ECON: F vs A is 1 to 2% of a build, so choose on reliability. | Count prefix rebuilds per unit on the first real job. |
| D12 | Remote Control and phone replies in F2 | **Test them:** SRE-M1a. **Drop:** BR-S (in neither brief nor draft; I confirmed by grep). | Ask Robin (R5). |
| D13 | Notes: three levels or one? | **Three, capped per level:** ARCH lint 7, ECON. **One level, 20 entries:** BR. **Lesson becomes a test or lint first:** GH-S 5. | None; pick. |
| D14 | Interfaces and the spec item schema | **Interface items pointing at Rust code, with a producer lint:** ARCH. **No interface declarations in `lst`; the compiler checks:** GH-M1. **Unit plan carries signatures, lint against the stub:** SRE. Spec item: ARCH `kind` and `check.form` vs GH `class`, `inputs`, `mirrors` (BR "The checkpoint files": pick one). | Write both item files for one real spec item; run the cold-reader test on each. |
| D15 | What reviews a fix | **The fix diff only:** draft, ECON-S. **Callers and sibling sites:** RT-M5a (v3.3: the damage was outside the diff). | `born_of` share per build (RT-M5b). |
| D16 | Plan review size | Two or three lenses (draft, ARCH); lint plus two (ECON-S); a full review of spec plus skeleton (GH-S 1). | Measure yield at the first package plan (ECON). |

## 4. Checkpoint files: what the lenses want

**Fields and item kinds**

| Addition | Sources |
|---|---|
| Interfaces, groups and per-unit state as item kinds (nine kinds: S, I, P, U, unit state, F, G, N, Q) | ARCH "The checkpoint files", app. B |
| Spec item: test class owed (`inputs`, `mirrors`, failure shapes, lifecycle), examples as data rows, `silent_on`, status including amended-by-orchestrator, decision with rejected options | GH-M3, GH app. D; BR-M4; ECON-M3; RT-M2c |
| Requirement prose in a fixed sentence pattern, one behaviour each | GH "The checkpoint files" |
| Fingerprint of the item text carried by tests that cite it, so an amended item marks tests and units suspect | GH "The checkpoint files" (the Doorstop precedent is marked from memory, unconfirmed) |
| Unit plan: tests it turns green, write scope by role, signatures | BR-M4, BR app. A; SRE "The flow" 2 |
| Unit state: step, status, intent record (unit, step, base commit, worktree, session), dispatch outcome, commit, tree key per tier | ARCH; SRE-S; BR app. A |
| Expected-red set by unit and step | ARCH-M3; BR app. A (ARCH's schema has no field for it) |
| Counters and limits as data: fix cycles, nudges, audit rounds | ARCH-S; BR app. A |
| Finding: `born_of` commit, `duplicates` edge; rulings on groups; intake matches new findings against closed groups | RT-M5b; GH; ARCH-S; RT app. A3 |
| Note: `applies_to`, must cite a test or commit, may not interpret a spec item, what retires it; one file per note | ARCH; RT; BR; SRE |
| Question: items, packages parked, options A/B/C, recommendation | ARCH; SRE "What Robin looks at" |
| Run records as files: cut `{level, session id, digest}`, reset pending, hold flag, kept messages verbatim, unfiled answers, heartbeat, `claude --version` | ARCH-M1, M2; SRE "The checkpoint files", "Watchdog"; RT-S |
| Sign-off digest; `schema = N` on every file; role on every `usage.jsonl` row; time by state | ARCH-S; SRE "Upgrades"; ECON-M4; SRE-S |
| Ids issued by `lst` under a lock; `spec/index.toml` generated | SRE-M5; GH (ids that cannot collide) |

**Lint checks** (beyond schema, links, producers, cycles)

- Coverage both ways: each checkable signed item covered by a unit and cited by a test; each test tag cites a live item (ARCH lint 1). No orphan item; every item has an example; class obligations met; lifecycle check (GH-M3).
- One producer per interface; each consumer a direct edge or a seam test (ARCH 2). Unit file sets disjoint (ARCH 3; moot under slices, see D1).
- State agrees with plan and git (ARCH 4; SRE `doctor`). Finding, group and ruling consistency (ARCH 5). Signed digest matches or a question covers the difference (ARCH 6).
- Caps: notes per level, a token budget per hydrate level, no note whose targets are all closed (ARCH 7, GH, SRE, ECON).
- `stable(level)` byte-identical across runs; each cut fresh or stale (ARCH 8). `flow.toml` has no ordering or condition keys (ARCH-S).
- Share of items owing no test, shown on the page Robin signs; a mutant in code claimed for an item must be killed by a test tagged with it (RT; the second is unverified against cargo-mutants).
- Each lint rule ships with a file that must fail it (RT-S).

**Refusals** (transitions, not lint): done without attestation; an edit to a signed item; a reopen without an issue (ARCH); `unit done` when the cited test set shrank or gained `#[ignore]` (RT-M5c); hydrate on a file that fails to load (SRE).

**Commands:** `stable`, `delta`, `check`, `render`, `run …`, `step begin` (ARCH); `step abandon`, `recover`, `doctor`, `edit`, `restore`, `preflight`, `status`, `log`, `report`, `migrate` (SRE). RT app. A2 counts 23 against the draft's 9; BR-M5 wants this budgeted.

**Tests:** kill at a random point and resume from files alone, extended to between `unit done` and the commit, during a fork, during an atomic write (ARCH; SRE). The cold-reader test at five frozen points, 95% of keyed answers right, no confident answer where the key says "not in the files" (BR-M4; GH names the same test). BR's own three haiku runs found five missing slots: dispatch outcome, expected-red set, role scope, flow limits, the rule after a crash.

**Presentation:** store per item, present one ordered document per level (ARCH); a compact rendered view for the model, not raw TOML, saving 15 to 25% of tokens (ECON); a delta form for spec and plan changes (GH); keep the whole spec in the prefix until about 40k tokens (ECON).

**Argued against:** a database or SQLite (ARCH, SRE); JSON Lines and any "supersedes" field (ARCH, EA §5, GH); interfaces declared in TOML (ARCH, GH); `toml_edit` (ARCH, BR; see D6); a `state.toml` per package (ARCH, GH, SRE); lazy loading of spec items (ECON); buying beads (GH); three levels of promoted notes (BR); a second repository (BR; see D5); the claim "TOML has no traps" (EA §5).

## 5. Decisions only Robin can make

| # | Problem | Options | Panel's leaning |
|---|---|---|---|
| R1 | What Robin signs, and what happens when the spec is silent. Challenges "spec-only sign-off" and "no stops after the spec". | (a) As drafted: prose items; every gap parks a package and asks. (b) Robin also marks about ten examples (ten minutes a build); the orchestrator decides silent cases, records each as an amendment with rejected options, a second reader checks it, and Robin gets a rendered diff at the end. | (b): GH-M4, RT-M2, BR ruling. RT warns (b) without the second read is its failure story 2. |
| R2 | The abandon line: no criterion in the draft can fail. | Robin sets: a date by which a pipeline he uses exists; the multiple of a plain session's usage he would pay for half the defects (BR proposes 5, stop at 10); hours for the reference build (BR: 72, stop at 120); stops per build (BR: 2, stop above 5). | RT-M1, BR-M1, ECON-Q6 all ask; only BR offers numbers, marked as proposals. |
| R3 | "Built by hand first, then by itself." | (a) Keep S2 and S3 as self-build stages. (b) Self-build covers `lst` only (ARCH-M5c). (c) Drop it as a stage goal; the second stage goal is a second outside job. | (c): RT story 1, BR "Scope" (194 of run 3's 360 h was werkbank patched under the run). ARCH keeps (b). |
| R4 | Spend before S1, and the size of version 1. | (a) Build S1 now. (b) First spend $95 to $300 [estimate] and a few days of throttle on a baseline and E1, plus about a day on F2 and half a day on S0-b; cut version 1 to one package, serial, with planning and scoping by hand. | (b): GH-M2, RT-M1, BR-M3, BR-M5. ECON's first estimate, $570 a build against $10 to $90 for a direct session, is the reason given. |
| R5 | Does Robin want to watch and answer from his phone? | (a) Yes: Remote Control joins F2, and if it fails route A becomes primary (SRE-M1a). (b) No: drop it (BR-S). | Split; in neither brief nor draft. |
| R6 | Models: which tier orchestrates and which runs each role. Spends his subscription. | Opus orchestrator (ECON's pricing assumed it); sonnet orchestrator forking an opus ruling for spec or plan edits (ECON-S, about 5% saved); decide by replaying 30 werkbank rulings at each tier (BR-S). | Measure first: ECON, RT-S, BR. |
| R7 | Size of the reference pipeline. Every cost scales with it. | Robin names units, lines or spec items. ECON assumed 3 packages and 12 units; BR's E1 uses about 10 spec items. | ECON-Q1, BR-Q4, BR app. C 10. |

Not challenged by any lens: one live session, a new project, stellwerk gates, the DuckDB pipeline as first job. Rust was not challenged, but EA §3 notes the brief says "I'm not sure… push back" while the panel brief lists it as decided, and SRE measured that no Rust toolchain is installed. When werkbank is frozen (O6) is still open; no lens addressed it.

## 6. Spikes and experiments, in order of what the redraft depends on

| # | What | Cost | Decides | Sources |
|---|---|---|---|---|
| 1 | **F2, widened**, on the spike mod, with a pass mark: 30 or more resets; typed message, Esc, hold and `/go` on F; sub-agents of 6 and 65 minutes in flight; stale cut rebuilt every third reset; stale-spec cascade; cold restart; 3 to 6 h idle; permission dialog open at reset and from a sub-agent; a session permission grant across a reset; mod file saved mid-session; fork pruning. (Remote Control: see R5.) | About a day, a few dollars of haiku | F or A, hence the shape of `hydrate` and run state; reset per step or per unit | ARCH-M5a, SRE-M1, RT-M4, ECON-M5, EA correction 13 |
| 2 | **S0-b**: install Rust, nextest, mutants; skeleton workspace with DuckDB; peak memory, swap, cold and warm times, target size, bundled vs prebuilt DuckDB, mutants on a diff | Half a day | Whether the gate loop fits 8 GB; real T1 and mutation times | SRE-M4, BR app. C 11 |
| 3 | **Baseline plus E1**: one spec of about ten items, shared skeleton, held-out set of 40 checks; arms P (plain), U (file units), S (slices); seven runs, sonnet workers, by hand | $95 to $300 [estimate], days of throttle | Whether the flow earns its cost; D1; the baseline for R2 | BR-M3, app. D; GH-M2; RT-M1 |
| 4 | **Cold-reader test** on mock files at five frozen points, haiku, settings off | Cents a run (BR's three runs: $0.17) | Which slots are missing; S1a's exit test | BR-M4, GH "The checkpoint files" |
| 5 | **Ruling replay**: 30 werkbank findings with known rulings to the orchestrator prompt at each tier | Not priced; BR has not verified the rows replay without their tree | Orchestrator tier; whether rulings can be trusted | BR-S |
| 6 | **Orchestrator-tier rerun** of the reset, nudge and guard spikes, and of RT's silent-spec spike (haiku, 8 runs, $0.45) | Not priced | Whether haiku results carry to the real orchestrator | RT-S, RT story 3 |
| 7 | **S0-d, seeded faults**, widened with seeded spec omissions, and a sample size | Hours of throttle per run (GH) | D2; intake yield in Rust; each `flow.toml` switch | GH app. C2, RT "Attacks", BR-S |
| 8 | **S0-c, guards on `warn`**, made permanent as a departure count | In the build | Path A vs B | RT-M3c |
| 9 | **A1**, slow hook on route A | 10 minutes | Only matters if A is used | draft §7 |
| 10 | Cache-read weighting on the subscription meter; a half-hour look at the built-in Workflow tool | Short haiku test; half an hour | Whether the prefix is the largest recurring cost; whether an inner loop exists ready-made | ECON-Q2; GH-S 7 |

## 7. SHOULD-fixes worth keeping, and claims to treat with care

**Keep:**

- `flow.toml` is a lookup table, linted for no ordering or condition keys; Leitstand's own files apart from the project's checkpoint (ARCH-S).
- Fold the 6 to 8 `lst` calls per unit into one, or have the mod run them on `step_done`: about 20% of orchestrator turns (ECON-S).
- Per-unit usage budget in place of wall caps; time recorded by state (SRE-S). Targets in minutes of Robin's wait, since "usage first, wall time second" is empty under the throttle (ECON-S).
- T3 at package ends, not on idle (SRE "The flow" 6; ECON-S).
- `lst gate` classes a signal exit as `infra` and retries once serially; parked time never counts toward nudges or alarms (SRE "A build, hour by hour").
- Pin and vendor skills, stellwerk, the claude binary and the SDK; upgrade only at a package boundary (SRE-S, "Upgrades").
- Fork pruning: keep the last 3 and any from a faulted step; title forks (SRE-S).
- Status line with a mode word, and `lst report` from the ledger, not the model (SRE "What Robin looks at").
- Rank findings before ruling (GH-S 4). Lessons become tests or lint before notes (GH-S 5).
- Vocabulary: cargo's words for cargo's things; too many terms in two pages (GH-S 6).
- Record Robin's words verbatim when a kept message is filed (RT-S).
- Skip fix re-review for test-only edits covered by mutation (ECON-S).

**Contradicted, unsupported or unverified:**

- ECON's "25 of 27 reachable earlier" is one reader's classification (EA row 11; RT "Attacks"); its saving from dropping the per-unit audit assumes a 50% catch, unmeasured in Rust.
- Every dollar figure from ECON is an estimate by its own statement; BR and RT used them unverified. "$570 a build" assumes 3 packages and 12 units and an opus orchestrator the draft never chose.
- RT's "8 of 71" is its own subtraction from V8.3-SCOPING §4.1; BR did not re-derive it. RT's "23 `lst` commands" is its own count.
- BR read RT before its spike line was filled in, so BR's rulings do not weigh RT's spike.
- BR "The flow" lists the Economist among lenses reaching the skeleton; the Economist does not discuss it.
- ARCH's cargo behaviour is from its own knowledge, nothing run; SRE's Rust times and sizes are estimates; no lens ran Rust (not installed).
- GH's prior art came from one sub-agent whose sources GH did not re-read; its baseline gap (B7) and BR's are absences found by search.
- RT's and BR's spikes are haiku on toy fixtures; BR's reader was not fully cold (it drew on Robin's memory file).
- SRE's Remote Control and phone material rests on a need stated in neither brief nor draft.
- "Intake removed 17 of 19" is nearer 7 of 19 mechanically (ECON "Is 'judge less' achieved?", from EA correction 8). Grouping is unmeasured: 8 to 10 of 81 re-finds rhymed (EA §4).

**Auditor items that look still open** [inferred from a grep of the draft, not a full re-read]: line 71 "Robin accepted nearly every recommendation" (EA row 7, unsupported); lines 401 to 402 "already proven" and "cheaper than the full panel" (rows 48, 53); line 346 "stops the build on a miss" marked tested (row 40); line 618 "the recorded pattern" (row 51); line 304 still names a fresh-session-per-step wrapper beside route G (EA §3 contradiction 2). The auditor's §4 and §5 points on the flow and the files are carried by actions 5, 11, 13, 15 and 16 above.
