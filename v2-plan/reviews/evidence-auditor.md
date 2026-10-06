# Evidence auditor (White Hat): review of SCOPING-DRAFT.md

Checked 54 claims; the ten load-bearing figures went to the primary record (V8.3-SCOPING, DECISION-LOG,
CHANGELOG, V3-SCOPING, `v8.3-plan/`, git, stellwerk code). Not checked: the hand-built 8.3 checkpoint (`V8-CHECKPOINT.md`, not in the repo),
literature figures other than the 56%, and the run logs under `spike-*/runs/` (local only).

**Verdict.** The figures are mostly sound: 26 confirmed, 11 confirmed with a caveat the draft drops, 14 wrong,
overstated or presented as measurement, 3 unsupported or could not check. One claim in §1.3 is simply false, and §4.2/§10 contradict
each other on the fallback.

## 1. Corrections list (usable on its own; the number is the table row)

1. **Row 20, §1.3 and §5.3: "no case of an audit fix causing a new bug" is wrong.** CHANGELOG v3.3 (1 Aug,
   sampleTidy, lines 4229 and 4263): "Remediation is the dominant defect source: Phase-7 round 3's three sharpest
   findings all came from round 2's fixes; Phase-8a round 2 had three of twelve from round-1 fixes, one a
   blocking regression already pushed." The research file read only package F's ledgers. Robin's brief says the
   same ("often audit fixes are the cause of new bugs"). §5.3's "insurance sized accordingly" needs resizing.
2. **Row 4, §1.1: 101.7 h is the sum of overlapping windows.** V8.3-SCOPING §1 fact 3: halted with an escalation
   open for 46 h (union), 29 h after crediting forks that ran meanwhile. Say 46 h, or 101.7 h summed.
3. **Row 3, §1.1: $0.46 vs $10 to $45 mixes bases.** $0.46 is one FIX writer task; the like-for-like figure is
   $0.4 to $3.7 for a round's FIX units against $10 to $45 for the same round's rulings (V8.3-SCOPING:65-66).
   The gap is real but about 3x to 100x, not 20x to 100x.
4. **Row 18, §1.3: the 3.5 h suite is partly a projection.** Measured: 10.7 min at 8.3.1, 19 min (3 Oct), 57 then
   85 min. The "3.5 h" is one extrapolation (24% at 53 min) that "may be contention"
   (`canary-r2-architect.md:23`). Say "85 min measured, 3.5 h projected".
5. **Row 45, §10: the fallback ran 19 resets, not "at most 32".** 32 is route B. A (the stated fallback) ran 19.
6. **Row 29, §1.6: superpowers rewrote core skills in the last three releases, not four.**
7. **Row 49, §10: "self-check changed 1 ruling in 29" is the src/tests-only slice** (V8.3-SCOPING:642). Overall
   the self-check changed the outcome in 9 of 100 cycles (:514).
8. **Row 13, §1.3/§5.3: "intake removed 17 of 19 noise findings" is a read-only replay, not a measurement.**
   `spike-exec-findings.md`: 10 are harness items intake would refuse (§5.3 now routes them), 6 are defects H owns
   (deferred, not noise), and only three tests were actually written. Say "would have removed".
9. **Row 14, §1.3: "21 of 35 rejects were duplicates" is a regex over reason text** ([estimated] in
   `finding-economy.md:38`), and the 35 are rejected plus deferred rulings.
10. **Row 6, §1.1: 126 escalation rows is not the number that "became those stops".** 53 stops are 106 rows;
    the other 20 were advisory rows auto-resolved (`t1a-issues.md:16`).
11. **Row 50, §5.4: stellwerk's gate shim has never been called by werkbank.** `stellwerk-shims.md`: no werkbank
    code invokes it, routing through it is F-61 (deferred after H), and the 9b client looks unbuilt. The draft
    says "this is how mutation and the other checks were added for werkbank 8.3" and omits this. `mutate` there
    runs werkbank's Python harness; it is not a general mutation shim.
