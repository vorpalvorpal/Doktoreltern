# Ruling sprawl: what happened in sampleTidy, what werkbank tried, what to do in v2

Read-only research, 2026-10-06. "(inferred)" marks anything I judged rather than read or counted. Paths: SP = /Users/rjs/dev/sampleTidy/dev/plans, WB = /Users/rjs/dev/werkbank, ST = /Users/rjs/dev/stellwerk.

## Part 1. Anatomy of the sprawl in sampleTidy

### What each document is for and how it grew

- SP/CONTRACT.md (59,508 bytes, 872 lines now) was meant to be a one-page "CONTRACT digest": file layout (lines 12-45), pinned public API (47-132), conventions (134-158), the live DB schema (160-220), then the "Adjudicated decisions (A-log; do not re-litigate)" (222-824), gates and build order. Its header says "Single source of truth for module APIs, layout, conventions, and adjudicated decisions" (line 7) and that workers read "this file + their own plan only".
- Growth, from git (`git show <commit>:path | wc -c`): 24.8 KB on 2026-07-15 (day 1), 29.7 KB on 07-16, 51 KB on 07-22, 57 KB on 07-28, 104 KB on 08-02, 114 KB (1,663 lines) on 08-08. 58 commits over 25 days. Over its life it gained 1,810 lines and lost 938, but 822 of those lost lines are one move (commit 8364de2, 2026-08-09). Without the move: about 1,780 added, 116 deleted, so 94% of edits were additions.
- SP/OPERATING-RULES.md (58,594 bytes, 858 lines) did not grow on its own. 8364de2 cut rulings A73 to A86 out of CONTRACT (823 of 1,663 lines) and pasted them here. Its commit message says "Half the build contract was live ACIRL/migration policy filed as footnotes to a document about something else". It has 14 headline rulings in 56 KB, so about 4 KB per ruling. A79 alone is 9.3 KB, A80 7.6 KB, A75 6.9 KB.
- Together: 118 KB of ruling prose. The A-log region measured by script is 98.8 KB across 83 ids (42.7 KB in CONTRACT, 56.1 KB in OPERATING-RULES).
- Neighbours (sizes from `wc -c`): PLAN-CHANGE-REQUESTS.md 67 KB (declared "Append-only log of ambiguities", line 3); CONTRACT-STAGE-OBLIGATIONS.md 17 KB (a mechanical extract of A48 onward, "DERIVED, do not hand-edit", so a copy of a copy); AUDIT-ADJUDICATION-2026-07-23.md 7 KB (21 accepted findings, each with "how I confirmed it"); RULINGS-2026-07-23-alias-self-precedence.md 5.8 KB (rulings R1, R1a, R4... a second, separate numbering scheme); PARKED-QUESTIONS.md 5 KB (all five resolved by 07-15, kept anyway); COVERAGE-MAP 62 KB, FIXTURES 21 KB; sixteen PLAN-NN files 0.5 MB, with PLAN-15 at 193 KB and PLAN-11 at 97 KB. dev/plans is 840 KB in total. dev/tdd-run is 6.4 MB, and its run-state.md alone is 659 KB.
- Three overlapping systems of record is how the 8364de2 message describes it: "plans, the CONTRACT A-log, scratchpad checkpoints ... the authoritative one was the untracked, stale one".

### Classification of the numbered rulings

I read all of A1-A72 in CONTRACT and A73-A86 in OPERATING-RULES (A59-A61 are not in either file: CONTRACT:644 says they are "reserved for PLAN-12"). That is 83 ids, one label each, by my own reading. I did not use a sub-agent. "Encoded in code and tests" is my judgement helped by grep: code cites 55 distinct A-ids and tests 59 (loose; `\bA<n>\b` also matches unrelated text). It is not a per-ruling proof (inferred). Bytes are measured by script per entry.

| class | count | bytes | share of 98.8 KB |
|---|---|---|---|
| (a) behaviour, encoded in code/tests, prose redundant | 43 | 58.5 KB | 59% |
| (b) behaviour NOT checkable from code, prose is the only record | 5 | 5.9 KB | 6% |
| (c) process/operating rule for agents | 6 | 3.2 KB | 3% |
| (d) superseded, amended or contradicted | 14 | 15.2 KB | 15% |
| (e) rationale, bug history, or a closed investigation only | 12 | 13.5 KB | 14% |
| (f) restatement or near-duplicate | 2 | 1.3 KB | 1% |
| (g) open or parked question | 1 | 1.2 KB | 1% |

