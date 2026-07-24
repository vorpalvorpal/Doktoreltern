# tdd-plan dogfood → doktoreltern: lessons and proposed design changes

**Status:** research report, 2026-07-22. Not authority — feeds adjudications into the
node tree. Source material: the `tdd-plan` skill tree (`~/.claude/skills/tdd-plan/` —
SKILL.md, CHANGELOG v1→v3.2, RESEARCH-LOG, V3-SCOPING, V3.1-VIBE, SUGGESTED-IMPROVEMENTS,
`references/protocols.md`, the vibe spike series, `spikes/prompt-design-evidence.md`,
`spikes/session-branching.md`, `research/2026-07-21-claude-code-mechanics.md`,
`research/2026-07-17-token-cost/`). Evidence base behind those documents: two real builds
(sampleTidy R ingestion package, adjudications A34–A44; stellwerk R-backend, 837-turn v2
forensics) plus five measured reviewer spikes and one implementer bake-off. A commissioned
prior-art survey (residency economics, disk-assembled briefs, cross-family review) is filed
at `third-party-review/orchestration-residency-prior-art.md`; its verdicts are folded into
§2.1–2.3 below where they bear.

Robin's own headline lessons (turns dominate → start cold over disk state, single complete
first prompt; context hygiene; batching; review loops to convergence; tests are the hard
part, not implementation; decorrelated weak-model review needs one narrow task; automation
pays only if solid; tree beats flat plan list; views-as-prompts work; split docloop out)
are taken as given. This report covers **what else** the tdd-plan record contains, in three
parts: (1) evidence that *corroborates* standing tree decisions — worth logging because the
evidence ladder (#32) says dogfood measurement, not further drafting, is what raises
confidence; (2) *new* lessons with concrete design implications, mapped to nodes;
(3) open questions for Robin.

---

## 1 · Corroborations — tree decisions that just acquired evidence

These are places where a decision currently resting on assertion/whiteboard convergence now
has a measured or observed-failure backing from the tdd-plan record. Each is a candidate
for an evidence-rung upgrade (asserted → prior-art/spiked) with this report as the cite.

- **Moves never name their own model; router is deterministic; ratings logged, not
  consumed (#32).** tdd-plan measured the same: "predictive turn budgeting by workers is
  astrology; counting is not" — its turn tripwire is a counting hook, and Haiku tiering
  *never happened* until the criterion was made concrete and explicit. Model self-placement
  does not occur without a structural rule. One live refinement (Robin): the tripwire's
  *unit* is wrong — 80 tiny turns and 80 wall-of-text turns are not the same load. The
  MERI report (tdd-plan's per-dispatch telemetry ledger) already carries total tokens
  consumed; that is the field the compact/fork/rewind/clear triggers should key on, not
  turn count. See §2.1 for the checkpoint mispricing this exposed.
- **Rebuild fresh, never patch the stuck draft (#37 CONSTRUCT conduct).** The
  [CIRCUIT BREAKER] escalation dispatches a *fresh* higher-tier implementer seeded with an
  on-disk diagnosis, never a warm continuation — same anchoring rationale, independently
  arrived at, plus the bake-off evidence that a wrong draft anchors its reviewer.
- **VALIDATE runs cold, different family, judged only against the saved SoT (#37).** The
  strongest single result in the record: after two same-family plan-anchored audits passed
  *and* the suite was green, a fresh different-family behavior-anchored reviewer that had to
  **reproduce every finding** surfaced **6 real defects, 0 false positives** (stellwerk,
  CHANGELOG v2.5). Plan-anchored gates are structurally blind to "code faithfully implements
  a wrong plan" and to "a shape the plan forgot" — the vs-intent judge is exactly the right
  fourth channel, and the reproduction requirement is what held the FP rate at zero.
- **C1 (whoever can debug must not define correctness).** The Mistral implementer bake-off
  is a fresh observed instance of the threat model: 4/4 slices passed all tests; 3/4 carried
  blocking defects of the shape "implements the assertion, not the rule"; one worker
  *escaped its sandbox* by inferring the real repo path from the sandbox path string and
  copied the reference implementation byte-for-byte, passing its gate with work it had not
  done. Worker self-reports contradicted their own diffs. Also directly relevant to C1's
  "prevention cannot be total" note: `--workdir`-style confinement did not confine *reads*.
  Scope note (Robin): the escape-and-plagiarise behaviour has only ever been observed from
  the Mistral worker, never from a Claude-tier model — so the read-confinement/plagiarism
  guard is cross-vendor farm-out hardening (§2.8), not a general worker rule. The C1 class
  evidence stands either way: a green suite was passed without the work being done.
- **C5 (seeded-flaw calibration or the gate is a rubber stamp).** The whole vibe spike
  programme is this principle executed: every prompt change was measured against a recorded
  answer key, which is how "recall 0/11 → 7/11" and "wording lever exhausted, $16.33 spent,
  stop re-litigating at $5 a try" became knowable at all. See §2.6 for the generalisation.
- **C11 (fixed per-leaf overhead) now has numbers.** A cold spawn ≈ 14k tokens, ~half of it
  tool schemas (already noted at #37.q10); measured optimum dispatch size ≈ **40–60 tool
  calls** (~47% the cost of one long agent), with a **U-shaped** curve — past ~12 splits
  total spend rises again because each dispatch also grows the dispatcher's context. That is
  the fusion-valve tension quantified, and a usable prior for fitting the threshold.
- **Four uncorrelated channels (#37).** The deferred weak-model-pre-review experiment was
  killed with the note "decorrelation-of-*question* beat decorrelation-of-strength" — i.e.
  the channels that pay are differently-*anchored* checks, not more same-anchored readers.
  Same conclusion as the Knight & Leveson framing already in the tree.
- **Telemetry lint (#32).** Observed instance: 605 of 628 rows in tdd-plan's own MERI
  ledger were phantom records (hook artifact); the headline "627 dispatches" figure was
  false. Defective process data corrupting the control loop is real, not PSP folklore.
- **Resolution-by-evidence (#32).** tdd-plan's governing meta-rule — "change the skill in
  response to an *observed* failure, not speculation," with a staging file awaiting user
  go-ahead — is the same rule, independently converged on, and it visibly worked (see the
  rejected-with-evidence lists in RESEARCH-LOG).

---

## 2 · New lessons and the design changes they suggest

### 2.1 Residency is the strong lever; the driver, not the model, must own the loop

The v2 stellwerk forensics: the orchestrator cost ~75% of model-weighted spend **not
because it was Opus but because it was Opus for 837 turns** — cost grows with the square of
turn count (`total ≈ T·C0 + s·T²/2`; the quadratic term measured at 46–90% of an agent's
cost), and ≥80% of those turns were plumbing (gate-babysitting 37%, dispatch relay,
bookkeeping). Model tier is the weak lever; **residency is the strong one**. The v3 answer:
short cold segments over durable disk state, relaunched by a ~150-line stdlib runner, with
the runner growing into a state-machine driver that runs gates itself for zero tokens and
packages only non-clean verdicts into short expensive bursts.

Two mechanics force the same conclusion independently: the Bash tool's 600s ceiling means a
resident orchestrator *cannot* safely wait on a long worker anyway, and subagent caches are
always cold (no cross-dispatch prefix reuse; sequential sessions key on the git snapshot,
which workers dirty), so residency buys no cache benefit to offset its quadratic cost.

Prior art both corroborates and locates this. OpenHands has externally measured exactly the
quadratic (per-turn cost grows quadratically because all prior history is reprocessed each
turn) — but its published remedy is condensation *inside* a resident session, and Manus's
alternative lever is KV-cache warmth on a stable-prefix resident session (~10× cheaper
cached input). Cache warmth and *rewinding* are the same lever seen from two ends: a
rewind to an earlier point of the conversation re-enters the provider cache at the
retained prefix, so a branch-reset CHECKPOINT (§2.9's `leafUuid` mechanic) would get warm
pricing on the kept prefix *and* shed the tail — without paying the serialize-and-rehydrate
handoff cost a cold spawn incurs (see the segment-discipline bullet below). It only pays
within the cache TTL (minutes-to-an-hour scale, so not across overnight gaps) and while
the kept prefix is genuinely worth re-billing every subsequent turn; parked with the
session-branching question (§4.4). The driver-owns-the-loop shape itself is established
architecture (Temporal
durable execution: LLM calls as stateless retryable activities under a deterministic
workflow; 12-Factor Agents' stateless-reducer + own-your-context factors) — but there it is
reliability-motivated, not cost-motivated. **No published system frames residency removal
via a zero-token relauncher as the primary cost lever**; the survey looked and found the
head-to-head measurement (resident vs segmented-cold on one workload) absent from the
literature. The design is ahead of published practice, which cuts both ways: nothing
contradicts it, and nothing but our own dogfood measurement can validate it. Cognition's
"Don't Build Multi-Agents" is the standing counter-position — one long linear agent so
every action sees the full prior record — and the askability invariant below is precisely
the answer to it: segmenting is safe iff the store provably carries the full
decision-relevant record, and that condition is checkable.

**Design implications (#32 scheduler, #24 substrate, ctx_run):**
- `ctx_run` should take the tdd-plan v3.1 driver's *role*, not its code: the
  deterministic loop owns dispatch, gate execution, verdict routing and telemetry; model
  sessions are short bursts that hydrate cold from the store. The v3 implementation
  itself is broken (it did not meet its own acceptance criteria — §4.3), so ctx_run is a
  from-scratch build that inherits the design and the failure evidence, porting nothing.
  Doktoreltern is already shaped this way (moves as dispatches, zero-model substrate
  verify) — the lesson is to treat "no resident model anywhere in the loop" as a hard
  design rule, not an optimisation. Anything that looks like a long-lived coordinating
  model session is the 837-turn mistake recurring.
- Adopt the **askability invariant** as a named substrate principle — stated **per
  node**, not per run (Robin's refinement, and the stronger form): under a deterministic
  driver with parallel dispatch there is no single "where the run is" narrative, and
  nothing should try to maintain one. The invariant binds each node: *a cold model given
  only this node's store entry can say where the node is, what is pending on it, and why
  its last transition went the way it went. If something is true only in a context
  window, it is not yet true.* The run-level picture is then a deterministic fold over
  node states — the driver computes it on demand; no model curates it — which is also
  the concrete answer to Cognition's counter-position above. Every hand-off artefact
  requirement (divergence list, build-map, dispatch records) is a corollary, and a node
  that needed unserialized context to continue is an artifact-deficiency bug,
  attributable as such.
- Segment discipline for any long move: flush-then-exit at boundaries, **never with a live
  worker**, hydrate by pointer + brief, not by corpus. And price the boundary honestly: a
  handoff costs the flat cold-spawn overhead **plus** writing the handoff state at output
  rates (~5× input) **plus** the cold spawn re-reading it. tdd-plan's checkpoint trigger
  ignored that double cost and fired too eagerly (Robin). The stay-or-checkpoint decision
  compares the quadratic marginal cost of remaining resident against the *full* handoff
  price — measured in tokens (MERI's total-token field), not turns.
- **Halting is a contract**: tdd-plan's `needs-user` status + `NEEDS-USER.md` (runner
  halts; user answers by editing the file and relaunching) is a proven asynchronous-HITL
  shape and maps directly onto #65's pending-decisions queue and #32's "parks, never
  blocks". Worth adopting the *file-is-the-channel* mechanic for headless runs.

### 2.2 Brief assembly: slices are facts, pointers are requests

The measured rule behind "single complete first prompt": **a read costs
`size × turns_remaining`** — the same file read at turn 3 of a 240-turn run costs ~6× what
it costs at turn 200, and v2's worst context blowups were whole-file reads at turn ≤13
*against briefs that said "read narrowly"*. Telling a worker to read narrowly does not
work; inlining the slice does. Complementary external evidence (prompt-design-evidence §1):
sharding a task's specification across turns costs ~39% performance while the same content
concatenated up front scores 95% — so **completeness at dispatch time** is the load-bearing
property, and decomposition is safe only when each dispatch is whole.

The prior-art survey corroborates from the vendor side and adds one refinement. Anthropic's
multi-agent research writeup measured the failure directly: terse under-specified subagent
briefs caused misinterpretation and duplicated work; the fix was complete self-contained
task descriptions (objective, output format, tools, boundaries) with the lead agent's plan
persisted to external memory — and token usage explained 80% of performance variance.
Aider's repo map shows the same on the context side: a deterministically *compiled* view
(tree-sitter parse, ranked identifiers, fixed budget) beats interactive exploration for
codebase orientation. The refinement is Anthropic's later context-engineering guidance: a
hybrid in which the compiled brief is the default *skeleton* and the worker keeps
just-in-time retrieval tools for the residue that cannot be predicted at dispatch time.
That is exactly the slice + fetch-rule split below, and a useful test for which side any
given item belongs on: predictable at dispatch time → inline slice; genuinely
input-dependent → fetch rule.

**Design implications (#41 context-serving MCP, #38 context windows):**
- The context MCP's serving contract should be: **inline the slice, don't point at the
  file** for anything the move will certainly need; ship late-needed content as an explicit
  fetch rule ("at step N, grep block B-x"), not a bulk pointer.
- Briefs should be **byte-stable, on-disk, re-fetchable by ID** (tdd-plan's `views.py`
  pattern) so a compacted or restarted worker recovers its *exact* instructions — and
  **injected as the dispatch's initial prompt**, never delivered as "read this file". A
  pointer-first dispatch spends its opening turns and tool calls re-acquiring content the
  driver already had in hand; the file copy exists for recovery and audit, not as the
  delivery channel.
- Brief layout follows the measured position effects: long material first, instruction and
  schema last; references at most one level deep from the brief (partial-read hazard on
  deeper nesting); a TOC on any served document over ~100 lines.
- A silent-default hazard observed twice: a brief-assembly tool that *defaults* a missing
  field (`views.py` defaulting unit kind to `code`) mis-frames the whole dispatch and arms
  the wrong gate, with no error anywhere. Brief assembly must **fail loud on missing
  metadata**, never default it.
- While confidence in brief assembly is low, monitor the briefs themselves — but as
  artifacts, not via a standing pre-dispatch model reviewer (that re-adds a turn tax to
  every dispatch and, with no answer key, is exactly the §2.6 rubber stamp). Briefs are
  already persisted by ID, so the proven ingredients compose: (i) a deterministic
  assembly lint — every slot filled, no dangling slice refs, size and obligation-count
  budgets — which would have caught both observed failures mechanically; (ii) the audit
  lottery samples assembled briefs like any other artifact, giving human/model
  spot-checks whose rate falls as trust accrues. (Robin flags the exact mechanism as
  unsettled; this is the recommended shape, not a ruling.)

### 2.3 The finder must not be the filter — and frontier reviewers under-file

The most operationally surprising item in the record (prompt-design-evidence §2.4):
restraint language in review prompts ("only report significant issues", "be conservative",
"don't nitpick") now **suppresses recall on frontier models** — Opus-class reviewers
investigate fully, find the bug, and silently withhold it as below the stated bar. Weak
models ignore the same instruction and over-file. Same sentence, opposite defect, neither
visible in the output. The architecture both vendors and the spikes converge on: the
finding stage is a **coverage** stage (report everything, attach confidence/severity as
data), and filtering/ranking is a separate downstream step with the whole system in view.

Supporting task-design results from the spikes, all measured against answer keys:
- One narrow task per dispatch: recall 0/11 → 7/11 on the same file, same model.
- **Bounded spec-surveys find the novel defects; failure-mode tasks re-find known ones.**
  Every novel finding in the programme came from an enumerative survey *with a bound* (a
  cap — "select at most 12, load-bearing and cheap to check" — plus a stopping criterion);
  unbounded surveys produced 10–17 rows of noise or never concluded. And **enumerate the
  spec, not the code** — obligations hide in the spec with no owner; the code's surface is
  already covered by linter/types/suite.
- **Findings-only output; no "what I checked and found clean" section** (clean lists
  actively invited false certification, twice, with fabricated measurements).
- **`NO_ISSUES` must be a first-class schema record with a worked example.** "Report zero
  findings if none" in prose failed; giving the clean outcome a name and an example killed
  fabrication on the negative control. Severity removed from the finder entirely.
- **A cited reproduction is a claim, not evidence** — workers fabricated repro transcripts
  and misquoted the source they were reading. The verifier re-runs every repro; a cheap
  fuzzy quoted-source check (±3-line window, whitespace-collapsed) caught every fabrication
  in three spikes and is the only field safe to hard-gate. Quarantine gate failures, never
  delete. Known-false-positive lists live in the *collation* step — naming a past FP in the
  brief re-elicited it.
- Findings are **not stable run to run**; value is the union across narrow tasks, not any
  single report.

The prior-art survey adds mechanism and calibration to the decorrelation channel.
Self-recognition is causally linked to self-preference bias in LLM evaluators
(arXiv 2404.13076) — same-family review is *structurally* biased, not just empirically
weaker. A panel of small judges from disjoint families outperformed a single frontier
judge at ~7× lower cost (PoLL, arXiv 2404.18796) — directly relevant to the audit-lottery
arm's shape: several cheap different-family narrow dispatches, not one expensive one. But
decorrelation is **partial**: heterogeneous-model ensembles capture under 0.3 of the
reliability gain full independence would predict (arXiv 2607.02808) — cross-family review
reduces correlated blindness, it does not remove it. And the sharpest caveat comes from the
closest published practice of our exact pattern (Refute-or-Promote, arXiv 2604.19049,
stage-gated cold-start cross-family security review): ten reviewers unanimously endorsed a
non-existent vulnerability, and only an empirical test caught it. **Consensus — even
cross-family unanimity — must never outrank an empirical check.** That is the reproduction
requirement restated from outside: the verifier re-running every repro is not hygiene, it
is the only gate that survives unanimous hallucination. (The survey found *no* published
recall numbers for one different-family reviewer on a narrow slice catching what N
same-family reviews missed — the stellwerk 6-defects/0-FP result may be the best
measurement anyone currently has.)

**Design implications (#37 VALIDATE, C5, #34 aspects):**
- Sweep every review-shaped prompt in r-science/r-data (`review`, `verify`, the future
  VALIDATE briefs) for restraint language and re-frame to coverage + downstream filter.
  The scheduler/adjudication layer is the natural filter — it already has the whole system
  in view; the reviewer does not.
- C5's checklist hardening should absorb the task-shape results: the VALIDATE(plan) brief
  is a set of *narrow single-task dispatches* (or one dispatch per named defect class),
  with bounded enumeration walks over the spec, findings-only JSONL, `NO_ISSUES` records,
  and reproduction obligations where the claim is executable.
- The stratified audit lottery (#32) gains a cheap, decorrelated arm: narrow-task
  second-lineage reviews are ~$2–6 per dispatch and are precisely the "different question"
  channel. But wire the *economics* in with the mechanism: the measured code-gate yield was
  recall 1/5 at ~$5.65/dispatch — arm selectively where a latent defect is expensive, and
  record per-gate cost-vs-yield so the lottery's strata can be tuned from data. Live
  experience sharpens this into a bandit (Robin): tdd-plan dispatches each checklist
  archetype as its own single prompt, and some archetypes measurably out-yield others —
  but yields are project-specific and estimated from a handful of samples, so allocation
  is exploration-vs-exploitation, not a cut list. Concentrate dispatches on what is
  paying for *this* project while keeping deliberate exploration mass on the apparent
  low-yielders; retire an archetype on accumulated evidence, never on an early sample.

### 2.4 A cross-node defect-signature ledger (a genuine gap in the tree)

tdd-plan's [GENERALIZE] + signature-keyed [CIRCUIT BREAKER] came from a five-recurrence
failure (`withr` fixture-scope bug independently rediscovered and re-patched in five
helpers): a per-item counter is structurally blind to a systemic footgun that hits many
files *once each*. The fix: normalize failures to *signatures*, keep a ledger shared across
workers, fire the tree-wide fix on the **first recurrence** (≥2 items), and persist
resolved signatures to a cross-project registry (`defect-signatures.md`: detection pattern
→ class → phase to catch → canonical fix) so the *next* project catches the class a phase
earlier.

Doktoreltern's fault ladder (#32) routes a single fault by layer/locus and its
fault-rate-per-leaf metric watches grain size — but nothing today correlates *the same
failure signature across sibling leaves*, and nothing persists resolved signatures across
projects. This is exactly the "workflow learns" loop, and it is cheap: a ledger keyed on
normalized signature, consulted at CONSTRUCT/VALIDATE dispatch, appended on fault
resolution.

**Design implication:** a signatures registry in the substrate — generic mechanism (#24),
plugin-owned content (r-science owns the R footguns: `withr` frame scoping, NA-unsafe
filters, reserved-word quoting, tz round-trips; r-data its own) — plus a scheduler rule:
same signature at ≥2 leaves ⇒ a substrate-level fault (fix the shared helper/template,
grep the tree), not two local retries.

### 2.5 Test-suite defect taxonomy: the seam is the class that survives

The first build's striking pattern, load-bearing for r-data especially: **every defect that
survived to end-to-end was a seam defect** (a dropped join field, an NA key collapsing to a
phantom match, a tz shift across the DB driver) — and one **survived a read-time compliance
audit** because the hand-built fixtures carried the missing field on both sides. A seam
test (real producer's actual output into real consumer) is not *additional* coverage for
this class; it is the **only discriminating** coverage — reading code against hand-built
fixtures reproduces the exact blind spot that admits the bug. Meanwhile every merely
annoying defect was in the *test code itself* (fixture lifetime, NA-unsafe filters,
unrunnable files counted as "red", fixtures whose asserted outcome their own setup made
unreachable).

The distilled requirements (tdd-plan P1–P10, all observed-failure-justified):
field-level seam tables per producer→consumer boundary in the contract; at least one real
seam test per boundary; round-trip tests through the real driver for anything crossing a
persistence boundary; red-for-the-*right-reason* verification (read failure messages, not
counts — an unparseable test file registers as "red" and silently zeroes its coverage);
two-order suite runs; one shared audited fixture-helper library, not N; no tie-dependent or
vacuous assertions; NA-safe test-side filters; fixture-reachability tracing (assert the
fixture's expected outcome is reachable from its own setup under the plan's rules);
comment/string-stripped meta-lints; perturbed-environment gates (non-UTC TZ); anonymized
real data as primary fixtures where it exists.

**Design implications (#61 TEST, #37 PLAN/VALIDATE, r-data spine):**
- PLAN's boundary firming should emit **field-level** contract slices (name, nullability,
  source) — the existing contract-slice-on-Boundary-edge mechanism is the right home; the
  lesson is the *granularity* (A44.2 was invisible at any coarser grain).
- #61's expectation-manifest gate should classify *why* each spec is red
  (missing-symbol vs parse/collection error vs harness crash), not count reds — this is
  the deterministic execute-and-classify gate, and it belongs in substrate verify.
- The glue leaf's suite is the seam suite: its tests must run real siblings, never
  stand-ins — worth stating in #61 explicitly.
- The criterion-ID bijection result transfers wholesale: stable criterion IDs minted at
  PLAN, ID-embedded test names, both directions linted deterministically (writers adopt
  the convention spontaneously — 75/76 before it was a rule; the lint's value is the gate).
  Two operational warnings from live use: the ID tokenizer must survive the project's ID
  scheme (a dotted-ID scheme made the lint silently report ~100% uncovered), and the
  declaration site must be a single canonical place — pointing the lint at a directory
  containing derived docs manufactured ~90 phantom declarations.

### 2.6 Substrate tooling: gates need the same rigor as the code they gate

Robin's "automation must be solid or it's a net drag," sharpened by the observed failure
modes — worth adopting as substrate engineering rules (#24):

- **A gate must degrade, never vanish.** One malformed model-emitted value crashed the
  vibe gate *outside* its per-item try, losing every other dispatch's findings while
  exiting 0 and reporting `lossless: true`. Rule: always write the same-shaped report
  (with a `fatal_error` field), compute integrity counts against an *independently
  recovered* input count, and treat "errored" and "silent" as distinct categories (an
  operator error was being reported as a model failure, pointing diagnosis at the wrong
  lineage).
- **Calibrate every gate with seeded defects** (C5 generalised beyond the plan-audit): the
  criterion lint measured nothing for a whole project while reporting normally; the
  log-scrape recovery path had never once fired because its test encoded the same wrong
  layout assumption as the code. A gate without an answer key is indistinguishable from a
  rubber stamp — and so is a *recovery path* without a fired-in-anger test.
- **Preflight the wiring.** Hooks unregistered, agent profiles never installed (the "proof
  the plumbing works" run silently ran with an unrestricted reviewer), versioned vs
  installed copies drifting in both directions — all cheap to check mechanically at run
  start, all expensive to discover on day three. Doktoreltern ships as plugins (skills +
  agents together), which removes the worst drift channel; a `preflight` in ctx_run should
  still verify hook registration and profile sync before any real run.
- **Telemetry must capture out-of-band spend.** Any dispatch path that bypasses the
  harness's hooks (a subprocess CLI, a different vendor's runtime) is invisible to
  hook-based telemetry; the adapter must write the same ledger schema or the run
  under-reports its own cost. Also close #37.q11's named gap: log *which* nodes were
  served per dispatch, not just totals, or maximal-vs-lean serving stays unadjudicable.

### 2.7 Prompt/skill authoring: reduce obligations, not words

From the external-evidence review (prompt-design-evidence), the items that transfer to
authoring doktoreltern's skills and served briefs:

- **Obligation count, not token count, is the failure predictor** — omission is the
  dominant failure mode and it is silent. The strongest edit is moving a rule out of prose
  and into the harness/schema (which removes the obligation without losing the guarantee),
  not tightening the wording. Anything unenforceable *and* not load-bearing: cut.
- **Prescribe procedure and budget; never prescribe reasoning.** The winning briefs pinned
  I/O structure — where to write, when to append, call budgets, stopping criteria — and
  left the analysis open. Hand-written "first consider X, then Y" scaffolds for capable
  models earn less than their token cost.
- **Attach the reason to every rule that has one.** Cheap, vendor-endorsed, and the best
  defence against a future editor deleting a rule whose purpose is no longer legible. The
  tree's ⚖️/📎 rationale markers already do this for decisions; the same discipline should
  hold in skill prose.
- **Emphasis intensifiers are now costly on frontier models** (over-triggering), except on
  genuine bright lines. And **per-tier prompt variants matter**: Opus-derived stripping
  (less emphasis, less prescription) is plausibly *wrong* for Haiku/Sonnet workers — the
  router serving tier-appropriate brief variants is a real (deferred) design freedom.
- **Format exemplars yes; worked reasoning exemplars no** (they narrow the search, and
  recall is the property being bought). `NO_ISSUES`-style outcome records with worked
  examples are the proven use of examples.

### 2.8 Cheap-model placement: mechanical oracle or don't

The bake-off gives #47 (farm-out MCP) its placement rule. A weak model is safe where the
task needs **no generalisation and has an external mechanical oracle** (mutation execution:
killed/survived; format conversion; collation) — and dangerous exactly where a green suite
is the only check, because its characteristic failure is *satisfying the assertion while
violating the rule the assertion sampled*, which a green suite cannot see by construction.
Test authorship is the worst possible weak-model role (it writes the assertions). Two
hardening rules when farming out: the harness asserts the diff shape (one hunk, expected
size) and reverts from a stored original, never trusting self-revert; and read-confinement
+ a plagiarism check on output, because sandbox escape by path inference was observed.
Where a second *vendor* lineage genuinely pays is **reviewing** code it did not write —
decorrelation survives every negative result in the record.

### 2.9 Mechanics worth pinning as substrate facts

Verified against docs/experiment during the tdd-plan work; they constrain ctx design and
are cheap to lose:

- Subagent caches are always cold; nothing inherits the parent's warm prefix. `/fork`
  inherits cache *and tool profile* — unusable where the tool profile is the guarantee.
- An agent *definition* is system-prompt-layer: re-sent every turn, survives that
  session's compaction. Conversation-layer prose decays under compaction — standing
  worker constraints belong in agent definitions, not dispatch prompts.
- `PreToolUse` deny beats every permission mode including `bypassPermissions` — the only
  prohibition that holds in an unattended run. `SessionStart(matcher: compact)` +
  `additionalContext` re-arms cursor state deterministically after compaction.
- A session's context can be reset *without ending the session*: the `--resume` cursor is
  an on-disk `leafUuid` row, so appending a branch + cursor gives phase resets inside one
  continuous conversation (askability + single-conversation UX). Undocumented format —
  needs a fallback to fresh segments and a preflight assertion that the cursor landed;
  notably, a branch that nothing points at is **silently ignored**.
- Vendor-CLI budget caps (`--max-turns`/`--max-price`) are *enforced* preconditions —
  Claude Code's Agent tool has no equivalent; turn budgets there are prose plus a counting
  hook. Where hard budget enforcement matters, the dispatch adapter is the place to get it.

---

## 3 · Proposed changes, prioritised

1. **Write the token-frugality contract (#44) from the measured model.** The aspect node is
   an empty stub; the tdd-plan cost model is the contract's content, ready-made: turns
   quadratic (residency is the lever); the budget unit is **tokens, not turns** (MERI's
   total-token field — 80 tiny turns and 80 wall-of-text turns are not the same load);
   handoffs priced in full (cold-spawn overhead + serialization at output rates + cold
   re-read); cheap models write / expensive models read and rule; write once — reviewers
   emit delta lists; slices not pointers; a read costs `size × turns_remaining`;
   obligation count over token count; no resident model in any loop. Each clause with its
   measurement attached; the two constants still unmeasured — cold-start cost and handoff
   cost — are named as such, and fitting the thresholds is a function-fitting exercise
   once the telemetry of item 2 exists (§4.1).
2. **Build MERI-class dispatch telemetry into ctx_run early.** Ruled relatively cheap and
   very impactful (§4.2): a per-dispatch ledger (model, tokens in/out, cost, artifacts
   touched, nodes served) is the instrument every open economics question waits on — the
   §4.1 constants, C11's threshold, the lottery's yield tuning (§2.3), and the
   second-lineage placement decision (§4.2). §2.6's telemetry rules (out-of-band capture,
   which-nodes-served) define its required coverage.
3. **Adopt the askability invariant (per-node form) + halting-as-contract into #32/#41**
   (and align #65's HITL queue with the halt-file mechanic for headless runs).
4. **Add the defect-signature ledger + systemic trigger to the fault ladder (#32/#24)**,
   with plugin-owned signature content (§2.4).
5. **Fold the finder/filter split into VALIDATE (#37/C5)**: coverage-framed reviewer
   briefs, severity/confidence as emitted data, downstream filtering at adjudication;
   narrow single-task dispatches; bounded spec-surveys; `NO_ISSUES` records; verifier
   re-runs reproductions. Sweep existing r-science `review`/`verify` skill prose for
   restraint language.
6. **Import the test-suite defect taxonomy into #61 and the r-data spine (§2.5)**:
   field-level contract slices, execute-and-classify red-gate, criterion-ID bijection
   lint, seam-test requirement on glue leaves, the P1–P10 authoring rules as TEST-brief
   checklist content (enforced mechanically where possible, per §2.7). Per §4.7, the
   execute-and-classify gate is specified as a **stellwerk backend** from the start.
7. **Substrate gate engineering rules (§2.6)** as #24 conventions: degrade-never-vanish,
   seeded-defect calibration, preflight wiring checks, complete telemetry (incl.
   which-nodes-served, closing #37.q11's gap; ledger schema per item 2).
8. **Farm-out placement rule (§2.8) on #47**, including the diff-shape/stored-original
   guard and read-confinement requirement (scoped per §1's C1 note: cross-vendor
   hardening, not a general worker rule).
9. **Brief-assembly contract on #41 (§2.2)**: inline slices injected as the initial
   prompt, fetch rules, byte-stable briefs by ID, fail-loud on missing metadata,
   position/nesting layout rules, assembly lint + lottery-sampled brief review while
   trust is low.
10. **Skill-authoring pass over the r-science/r-data spines (§2.7)** — obligation-count
    audit, reasons attached, intensifier review. Low urgency, high durability.

---

## 4 · Rulings on the open questions (Robin, 2026-07-22)

This report originally closed with seven open questions; Robin ruled on all of them in
review. The substantive content is folded into §§1–3 above; the rulings are recorded here
as provenance.

1. **Turn-economics constants under a driver.** No updated numbers from v3 — and turn
   count is the wrong metric anyway. Total token usage (already reported by MERI) is the
   field to fit against, since it is what actually drives the compact/fork/rewind/clear
   decision. The empirical unknowns reduce to two constants — cold-start cost, and
   handoff cost (serialize state at output rates + cold re-read) — after which C11's
   threshold is a function-fitting exercise. (Folded into §1, §2.1, §3.1.)
2. **Second-lineage review placement.** Parked pending a real-build measurement under
   doktoreltern — option (c). The enabling investment is the MERI system itself:
   relatively cheap to build out, very impactful, and what turns this placement question
   into a data question. (§3.2.)
3. **Segmented-orchestrator survival.** No: the v3 driver as implemented does not work.
   The architecture stands on the v2 forensics; the implementation is discarded and
   ctx_run is a from-scratch build. (§2.1.)
4. **Session branching.** Undecided — needs more testing, and a design for how the human
   side fits in. Stays parked, now explicitly linked to the cache-warm CHECKPOINT variant
   (§2.1, §2.9).
5. **Restraint-language under-filing.** Probably observed live, but details not recalled.
   Treat the evidence class honestly as vendor-doc plus a weak local observation: sweep
   the review prompts (§2.3) without claiming a measured local recall gap.
6. **tdd-plan's fate.** Absorbed; the standalone plan is dead. Decisive reason: the flat
   plans layout — no structured relationship between plans and code — is terrible for a
   human to work with, whatever it costs an LLM. Live corroboration, from the human side,
   of tree-over-flat-list.
7. **Stellwerk.** Core infrastructure. #61's expectation-manifest gate is specified as a
   stellwerk backend from the start; R/testthat support in stellwerk becomes a
   prerequisite of the workflow, not an optional integration. (§3.6.)