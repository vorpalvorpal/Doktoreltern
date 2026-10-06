# Bar Raiser, round 2: appendix

Markers: **[M]** measured by me this round, **[C]** checked in a file, **[P]** my proposal, **[U]** not verified.

## A. Spike: can a settings hook carry rules verbatim across context resets, with no mod?

Three lenses (Green Hat, Red Team, SRE) lean on this route and all three mark it untried. I tried it.

**Setup.** Scratch folder `reviews/scratch/round-2-bar-raiser/hook/`. A project `.claude/settings.json` with one
`SessionStart` hook; the hook (`hook.py`, 9 lines) reads `CARRY.md` and prints it as `additionalContext`, with a
tag naming the hook's `source` and a random number, and logs each firing. Claude Code 2.1.291, `claude -p --model
haiku --setting-sources project --max-turns 1`, no tools. Seven calls, **$0.20** in all. Nothing left running; the
seven print-mode transcripts remain under `~/.claude/projects` for that scratch folder.

```json
{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"python3 \"$CLAUDE_PROJECT_DIR/hook.py\""}]}]}}
```

**Results [M].**

| # | Step | Hook `source` logged | What the model could quote |
|---|---|---|---|
| 1 | New session; ask for a planted passcode, a rule and a number | `startup` | All three, word for word |
| 2 | Edit `CARRY.md` (new passcode, a new rule R4); `--resume` the session; ask | `resume` | Both passcodes, the newer named as latest; R4 quoted |
| 3 | `--resume` with `/compact` as the prompt | `resume`, then `compact` | (no question asked) |
| 4 | New session, a 13,113-character carry file with markers at about 2,000, 9,300, 12,000 and the end; `/compact`; `--resume`; ask | `startup`, `resume`, `compact`, `resume` | Tags `compact-…` and `resume-…` both visible (the pre-compaction `startup` tag gone). **All four markers absent.** Highest decision seen: A021 of 148, about the first 1,900 characters. The model described the rest as beyond a "preview" |
| 5 | New session, the file cut to 9,658 characters | `startup` | All three markers present; highest decision A107 of 107: the whole file |

**What this shows.**

1. The route works on the installed version: the hook fires at start, at resume and at compaction, and what it
   prints reaches the model word for word. The copy planted at compaction is in the context after it (row 4).
2. **There is a cliff, and it is silent.** Up to 10,000 characters the file arrives whole. Above it the model gets
   about the first 2,000 characters and no error is raised anywhere. `research/mods.md:63` records the cap; nobody
   recorded what happens past it. sampleTidy's two ruling documents are 59,508 and 58,594 bytes [M], so the carry
   file can only ever be the standing rules plus pointers; the size check is not optional.
3. Each resume adds another copy; older copies stay in the context until a compaction (row 2 saw two passcodes).
   The file therefore needs a first line saying the latest copy wins, or to be append-only.
4. The hook fires on `resume`, and route F's reset is a `resume` of a fork. So the same hook should re-plant the
   carry file under route F as well, which would make the carrier independent of the route. **[U]:** I did not run a
   mod; `$.command.run resume` may or may not fire the settings hook the way `--resume` does.

**Limits.** Haiku; print mode, not the terminal interface; `/clear` not tested (it cannot be sent this way);
whether a typed `/compact` in the terminal behaves as the print-mode one did is unverified; I asked the model what
it could see and did not read the request bytes.

**Not tested: native `/rewind`.** It is an interactive menu. `research/mods.md:42-48,93` [C] records from the
documentation that it truncates to an earlier turn, is served from cache, offers "Summarize from here", is
user-triggered only and "not documented as addressable by name or id from code". `sdk-and-frontends.md:90` [C]:
it does not exist outside the terminal interface.

## B. Green Hat's rung-1 claim, checked row by row

| What rung 1 is said to give | Native today | Source |
|---|---|---|
| Return to an earlier point, cache kept | Yes, by hand: `/rewind` | mods.md:93 [C], not tried |
| A summary of what followed, with typed guidance | Yes, by hand: "Summarize from here" | mods.md:48 [C], not tried |
| Rules re-planted word for word after a reset | Yes, a settings hook, under 10,000 characters | A above [M] |
| Fires at a context threshold with nobody watching | **No.** Hooks cannot start a rewind, clear or compaction | mods.md:42 [C] |
| A program returns the session to a named mark | **No** | mods.md:42 [C]; F1 is the only route |
| The note is checked before anything is discarded | **No** | none |
| Undo of a bad reset | Partly: the pre-rewind conversation can be resumed | mods.md:48 [C], not tried |

Ruling: the claim is right about function and wrong about attention. What the native parts lack is exactly the
unattended trigger. That is a reason to build the mod second, on evidence that Robin is doing handovers by hand
often enough to mind, and not a reason to build it first.

## C. The modularity test, as four checks that can fail [P]

| Check | How it is run | Fails when |
|---|---|---|
| **M1. Deletion, run for real** | A script per piece takes its tool off the path (or its hook out of settings), then runs every other piece's tests and one wired smoke run that includes a seeded defect. Once per piece, the fallback named in the Architect's deletion table is used for one real working session | Another piece's tests fail; the smoke run passes the seeded defect; the fallback was never used on real work. Also: a grep of each tool's source for the others' names is not empty |
| **M2. A second implementation before a contract is called fixed** | Session: two of {hook and typed commands, helper only, mod} pass the same acceptance script (section D). Store: `render` output is accepted from hand-kept markdown files and from the store by the same cold-reader test. Gates: one mechanism runs against a second kind of target | The second implementation needs a change to the contract or to any other piece |
| **M3. Used on outside work before the next is started** | A piece counts as built after three working sessions on sampleTidy that end in sampleTidy commits. A weekly count is kept in the open: tool commits against sampleTidy commits | A piece is started while the one before has fewer than three such sessions; two weeks in a row with tool commits and no sampleTidy commit |
| **M4. One rethink drill** | In week three or four, replace one piece on purpose (the reset route is the cheap one: mod to hook, or back) and count the files changed outside that piece | Any file outside the piece and the wiring file changes |

M1 and M4 answer the Red Team's objection that a deletion test is "met on paper by a second path nobody runs". M3
answers its first failure story. A tripwire alongside: all tool code (mod, helper, scripts, pack gates) under 1,500
lines and at most eight verbs before a flow pack exists [P]; crossing it is a question for Robin, not a refusal.

## D. Acceptance scripts for rung 0 and rung 1 [P]

- **Carry.** Ten planted facts (three standing rules, three decisions, two dead ends, two commands) in `CARRY.md`;
  ten resets by the route under test, on the model that will orchestrate; after the tenth, ten of ten are quoted
  correctly. File under 9,000 characters, checked by a script at every write. (The Red Team's chain kept 0 of 9
  rules through two model-written notes; this is the same test with the carrier changed.)
- **Handover note.** Written at three real stopping points on sampleTidy. A cold reader (no tools) answers ten
  resume questions with a key, three keyed "not in the files": nine right, and no confident answer where the key
  says "not in the files". This is round 1's test on real material.
- **Rung 1's mod, when built.** Thirty resets with a typed message, an Esc, a sub-agent and an open dialog in
  flight (SRE): no undetected fault, nothing typed by Robin lost, and the mod's absence is reported at launch.

## E. Example gate plan: sampleTidy, the ACIRL gas readings adapter, in R [P]

One project's plan, shown as Robin would sign it. It is an example of the third level in synthesis §6, not a gate
set for the system. Facts are from `sampleTidy/dev/STATE.md:118-150` [C]: 16 `.xls` workbooks and 43 PDFs; two
sheet geometries; probes `G182` to `G265`; float noise such as `0.0299999999999999`; 12,656 gas analyses already
in the database. Time budgets are guesses until the SRE's half-day of timing is done.

| # | Claim Robin signs, in his terms | Pass mark | Budget | Shown to him at signing as |
|---|---|---|---|---|
| G1 | Ten readings I marked by hand in real workbooks come out exactly as I wrote them | 10 of 10 | 30 s | The ten rows; one with a wrong value turning the check red |
| G2 | Every row in every gas workbook is loaded, rejected with a reason, or dropped as a duplicate | 0 rows unaccounted, per file, over the 16 workbooks into a scratch database | 5 min | A workbook with one row silently skipped: red |
| G3 | Loading the same workbook twice, or with its rows shuffled, changes nothing | 0 rows differ | 2 min | A second load that doubles a probe's readings: red |
| G4 | No column or sheet in the workbooks is ignored without my say | Every source column is read or on a list I signed | 10 s | `Gas Buildings` read without its building column: red |
| G5 | A blank `Location` cell means "same as above"; `0` and a non-detect stay different | Named cases, each a row | 10 s | Each case flipped: red |
| G6 | The files I own did not change: the contract, the operating rules, my marked rows, this plan | Hashes match | 5 s | An edit to a marked row: red |
| G7 | Nothing that worked before is broken | The R tests for the files touched pass; the full suite at a release only | Measure first | none needed |
| G8 (if it holds up) | Readings already in the database for the same month and probe agree with the new load | Every difference listed as a row and ruled by me | 2 min | [U]: where those 12,656 rows came from decides whether this is an independent check |

Also in the plan: **a "not covered" list** (here: PDFs; probes missing from the feature registry; behaviour of
reconcile against a database that already holds the month); **one fresh model read per
slice**, one round, whose findings must arrive as a failing check or as rows; **totals**: under ten minutes of wall
time to close a slice, at most three rulings and thirty minutes of Robin per slice.

Left out on purpose: lint for owed test kinds; a selector for "the affected slice"; a standing canary suite;
coverage; second reads; mutation in R until a tool is verified (the red demonstrations at signing do that job
once); the shadow run; anything about a port. If a port is ever chosen, add the oracle gate at adapter-to-IR level
only, with the Green Hat's proof of the normaliser (each rule has a pair it must equate and a pair it must not, and
a count of hits per run).

## F. Rulings on the other lenses' MUSTs (round 2)

| MUST | Ruling | Why |
|---|---|---|
| Auditor 1 to 4 (corrections) | Done in the synthesis as it now stands [C for §2, §4, §7 and question 22] | Evidence |
| Architect 1 (no names; wiring file; deletion test) | Accept, with the Red Team's guards (a wiring string is one command and literal arguments; `ready` prints in id order) | The grep catches `next`, not `ready \| head -1` |
| Architect 2 (fold C into B) | Overruled for now: ownership is a rule over paths, checked by a gate. A store field can follow if a store is built | He concedes the store refusal is a tripwire; the path rule works on `CONTRACT.md` today |
| Architect 3 (kinds, unparsed bodies, format rules) | Accept, deferred to the day a store is started | Not needed before |
| Architect 4 (gauges derived, never stored) | Accept as a rule; building it deferred (Red Team: a typo fix drops an item to "asserted") | No records exist yet to derive from |
| Economist 1 (baseline with oracle before the store) | Accept; the oracle becomes "the gate plan" since the first job is not a port | Red Team story 5 |
| Economist 2 (three measurements) | Accept the cold-cache and state-size ones as part of rung 0's tally; the meter weighting is worth its $5 | Cheap |
| Economist 3, 4 (no chooser; a kill number per rung) | Accept | Four lenses and three hand-runs |
| SRE 1, 2 (in-flight cases, undo, loud failure, helper-only path) | Accept as the definition of rung 1 when it is built; not rung 0 | They are why rung 1 is not next week |
| SRE 3 (measure before budgeting) | Accept; half a day, before the gate plan is signed | Budgets in section E are guesses |
| SRE 4 (a flow-less watcher) | Defer until Robin leaves a session unattended and a stall is recorded twice | Rule of two |
| Green Hat 1 (name expectations; state ownership once) | Accept. Expectations are the project's own files, owned by Robin; not a tool | Matches the gate-plan level |
| Green Hat 2 (thin skeleton of every module first) | Half: baseline first, yes; "every module at its thinnest", no | Red Team: eight thin modules alive from day one cannot be found unnecessary |
| Green Hat 3, 4 (scheduler wording; normaliser proof, oracle-free relations, narrow §6.5, drop the selector) | Accept | Evidence in her A1 to A4 |
| Red Team 1 (rung 0 is outside work; abandon line) | Accept; it is my MUST 1 | 58 days without a sampleTidy commit [C: last commit 2026-08-09] |
| Red Team 2 (rules never pass through a model-written note) | Accept; section A shows the carrier and its limit | 0 of 9 after two notes |
| Red Team 3 (guard the wiring and the mod) | Accept | Above |
| Red Team 4 (no port slice before the corpus run and a named benefit) | Accept | The oracle's own behaviour on the corpus is not established |