Examples (line numbers are in the file named):
- (a) A30, CONTRACT:338: "`change_log.at` must be quoted as `"at"` in all SQL - `AT` is a DuckDB reserved word". A26, CONTRACT:325: pH is a dimensionless identity in `unify_value()`. A86 and A85 (units rules) are the same kind. These are checkable by one test each. The prose adds only the "why".
- (b) A64, CONTRACT:706: "`lab_method.reported_as` is NOT dead ... **Do not drop this column.**" Nothing in code stops a future drop. A78 and A81 (OPERATING-RULES:238-306, 562-568) are "answer sheets" for alias confirmations such as `B.EO1` to `B.E01`. The answers live in the live registry, so the prose is the evidence record. A55, CONTRACT:635: an LLM-driven UI "never confirms on its own" is a policy that no test can see (inferred).
- (c) A71, CONTRACT:803: "Tooling latitude ... Where the tdd-plan skill asks for stellwerk, it may be skipped". A67, CONTRACT:737: "Quote the absolute path with any measurement". A52 (file ownership between plans). Also OPERATING-RULES:11-13, "A-numbers are decisions. They are NOT agent numbers."
- (d) A10, CONTRACT:249: "*(REVERSED by A73, 2026-08-01 - read A73 instead.)*". A51, CONTRACT:612: "*(SUPERSEDED by A63 ...)*". A74, OPERATING-RULES:45: "WITHDRAWN by A79 ... do not implement", yet the original ruling "and its measurements follow" for 40 more lines. Also A6/A54, A7/A50, A11/A62, A13/A70, A22/A56, A27/A35, A66/D10, A75/A79. The files have 24 lines carrying such markers (grep).
- (e) A41, CONTRACT:454: how a `withr::local_tempdir()` default argument deleted its own directory in three test helpers (a bug story). A49, CONTRACT:603: "DuckDB 1.4.1 cannot drop a constraint at all". A69(c), CONTRACT:771: a closed investigation of 12 `Ammonia as NH3` rows concluding "no action". A29 (open items resolved), A38-A40, A43, A44, A46, A47 are of the same type.
- (f) A42, CONTRACT:471: "the identical A40 bug" (same unquoted `at`, a second test file). A33, CONTRACT:352, re-states A17 (CONTRACT:290: adapter registration) with the file name changed.
- (g) A37, CONTRACT:402-417: "SpreadsheetML parsing is PARKED post-MVP". Outside the numbering there is also "OPEN, NOT ACTED ON: four Aroclor labels resolve to single PCB CONGENERS ... Needs a ruling" near the end of OPERATING-RULES, with no id.

Caveat: entries are mixed. A79 is class (a) by its decision lines but also carries two amendments, a TSS investigation and a measured "nothing to repair" report (OPERATING-RULES:335-445). One label per entry understates how much of the bytes are rationale. Within class (a), my estimate is that 60-75% of the bytes are measurement narrative, not the decision (inferred, from reading A75, A79, A80, A82, A83).

### How much is live

Method: take class (b) and (c, if still in force: A67 and a few lines) as live, since they are the only record. Take the one-to-three-sentence decision statement from each class-(a) entry as live orientation, estimated at 25-30% of the bytes. Take the surviving side of each (d) pair as already counted in (a). Treat (e), (f), the dead sides of (d) and measurement narrative as history. Then add the sections that are not rulings: API, conventions, layout, schema, gates (about 9 KB of CONTRACT outside the A-log, plus the 44 KB schema-and-API area is reference material).

Result: about 25% (roughly 30 KB of 118 KB) is something a builder might need today. About 75% is history, measurement narrative or restatement. The error bars are wide (plus or minus 10 points; inferred), but the direction is not in doubt. The author drew the same conclusion: CONTRACT.md's line 3 now reads "FROZEN ... this is the BUILD contract and it is history", and all sixteen plans carry "CLOSED" status lines.

### References between entries, and to code

