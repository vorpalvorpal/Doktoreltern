# Green Hat / fresh eyes: review of SCOPING-DRAFT.md

Detail, sources and the prior-art table are in `green-hat-appendix.md`; "A5" or "B3" below is a row
there. What I checked myself and what I did not is at the end.

## Verdict

The reset, the files-as-state rule and "a refusal, never a route" are sound and worth building. The
flow in §5 is werkbank's flow with a model in the driver's seat: the same layers, the same seven
roles per unit, the same ordering rules, and it drops three lessons 8.3 had already paid for. I
would build a different flow (a compiled skeleton, then behaviour slices against an end-to-end
test), and build it as a ladder from the smallest loop upward, starting with a baseline run that
the record has never had.

## MUST-fix

**M1. §5.2, §12: weigh the unit of work, and change it. A unit is one behaviour through every
layer, built on a compiled skeleton, not one file.**
- Evidence: every product seam bug in werkbank's record sat between files of one package (B3); the
  ordering rules that layered units need were 11 of 55 patch releases and one barrier bug returned
  three times (B4); every long-run harness in the prior-art search works one feature at a time
  against a running whole, and none has a package layer or per-file units (A5, A6, A21); three
  quarters of multi-agent failures are in design and hand-overs (A12), and the draft has seven
  roles touch each unit.
- In Rust the question is forced anyway: a test of a function that does not exist does not compile,
  so "tests fail for the right reason" (§5.2) needs the signatures first. The draft does not say
  who writes them. Writing them all once, with `todo!()` bodies, is the skeleton.
- Cost: §5 rewritten (appendix C1); `lst` shrinks (no interface declarations or producer check);
  one extra step per build, which I estimate at 300-500k tokens.

**M2. §7, §8: run a baseline before S1, and build the flow as a ladder.**
- Evidence: the record holds no run of the same job without werkbank (B7), so neither of Robin's
  two likely failures can be judged; the only like-for-like figure found anywhere is one case at 22
  times the cost of a plain agent (A6); werkbank added audit steps on belief and removed three on
  measurement (B6); it never ran phases 6 to 10 live (B8); a trial of developer speed measured the
  opposite of what the developers felt (A20).
- Change: before `lst` or the mod exists, run a cut-down DuckDB pipeline with the plainest loop
  (one implementer per slice, gates by hook, diff mutation) and have Robin count defects by hand.
  That count and its token total are the bar. Then each further step in §5 (reviewer, separate test
  writer, test audit, panels) is a `flow.toml` switch that must beat the rung below on the seeded
  fixture of S0-d. Flow C2 in the appendix.
- Cost: one small real job run early; days of throttle, no new code.

**M3. §4.1: a spec item must carry what kind of test it owes, concrete examples, and where it is
silent; and the draft must show one real file.**
- Evidence: 19 or more of 27 real finds were predictable from the kind of requirement, and 8.3
  answered with declared classes: `inputs` owes a property test, `mirrors` owes a differential test
  against the real tool, named failure shapes, lifecycle (B2). The draft's four kinds have none of
  these. Its lint list also omits the orphan check and the lifecycle check 8.3 had settled on (B11).
- The draft gives a directory tree and no file content, so nobody can judge whether a fresh reader
  could work from it. Appendix part D has a candidate item and the checks it allows.
- Cost: half a page in the draft; about five more lint rules.

**M4. Principle 6, §5.1, §5.6: say what happens when the spec is silent, and put examples, not
only prose, in front of Robin.**
- Evidence: 14 of 24 test-able real finds ended in a spec or plan edit, and five cited no clause
  that required the behaviour (B1). Under the draft each is a question that parks a package, which
  contradicts "no stops after the spec" (§8), or the orchestrator decides unrecorded.