12. **Row 40, §4.2 fault table: "T: the mod stops the build on a miss" is untested.** Detection was shown on a
    real fallback; spike-live §11 marks "stop, or fall back to clear" UNTESTED. Row 41: "nudges twice, then
    stops": one nudge fired; the stop path was not run.
13. **Row 39, §4.2 route F: say what was not tested.** Expired-cache case UNTESTED (F1 §3); `query()` with
    `resumeSessionAt` UNTESTED; ids are remapped on fork, so a recorded cut id is valid only in the session it
    was read from (F1 §4). The draft's cache figures hold only while the cache is warm (1 h on a subscription;
    the draft's "reads 78.7k" is not guaranteed after a usage-limit park).

## 2. Claim table

Verdicts: C confirmed, C* confirmed with a dropped caveat, W wrong, O overstated, E estimate presented as
measurement, U unsupported, X could not check.

| # | Claim (draft section) | Source checked | Verdict and correction |
|---|---|---|---|
| 1 | 62% of $929 was judging (§1.1) | V8.3-SCOPING §1.1; econ | C*. It is adjudication ($576/$929). Audit sweeps ($178) and verification ($74) are separate. |
| 3 | $0.46 vs $10-45 (§1.1) | V8.3-SCOPING:65-79 | O. See correction 3. |
| 4 | 53 stops, 101.7 h idle (§1.1) | t1a-issues:26; V8.3-SCOPING §1.3 | O. See correction 2. 53 and 101.7 are both primary-record figures. |
| 6 | 126 rows became those stops (§1.1) | t1a-issues:16 | W. 106 rows plus 20 advisory. |
| 7 | Robin accepted nearly every recommendation (§1.1) | werkbank-evidence:96 | U. No count exists; the sample is 8.3 build batches, not run-3 stops; named exceptions: Q9-5, seams MUST 2. |
| 8 | Driver 10.8k to 49.3k lines; phases.py 929 to 6,722 (§1.2) | evidence:17-24; git recount | C. phases.py exact (git). My recount: 11.8k (27 files) to 51.8k (95 files incl. subfolders); depends on scope, ratio holds (about 4.4x). |
| 9 | 52 of 55 patches were ten missing rules (§1.2) | V8.3-SCOPING §1.4 (T2) | C. |
| 10 | "Much of the growth is tests, harness" (§1.2) | evidence:26-30 | C*. 49.3k excludes tests (103k, separate); growth is harness, tape and synthetic modules inside the source. Say so. |
| 11 | 25 of 27 reachable earlier; 24 could be failing tests (§1.3) | V8.3-SCOPING §1.2 | C*. "By one reader's classification"; 24 are "failing tests or mutants". |
| 13 | Intake removed 17 of 19 (§1.3, §5.3) | spike-exec-findings:11,73 | E. Correction 8. |
| 14 | 81 findings, 53% accepted, 21 of 35 duplicates (§1.3) | finding-economy.md §0-1; D-078 | C* for 81 and 53% (43 accepted or amended; only 15 are "real gaps"); E for 21 of 35. |
| 15 | 9 of 12 canary finds were siblings (§1.3, §5.3) | D-076 (DECISION-LOG:2872) | C*. 12 are the test-catchable finds; "siblings or weak pins of tested behaviour". |
| 16 | Same-vendor rounds plateau in 1-2 (§1.3) | V8.3-SCOPING:127 | C*. Literature, not a werkbank measurement; §1 intro calls the section measured. |
| 17 | Mutation-first: 9 of 27, 2 direct; 86 gaps under $1 (§1.3) | DECISION-LOG:1478-1488; V8.3-SCOPING:79 | C. Python mutator on Python code; 18 of 27 had "none", 9 of those missing behaviour. |
| 18 | Suite 10.7 min to 3.5 h in three days (§1.3, §5.4) | canary-r2-evidence-auditor G4; r2-architect:23 | O. Correction 4. |
| 19 | Live canaries passed 0 of 13 (§1.3) | canary-BRIEF:34; canary-economist:8 | C. "No run has passed the original rule"; a 14th tape had no report. |
| 20 | No audit fix ever caused a new bug (§1.3) | CHANGELOG:4229,4263 | W. Correction 1. |
| 21 | 3 of 12 from the orchestrator's own fix lane (§1.3) | D-076 | C. And it is itself a fix-induced case. |
| 22 | Write-scope: 8, 6 unnoticed, 0 FP, 0.6 s (§1.4, §4.3) | V8.3-SCOPING:241; T1:29 | C*. A replay over history "as a plain function"; never run live. |
| 23 | Random-point kills made resume reliable (§1.4) | evidence:89,126 | O. One kill -9 canary passed (30 Sep), plus 10-seed chaos and 20-seed crash gates. "Reliable" is inference. |
| 25 | Hand-run 8.3 skipped gate 4x/day; bloat; citations "often wrong" (§1.5) | D-076 for the gate; checkpoint not in repo | C for the gate cadence; X for "often wrong" and the bloat rule. |
| 26 | v2 edited its skill after 4 days of compaction (§1.5) | V3-SCOPING:76-80 | C*. "Compaction summarized it away" is the authors' diagnosis. |
| 27 | Mod cannot rewind or fork; reset 4 ms; four resets (§1.6) | spike-reset §7 | C for 4 ms (hook-answered, no model call) and four resets; stale as a headline since F (see section 3). |
| 28 | Four routes, no leak, over 19-32 resets; `/rewind /branch /fork` take no turn argument (§1.6) | spike-live §1, §5, §8 | C*. C ran 9 resets (and uses wrapper keystrokes); E 28. `/fork` was read from hint and docs, "not run (UNTESTED)". |
| 29 | Superpowers rewrote core skills in last four releases (§1.6) | superpowers.md:78 | W. Three. |
| 31 | Cargo selects tests per crate at the finest (§1.6, §5.4) | rust-proptest:49 | O. Marked KNOWLEDGE (verify). Cargo/nextest filter by test and binary; what is missing is change-based selection finer than a crate. |
| 32 | v3.0 = segmented Opus + 150-line runner (§2) | V3-SCOPING:39,53 | C. |
| 33 | Never run end-to-end; never used on a real build; killed by 90-min cap; TOML typo (§2) | CHANGELOG:4225,3708,2793,2089 | C. The record contradicts itself (never used, 10 Aug; used on stellwerk v4, Sept); the draft passes over it. |
| 34 | 837 turns, 75%, 80%, 37% (§2) | V3-SCOPING:23-27 | C. "Model-weighted spend". |
| 36 | Route A/B/C/E cache and cost table (§4.2) | spike-live §5 | C. 30,546/36,444; 66,512/774; 72,161/709; $0.068/.074/.032/.026. |
| 37 | E: one step in 27 wrong directory (§4.2) | spike-live §8 | C*. 28 resets; step 28 failed, 26 of 27 earlier steps recovered. |
| 38 | Route F table: 8 resets, 78.7k/0.2k, 73.0k/0.1k, 46 lines, 10 ms (§4.2) | spike-f1 §1-4; `wc -l helper.mjs` = 46 | C. Fork took 8-16 ms. |
| 39 | F omissions (§4.2) | spike-f1 | C*. Correction 13. |
| 40 | Mod stops the build on a missing mark (§4.2) | spike-live §6, §11 | O. Correction 12. |
| 41 | Turn without `step_done`: nudge twice then stop, T (§4.2) | spike-live §4, §5 | O. One nudge recovered once. |
| 42 | Esc at a dialog; working directory; tool pinning, T (§4.2) | spike-live §3-4 | C. |
| 43 | Mods API early access, drifted, remotely switchable (§4.2) | mods.md:102 | C. |
| 44 | No front-end can attach live to an SDK-driven session (§4.2) | sdk-and-frontends Q4 | C*. README and file-name level, INFERRED. Omits the official `claude --bg` plus `claude attach` variant (the research's own fallback). |
| 45 | Fallback ran at most 32 resets (§10) | spike-live §5 | W. Correction 5. |
| 46 | 6 of 8 unnoticed; 29 withdrawn findings (§4.3) | T1:29; V8.3-SCOPING:645; econ.md | C. |
| 47 | Harness findings about 24; keywords hit 19, 3 real (§5.3) | t1a C8; V8.3-SCOPING:1073 | C. |
| 48 | Panel cost 893k tokens (§5.1); "proven on stellwerk phase 1" (§4.4) | evidence:113 (D-047) | C for 893k (539k opus). O for "proven": a counterfactual, 15 of 26 later defects (7 direct), 0 of 15 a design could not show. |
| 49 | Self-check changed 1 in 29 (§10) | V8.3-SCOPING:514,642 | W. Correction 7. |
| 50 | stellwerk `gate.py` 840 lines, Python only, JSON and exit codes (§5.4) | `wc -l`; gate.py:33-35; stellwerk-shims | C for the code (HEAD 2f2c1ec). Correction 11 for what is omitted. |
| 51 | Pipeline-gate and R "recorded pattern" (§6) | rust-proptest:74 | O. The R or Julia subprocess pattern is "UNSOURCED, my judgment". Statistics gaps (:64-66) are C. |
| 52 | DuckDB built from source is slow (§6) | none in research | U. Plausible; the draft does mark it "to measure". |
| 53 | compound-engineering lenses "cheaper than the full panel"; "nothing that reads cost" (§4.4, §5.5) | compound-and-others | U. No cost figure or search for it is recorded. |
| 54 | Superpowers forbids implementers and reviewers from using sub-agents (§4.4) | superpowers.md:55,91 | C. Draft says "sub-agents may not use sub-agents": narrower in the source. |

## 3. Stated as tested but marked UNTESTED; Robin attributions; contradictions

**Tested versus untested.** Only rows 28, 40 and 41; the rest of §4.2's T marks match the reports.

**Attributed to Robin that BRIEF.md does not support.**
- O6: "werkbank frozen after 8.3 and H [Robin, 6 Oct]". BRIEF says only "new project, reuse parts".
- §8: "Robin's attention wins over usage, and usage over wall time". BRIEF gives only "Robin's attention" first.
  (The memory note says that under the throttle, usage per outcome is time, so the second ordering is not obvious.)
- §4.1: "Robin has asked the panel for its views": only in PANEL-BRIEF, not in BRIEF.md (could not verify).
- §6 "Rust ... adopted": BRIEF is "I'm not sure, but I think ... push back". Labelled "lean", which is fair; but
  PANEL-BRIEF lists Rust as "decided".
- Supported: spec-only sign-off, stellwerk shims, one live session, DuckDB first job, hand-then-self, the two
  pre-mortem answers, vendor-reviewer-later, name, both paths scoped, and the status-line quote (verbatim).

**Internal contradictions and stale text.**
1. Header: "six research reports, one spike"; §11 lists eight research files and three spikes.
2. §4.2 gives three fallbacks: "A as the fallback" (decision), "a wrapper that starts a fresh session per step"
   (last fault row), and "Route G ... replaces the fresh-session-per-step wrapper" (bullet). The last two are
   incompatible. O7 says A, then G if mods are withdrawn.
3. §10: "the fallback at most 32" (see correction 5).
4. §1.6 first bullet ("a mod cannot rewind or fork ... a hook can supply the whole transcript") is the route-A
   story; under F the mod resumes an SDK fork. The spike-live report ranks A first, F1 later ranks F first.
5. §4.1: "a change to state leaves the cached prefix intact". Measured on A and B: 36.4k tokens written to the
   cache at every reset, because the hydrated text is a new message. True only on F; wrong for the fallback.
6. Principle 6 and §5.1 ("Robin signs the spec and nothing after it", "only spec changes reach Robin") against
   §5.3 (a harness fault that wrongs a gate result "holds for Robin") and §4.2 ("stops the build with a fault").

## 4. The flow: what werkbank's record supports and contradicts in §5

Supports: tests before code by a separate writer (AgentCoder 61% to 88%, V8.3-SCOPING §1.6, literature); lint
before panels; mutation before the code audit (with the 9 of 27 limit the draft already states); hooks run gates
(a skipped gate at four releases a day); readiness (29 withdrawn); direct edges not closure (closure deadlocked);
per-group not per-finding judging.

Contradicts or complicates:
- **Fix loop frequency.** `spike-exec-findings`: 14 of the 24 test-able real finds "still ended in a spec/plan
  edit". So the §5.3 "code" row (failing test, fix loop) may be minority traffic; the plan and spec rows carry
  most real weight, and those are the prose rows the draft says it will watch.
- **Seams as data.** werkbank's phase-5 `seams` static probe was false-clean while a model found the real seam
  (evidence:132). F-220..223: a cross-unit seam test owned by a later unit failed red on an earlier unit's gate and
  was filed as a finding (evidence:103). §5.1 has the consumer's writer write seam tests before the producer
  exists, and T1 runs "tests of the crate and its dependents": the same red-on-earlier-gate case. The lint of
  producer/consumer declarations is necessary, not sufficient.
- **Stops.** Of 53 stops, about 35 were removable by mechanical rules (T1); 18 needed judgement (cold-check
  contests, co-citation, ruling contests: 3 of 3 contested rulings went to Robin). §8's "no stops after the spec" is
  a target the record only partly supports.
- **Late audit.** 13 of 27 real finds were "too late" (phase-4 classes: unsampled inputs, real-tool
  disagreement). That supports the test audit before code; it also says what the test audit must look for
  (input classes, differential tests), which §5.2 does not name.
- **Never run.** Phases 6 to 10 never ran live under 8.3, and the savings (about $630 vs $929) are replay estimates
  with confounds (evidence:136). §5 inherits that: none of its flow has run on any workload.
- **Audit cost is dominated by rulings, not building**, and §5.3's one-ruling-per-group design is the right
  response, but the draft has no estimate of the number of groups (rate of "rhyme" is only 8-10 of 81 re-finds by
  Jaccard, so grouping may remove less than hoped; duplicates by regex were 21 of 35 rulings).

## 5. The checkpoint files: what werkbank's state-file record says about §4.1

- **Hand-written state breaks.** Segment 14 of stellwerk v4 parked on a TOML escape (`worker\'s`) in `run-state.md`
  (CHANGELOG:2089). The format was TOML and a model wrote it. The draft's remedy (only `lst` writes) is the right
  one; "TOML has no traps" is not the claim to make, since quoting errors were the failure.
- **No slot, no state.** `run-state.md` had no slot for gate state; findings were lost over a reset
  (CHANGELOG:4518). Supports §4.1's "everything a reset must carry has a slot"; the open risk is a slot nobody
  thought of. A lint cannot check for state that has no field.
- **Appended state grows.** The hand-built 8.3 checkpoint grew into appended states and release logs that "had to
  be read and reconciled after every compaction" (evidence:90) until Robin's rewrite-whole rule. Supports
  "state is current state". It does not yet say what bounds the notes files, which are append-and-promote.
- **Versioned and hand-built rows.** Superseding rows were triple-counted; hand-built successor rows dropped 78
  `blast`, 6 `recurrence_of`, 1 `duplicate_of`; open and answered escalations as separate rows overstated idle time
  15x. Supports one-item-per-file overwritten in place, with ids; warns against any "supersedes" field.
- **Resume was the buggiest path** (8 or more releases). §4.1's "state written only at step end" is the right
  shape; S1's random-kill test is the right check. Missing: a per-step intent record so a half-finished step
  can be recognised (the draft leaves this to the orchestrator).
- **Fold in one place.** werkbank's lesson was one fold, one reader. `lst` as the only reader and writer fits.
  Hand-edits and git merges between `lst` runs are not covered by anything stated.
- **Rebuilt-context cost:** F reads the stable part from a warm cache; A and B rewrite about 36k tokens per reset.