- By id and by prose, never by anchor. CONTRACT's A-log has 124 A-to-A mentions, OPERATING-RULES 66 (grep count, inflated by self-mentions). Chains are common: "A6 *(amended by A54 - read A54 with this.)*", "A22 ... the 'reconcile folds them' half was never assigned to a plan and nothing did it until A56/R-11.14".
- Code and tests cite rulings heavily: 266 mentions of A-ids in R/ (55 distinct), 344 in tests (59 distinct), plus 118 and 184 distinct R-x.y plan criteria. Test names often begin with the id ("A87: `-` and `_` become the dimensionless unit `1`", tests/testthat/test-adapter-acirl.R:145). So ids are load-bearing.
- Dangling ids: A59 and A60 are cited in code and tests but defined only in PLAN-12. A87 is cited by four tests (test-adapter-acirl.R:145-179) and defined in neither document (the last id is A86). OPERATING-RULES:7-9 says numbering is kept continuous "so every existing citation still resolves", and in the same breath concedes the numbers are a citation scheme (inferred: a rename would break 600+ comments).
- File paths hold up: all 40 backtick-quoted `R/`, `tests/`, `dev/` paths in the two documents exist (checked with `test -e`). The 12 `scratchpad/...` evidence scripts cited exist on disk (one citation is a truncated glob `a79_`). Whether they are tracked: git tracks only 31 of 613 scratchpad files, so most evidence scripts are untracked (the 31 may or may not include the 11; not checked).
- Stale in place instead of fixed: A13's claim about the archive layout is struck through and then contradicted by A70 (CONTRACT:262-268, 786-801). A67's three "false CONTRACT corrections" were "reverted" in prose rather than deleted. The record of the correction costs more than the correction.

### What a fresh agent needs to add a lab adapter

Needed from the two documents (my selection, measured in bytes): conventions 1.6 KB; the pinned API block 5.1 KB; rulings A3, A4, A9, A15, A17, A25, A26, A27, A32, A33, A34, A35, A57, A85, A86 = 9.3 KB. Total about 16 KB (14% of 118 KB), of which about 6 KB is decisions and 7 KB is convention/API that belongs in the spec. On top of that it needs the code seams: R/adapter-registry.R (3.3 KB), R/ir.R (7.5 KB) and one example adapter (esdat 13.8 KB). Also PLAN-03 and PLAN-04 (8 KB each) in the worker model. For an ACIRL-like lab, add A73-A83 (about 45 KB), which is exactly the part that is not reusable outside ACIRL.

## Part 2. What werkbank tried, and whether it held

Sizes now: WB/CHANGELOG.md 394,014 bytes, 5,270 lines, 125 sections, 135 commits since 2026-07-16 (131 KB on 08-15, 179 KB on 09-01, 253 KB on 09-15, 347 KB on 09-25, 365 KB on 10-01). WB/DECISION-LOG.md 233,754 bytes, 2,942 lines, 77 entries in 17 days since 2026-09-19 (133 KB by 09-25, 160 KB by 10-01), 81 commits. WB/V8.3-SCOPING.md 103 KB; V8-SCOPING.md 41 KB. Both logs are in tension with Robin's rule that decisions go "directly into the plan/spec so that we only have a single current state". DECISION-LOG's own header says "Nothing here is a werkbank ruling ... Newest last" (so, an append-only log by design), and each entry runs about 3 KB with questions asked, options, reasoning and what would reverse it.

Mechanisms, in the order they appeared:

1. The CONTRACT digest (WB/references/phase2.md:60-62). Intent: one page of pinned APIs, layout, conventions, gates and "adjudicated decisions", read by every worker by pointer. It held in neither project. sampleTidy's reached 114 KB. stellwerk's `plans/CONTRACT.md` is 229,944 bytes, 2,814 lines, 65 commits (105 KB on 08-01, 172 KB 08-15, 219 KB 09-15; though I did not classify its contents, part of it is frozen contracts, not rulings). Note the instruction itself puts "adjudicated decisions" into the digest, so the skill seeded the A-log.
2. `decisions.md` as the "archive" for resolved adjudications and ruled-out false positives, with `run-state.md` capped at a 200-line ceiling (phase2.md:68-72). Intent: stop run-state absorbing history ("1,024 lines re-read on every segment"). Effect: moved the sprawl, did not stop it. ST/dev/tdd-run/decisions.md is 111 KB (1,289 lines); sampleTidy's older run-state.md is 659 KB.
3. The `spec/` tree (WB/references/spec.md, added 2026-08-09, v4 wave 2a). Intent: clause = stable id + one normative sentence + provenance; plans are thin work orders; amendments gated by `sweep-superseded.py` and a bijection lint; spec by surface, not by wave. The motive is explicit: "the de-facto spec became a 2,237-line `plans/CONTRACT.md` because plans could not hold the role". Partly held: stellwerk's `spec/` is 203 KB across 14 files, none over 33 KB. But stellwerk's `plans/CONTRACT.md` roughly doubled (105 to 230 KB) after the tree was introduced (08-09), so the spec tree did not stop the digest growing.
4. Ledgers and `<!-- prov: A-nnn -->` keys (WB/V8-SCOPING.md D7, D31, D43, 2026-09-03). D31: "Plans carry keys; ledgers carry history. Provenance in a plan is a single `<!-- prov: A-nnn -->` key pointing at the adjudication row. Dead text is deleted from the plan and preserved in the ruling row's before/after". This is the nearest match to Robin's goal. Evidence: ST/dev/tdd-run/v4/ledgers/adjudications.jsonl has 376 rows and 2.2 MB (about 5.9 KB per row, because `before`/`after` text is stored); findings.jsonl 1.5 MB (720 rows); escalations 284 KB. Only 78 `prov:` keys appear in spec/ and plans/ (42 in spec/). So the plans stay clean: history moved out of them into machine ledgers. That works as containment, but the volume moved rather than fell, and a dead-ends or size budget does not exist. Whether anyone can navigate 2.2 MB of rulings: no one reads it, which is the point, but stale entries are never pruned either (inferred).
5. Rendered views with a size ceiling (D20, D43; ST/dev/tdd-run/v4/views/decisions.md is still 123 KB, 1,717 lines), and one-ledger-per-kind. Intent: each reader sees a bounded view. The view itself is unbounded in practice.
6. Mechanical checks (`plan-lint --decisions`, `sweep-superseded.py`, bijection lint, "ruling application routes by artefact ownership", D34). They detect dangling ids and unswept phrasing. None limits size or forces deletion.
7. WB/DELETIONS.md (17 KB) and SUGGESTED-IMPROVEMENTS.md (9.6 KB) track deletions of werkbank's own machinery. They are a symptom of the same append habit applied to werkbank itself.

Verdict (inferred from sizes above): werkbank moved ruling prose from plan documents into ledgers and logs, and made plans carry keys. It did not remove the cause. Nothing sets a size budget, nothing forces a ruling to become a check and then be deleted, and werkbank's own DECISION-LOG and CHANGELOG (628 KB together) grow by the same pattern. sampleTidy was built before most of this, so I have no werkbank-8.3-built project to measure; stellwerk's v4 run is the closest.

## Part 3. Root causes, ranked by how much of the sprawl each explains

Ranking is my judgement (inferred) from the byte split in Part 1 and the evidence cited.