- Change: three answers to "does the item require this": required, forbidden, silent. Silent is
  decided by the orchestrator, written on the item as an amendment with the options rejected, and
  listed for Robin at the end; only a contradiction of a signed item stops for him. This matches
  the delegation Robin already gave werkbank. Second, at sign-off Robin marks about ten proposed
  concrete examples right or wrong: the largest measured gain from a human touch in the table (A14,
  B12).
- This challenges a decision the brief lists as Robin's ("spec only"): still one sitting, but what
  he signs changes. Cost: one field, one report section, ten minutes of Robin's time per build.

**M5. §5.1, §12: seam tests must drive the real producer into the real consumer; drop "written by
the consumer before the producer exists".**
- Evidence: the seam tests that missed bugs in werkbank used hand-built values the producer never
  emits (F-149, F-155, F-156; F-397 reached the most expensive audit that way). A test written
  before the producer exists can only do that. The glossary's seam (between packages) excludes every
  seam bug on record (B3).
- Change: under M1 this is the end-to-end test in T1. If the layered flow is kept, adopt 8.3's rule:
  a real-to-real test, red until both sides land, inside a package as well as across. Cost: one
  rule and a gate change.

## SHOULD-fix

1. **Move audit weight from code to design (§5.1, §5.2).** The design panel is werkbank's
   best-measured audit: 15 of 26 visible later defects for 893k tokens (B5). The draft cuts plan
   review to two or three lenses and keeps three levels of code audit. I would reverse the
   proportions: one full review of spec plus skeleton, one reviewer per slice, one whole-tree review
   per five slices.
2. **Give the build an oracle outside its own tests (§6, §8).** A green suite passes a fifth or so
   of wrong code (A17). A compiler build became tractable when a real tool could be compared
   against (A7). For this job the oracle is free: the same transformation as SQL in DuckDB. Make
   `mirrors` items the default for pipeline work.
3. **An evaluator that runs the product (§5.4).** Both Anthropic harness write-ups found that
   driving the running thing caught what readers missed (A5, A6). The end-to-end run is in T3 only;
   it belongs in T1 on a tiny input.
4. **Rank findings before ruling on them (§5.3).** A score raised valid reports from 56% to 86% in
   the study the draft cites (A19); cheaper than grouping by a model.
5. **Lessons as code before notes (§4.1).** werkbank's 8f ruling: a lesson becomes a test or lint
   where it can. Ask that of each note before the orchestrator promotes it.
6. **Vocabulary (§12).** Cargo has its own package, crate and workspace, and §5.4 says "the crate
   is the unit of gating". A new reader meets package, unit, crate, step, level, cut and tier in
   two pages. Use cargo's words for cargo's things and say how a Leitstand unit maps to them.
7. **One line on the built-in Workflow tool (§10).** Claude Code has a script tool that runs
   sub-agents with schema-checked returns and a resume journal: a ready-made inner loop, at the
   price of being a route. The draft's research does not assess it (appendix C3).
8. **A readable spec for the signature (§5.1).** Robin cannot sign forty item files. Render them
   to one document and record the signature as a hash over the items.

## The flow

What I would replace §5 with, in short (full diagram, costs and risks: appendix C1 and C2):

```
spec items + examples ─► Robin signs, marks ~10 examples                    (the one stop)
skeleton: workspace, signatures with todo!(), one red end-to-end test ─► design review
slice k:  tests from items and signatures ─► code ⇄ T0, T1 (with end-to-end) ─► diff mutation
          ─► one reviewer, failing tests back ─► reset          (plan only 2-3 slices ahead)
every ~5 slices and at the end: class pass, long property and differential run, whole review
```

- **Why slices.** B3, B4, A5, A6, A11, A12, as under M1. A data pipeline is a vertical thing by
  nature: file in, rows out.
- **Why a skeleton.** The interfaces become compiler facts in place of TOML declarations checked by
  `lst`. An agent that ignores the plan's file structure (A1, A13) gets a compile error.