1. Additive-only editing, with no prune step and no owner (largest, explains most of the 94% additive diffs and the whole 114 KB peak). Each audit round or user ruling appended a new A-entry rather than editing the item it ruled on. The header "do not re-litigate" and the rule "tests win pending orchestrator adjudication" (CONTRACT:9) make adding the safe move. The cleanup happened once, by hand, after 25 days (8364de2: "The plans were not disordered - they were finished, and nothing said so"). Nobody owned pruning.
2. Rationale and measurement had no other home (explains most of the bytes inside class (a) and all of class (e): about 35-45% of all bytes, inferred). The 4 KB-per-ruling in OPERATING-RULES is mostly "measured, not argued" narrative: counts, scripts, backups, "Implementation notes added 2026-08-02". Agents were asked to measure twice and show it; the ruling was the only durable place to put the result. Same in werkbank (D-001: Problem, Questions asked, Options, Reasoning, Decision, Would reverse it; about 3 KB each).
3. The thing being ruled on lives somewhere frozen or owned by someone else, so a ruling amends by reference (explains class (d), 15% of bytes, and most of the 190 cross-references). Plans were owned by workers ("ownership partition", CONTRACT:12), the digest was the only shared file, and spec items had no slot for exceptions. So the ruling "A62 refines A11" is a new entry beside A11, not an edit to A11.
4. Ids needed for citation (explains why entries cannot be deleted even when they are dead: 266 + 344 citations plus commit messages). OPERATING-RULES:7-9 keeps "A79" alive for exactly this reason. This cause locks in causes 1 and 3.
5. Deleting feels unsafe because an audit may reopen the question (explains the retained corpses: A74's whole original text kept after withdrawal, A13's struck-through claim, A69(c)'s closed analysis, PARKED-QUESTIONS kept after "all five resolved"). Effect size: 10-15% of bytes (inferred).
6. Agents are told to cite authority and to flag decisions for Robin "to overrule" (about 5%): rulings carry "(Claude, 2026-08-02, ... flagged here for Robin)" at OPERATING-RULES:335, 535. Open questions and decided questions share a file, so neither can be pruned.
7. The skill told workers to put decisions in the digest (WB/references/phase2.md:60-62). This is a design cause under 1 and 3, and cheap to fix.

## Part 4. Design options against it

| option | cause removed | risk |
|---|---|---|
| A. A ruling is an edit to the item it rules on and has no entry of its own | 1, 3 | the item grows exceptions; needs a slot for them (see C) and audit trail lives only in git |
| B. A ruling that fixes behaviour must become an example row or a check, and the prose is deleted once the check exists | 1, 2, 5 | needs a lint that can tell "check exists"; some rulings cannot be checked (class (b)); weak checks give false comfort |
| C. Rationale only in the commit message of the edit | 2 | commit messages are hard to find from the item; a tooling aid (`git log -S`, item-to-commit link) is needed |
| D. Size budgets per item and in total, enforced by lint | 1, 2 | agents pad to the cap or split items; the cap needs a "must delete before adding" rule to bite |
| E. A capped "dead ends" list so a ruled-out mistake stays ruled out | 5 (replaces the instinct to keep corpses) | the cap forces choices about what to forget; a list that is too short re-opens old mistakes |
| F. Agent operating rules in one small fixed file, apart from product decisions | 6, part of 3 | the file tends to grow, so it needs its own cap; the split is fuzzy for rules like A71 |
| G. Supersession by deletion with git as history | 1, 3, 5 | requires that nothing cites a deleted id (see H) |
| H. Ids on items only, never on rulings | 4 | code and tests cite item ids, which must therefore stay stable; renames need a redirect list |

Recommended combination: A + B + C + G + H as the core, with D and F as the guard rails, and E as a small pressure valve.
- A + G + H together mean there is no such thing as a ruling document. A decision is a diff to a spec item; the item has a stable id; superseded text is deleted; git (with the commit message from C) is the audit trail. This removes causes 1, 3 and 4 at once. Code and tests cite the item id, and the item stays alive and current.
- B removes class (a), which was 59% of the bytes: where a ruling can be a test or an example row, it is, and the sentence goes. The residue (class (b)) stays as a one-line item with a tag saying why no check is possible, and that tag is itself counted against a budget.
- D (per-item cap such as 600 characters, total cap as a number checked in CI) turns "nobody owns pruning" into a failing build. F keeps class (c) in about 3 KB.
- E holds A-class items such as A49 ("DuckDB cannot drop a constraint") or A64's "do not drop this column" as at most ten one-line "dead ends" in a fixed file, so ruled-out ideas stay ruled out without a ruling log.
- Do not carry werkbank's ledger idea (D31) forward as a place for prose. A ledger of rulings is a log by another name and reached 2.2 MB in stellwerk.

What this would have done to sampleTidy (inferred estimate): class (a) 43 entries become example rows or tests at about 300 characters each, about 13 KB, with most already existing as tests. Class (b) 5 entries at about 600 characters, 3 KB. Class (c) 6 entries become the fixed operating-rules file, about 2.5 KB. Class (d) 14 and class (f) 2 vanish; only the surviving side counts (already in (a)). Class (e) 12 vanish into commit messages, except perhaps 8 dead-ends lines, 1.5 KB. Class (g) one line. Add the non-ruling parts that stay (API, conventions, layout, schema, gates), about 9 KB. Total about 29 KB, against 118 KB now: roughly a 75% reduction, in one spec plus one small rules file, not two 59 KB documents. A fresh adapter agent would then read about 10-12 KB (spec items for conventions, adapter seam and the 15 relevant items) instead of the 16 KB it needs now, and would not pass through any of the 100 KB it should ignore.

Open points for the design (not settled by this research): what mechanism refuses a ruling that has no check and no budget left, and who sets the total cap; how item ids survive splits and merges; and whether audit findings that are rejected need a place at all (the dead-ends list is my only proposal). I did not test any of this on a real build.