- **Why rolling planning.** Plans made up front went stale as the spec was discovered (B1, A1).
- **What it costs.** Larger worker contexts per unit; parallel building mostly given up (worth
  about 6% in the record); a wrong skeleton is expensive, so the one big review sits there.
- **What I keep.** A test writer who sees signatures and not bodies (tested at rung 2, not
  assumed); diff mutation; findings as failing tests; revertible fixes; stopping on no new signal.
- **What would change my mind.** Slice-sized workers leaving more seeded faults than file-sized
  ones at equal tokens; more than about one signature change per slice after slice 3; an end-to-end
  test that cannot be kept to a few minutes; a job with truly independent parts on a machine that
  can build two at once.
- **Small jobs.** Under about ten spec items: spec, skeleton, one slice. The draft has one size.
- If Robin keeps §5's layered shape, M2 to M5 still stand on their own.

## The checkpoint files

- **Can a fresh reader work from them?** Unknown, because no file is shown. werkbank had a test for
  this (V3's "askability": a cold model given only the files must say where the build is, what is
  pending and why X was decided). Make that S1's acceptance check for `lst hydrate`, run on haiku.
- **The split is right** and has precedent: requirement-tracing tools keep one item per file with
  links (part D). The smallest state shown to work over many sessions, a feature list with a pass
  flag (A5), is far smaller than §4.1; each extra file should name the reset it is needed for.
- **Typed code where the thing is code.** Interfaces belong in Rust, not in `plan.toml`. TOML is
  fine for items and state.
- **What prior art adds:** a delta form for spec and plan changes, so a review and a re-hydrate
  handle the change and not the document (OpenSpec); a "silent here" field (spec-kit's marker);
  requirement prose in a fixed sentence pattern that a lint can hold to one behaviour (Kiro);
  examples as data rows, without a step grammar (werkbank's own ruling on Gherkin); rejected
  options kept with a decision; ids that cannot collide across worktrees and a `duplicates` edge for
  findings (beads).
- **Missing mechanical checks:** every item has an example; class obligations met; no orphan item;
  a fingerprint of the item text carried by the tests that cite it, so an amended item marks its
  tests and units suspect by itself (today reopening depends on someone calling `lst issue add`);
  a token budget on each `hydrate` level, which is also what bounds the notes files.
- **What will go wrong over days.** `state.toml` rewritten whole, per package, with parallel units
  in separate worktrees: where does `leitstand/` live, and who merges it? Notes are the one
  append-shaped file and have no bound stated. Promotion and retirement of notes are unchecked
  judgement. On build or buy: build; the part needed is small and beads would churn as skills do.

## Questions the draft does not answer

1. What does the same job cost with no Leitstand at all, and how many defects does Robin find?
2. How many "spec is silent" decisions does a package produce, and who takes them?
3. Who writes the Rust signatures that tests-before-code needs?
4. Which steps in §5.2 would be dropped if they did not pay, and what figure decides?
5. Is there a smaller flow for a small job, and why packages at all for a job that is one pipeline?

## What must survive revision

- State is files, rebuilt word for word, never summarised; "a refusal, never a route".
- Gates by hook, a quiet result, one attestation per tree.
- Findings as failing tests through mechanical intake, routed by target, prose forms counted.
- The honesty of §2 and §10, and the pipeline as an early real job (M2 moves it earlier still).

## What I checked

Read in the primary files: `spike-exec-findings.md`, `seams/00-evidence.md`, V8.3-SCOPING §1, §3.2,
§3.5, §5.3, §12, DECISION-LOG D-047 and D-076, `prior-art-tdd.md`. B7 (no baseline) is an absence
found by search of four documents, not a proof. Prior art came from one sonnet sub-agent (about
103k tokens); rows are marked FETCHED, SNIPPET or KNOWLEDGE and I did not re-read its sources. The
Workflow tool I know only from its reference text in my own session. No spike was run; the token
figures for flow C1 are my estimates.
