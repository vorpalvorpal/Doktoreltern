# Move: PLAN — draft v0 (for hash-out)

> The **second** move in the per-node loop **design → plan → (construct) → validate**.
> Builds on the converged **DESIGN** spec (archived alongside as `design.md`): the move-outcome seam, boundary-at-interface, child-free DESIGN, the per-decision difficulty rating, seal-conditioning, the warm-fork tree.
> docloop format: comments are `:mark` / `:::mark` directive anchors; their threads live in the `threads/<id>/` sidecar store.

---

## What it is

**"The direction is right — now, how do we build it correctly?"**

PLAN is the **convergent** counterpart to DESIGN's divergence. It takes DESIGN's output — a direction, a boundary at interface fidelity, a confidence, the logged alternatives — and makes the node **buildable**: it **decomposes** the work, **firms the boundary** from interface toward mock, and **specifies the behaviour and its correctness basis** precisely enough that CONSTRUCT can build it and VALIDATE can check it. It is where the tree grows: **PLAN creates children; DESIGN never does.**

A PLAN ends one of two ways — the **fission line**:

- **Build** — small, cohesive → no children; hand a staged, criteria-backed plan straight to CONSTRUCT.

- **Fission** — too big, or several separable concerns → spawn **child nodes**, each a stub that runs its own design → plan → construct → validate.

The decomposition itself **is design** (which pieces exist, where each boundary falls) — so PLAN is seal-conditioned, not a mechanical split. It also inherits DESIGN's **anti-sycophancy**: making the direction concrete is the sharpest test of whether it was actually right. If the plan exposes a flaw in the *direction*, PLAN does **not** force a plan around it — it kicks back to DESIGN (`re-diverge`).

PLAN forks from DESIGN **warm** by default — inheriting not just the summary but the raw divergence, i.e. *why* the direction is what it is, which PLAN (elaborating it, not re-litigating it) genuinely wants. Cold-spawn from the summary alone is the exception where deferred deepening means the warm context is already evicted (acceptable only because the summary is a real SoT). Warm stays the default.

---

## The pipeline

```
decompose → firm-boundary → specify-behaviour → summarise
```

The **intensity** and **model / effort** dials are exactly DESIGN's (see `design.md` → *The pipeline* box): the per-decision difficulty rating routes model/effort, size routes to decomposition — which here is PLAN's whole job — and intensity stays deterministic and cache-safe. **Each move rates the work it hands forward:** DESIGN's outcome-rating resourced this PLAN; the per-child ratings PLAN emits resource each child's next dispatch — a stub child's DESIGN, a leaf's CONSTRUCT, and the judge tier of its VALIDATE.

**0 · (no reconcile step — inputs are current by construction).** PLAN does **not** detect or absorb upstream drift; there is no triviality filter. Staleness is the **scheduler's** job: before it dispatches PLAN(N) it checks N's inputs, and if a premise moved it re-runs DESIGN first — deterministic, keyed on the changed input — so PLAN is handed a **current** design and has nothing to reconcile. Whether a moved premise even *matters* to N is then DESIGN's judgement on re-entry (the divergent move), not a check PLAN runs. Whether that re-entry is warm or cold is likewise the scheduler's deterministic call, keyed on the cause: refining N's *own* answered question → warm; a premise moved under it → cold (the re-entry policy lives in `design.md`). The **only** PLAN→DESIGN path is the reverse, convergence-discovered one — `re-diverge`, when making the direction concrete *exposes a flaw in it* (§*What it is*): not a pre-check, but the convergent move stress-testing the divergent one, which the scheduler cannot detect in advance.

**1 · decompose (structure)** — the core. Break the direction into work, **decompose-first**: prefer **in-node sub-stages** (recursive, no new issue) and split off a **child node** only when a **fission trigger** fires (below). Inherited rule of thumb: anything that must persist across a context-window boundary earns an issue; in-window subtasks don't. Stages are ordered and each marked **independent** (safe to parallelise) or **sequential** — that is what the scheduler walks. Granularity follows the **difficulty rating**, never a target count. Children are born as **stubs** by default (open, low confidence, interface-fidelity target) — or directly as a build-ready leaf-plan when PLAN can already see the child is a true leaf (see *Move-outcome*).

**Fission triggers** — spawn a child (rather than keep an in-node sub-stage) when any holds:

1. **independent validation cohesion** — a correctness story you would validate on its own. Cash it out by the **apparatus** a check needs: cluster criteria by the oracle / fixture / dataset they share — a cluster that needs validation machinery nothing else in the node would need earns its own node; criteria that fold into the parent's existing oracle stay in-node sub-stages. Overlapping criteria co-locate by construction, unrelated ones split off.
2. **aspect** — either all of a node carries an aspect or none of it does; an aspect that applies to only part of a node splits that part off.
3. **load-bearingness** — a load-bearing piece earns a node separate from nice-to-have things. A call by the model, not a centrality calculation, since at creation time centrality isn't deterministically computable.
4. **level** — all parts of a node sit at the same level: none is part implementation-ready and part still-decomposing. If it is implementation-ready it has no children.
5. **leaf-too-big** — the leaf's build brief would exceed what a weaker model can implement in one CONSTRUCT pass without judgement calls (ties to the leaf-detail bar). Operationally: if the brief holds independent behaviours that would each need their own debug cycle it is too big → split; one behaviour with sub-stages is a leaf. A model judgement, not a line count — expect to recalibrate against reality.

**The glue leaf.** Fission leaves the composition itself — wiring the children behind N's boundary — as real, debuggable work, and no internal node ever builds (CONSTRUCT is leaf-only — `construct.md`): so whenever the composition is non-trivial, PLAN creates one more child for it, the **glue leaf**, marked sequential after its siblings. It inherits N's boundary **mock** as its starting artefact (the mock belongs to N while N is a leaf; on fission it passes down — a floor-pass stub-PLAN creates the glue leaf too, since that is where N's mock lives once children exist), owns any behaviour that only exists at the composition level, and takes the **executable subset of N's acceptance requirements** as its `✅ v` — integration tests, written like any leaf suite, red against sibling mocks for the right reason until the siblings are real. It earns its node honestly: integration is its own correctness story with its own apparatus (trigger 1). A pure grouping node has no glue leaf and nothing to build.

**2 · firm the boundary** — in two fidelity steps. First to **interface** (structural — each child's signature and shape); this precedes specify-behaviour, since behaviour is stated *per component*, so the components must exist first. Then, once behaviour is known, toward **mock**: a *runnable stub* per boundary that returns a plausibly-shaped value, wired end-to-end so the walking skeleton actually executes — wired but still wrong. **PLAN writes this stub itself** — firming a boundary *to mock* and dropping the runnable stub are the same act — and this does not break the planner/implementer split, because a stub has **no debug cycle**: it trivially passes, so there is nothing to *get working* and no goalposts to move. Real implementations, which *do* debug, stay in CONSTRUCT, held to PLAN's pre-committed criteria. Past interface, a change to a *sibling-visible* boundary is a **cross-node event** (cascade / restructure), not a free edit.

**3 · specify behaviour + correctness basis** — the **construct-readiness gate**. States, per component, the observable **behaviours** and the **correctness basis** for each — the *actual material*, not a pointer:

- **analytic** (the governing equation + constants), **invariant / conservation** (probabilities sum to 1, monotonicity, symmetry), **reference** (paper + DOI + table/figure, or a trusted dataset), **round-trip** (`decode(encode(x)) == x`);

- **edge cases** (`NA`/`Inf`, empty, degenerate) with the documented behaviour for each; **error conditions** with their **classed** condition.

PLAN writes full test suites for the implementation leaves - assertions, tolerances, oracles and seeds. Whoever can enter a debug cycle must not get to decide what "correct" means (t13). (Proposal, from the VALIDATE hash-out: a small **held-out slice** of each leaf suite — committed and hashed but never served to CONSTRUCT — gives verify a hard-coding trap; see `validate.md`.)

The **form** of `✅ v` tracks altitude: at a **leaf** (which gets built) it is the **executable tests PLAN writes here**, which CONSTRUCT and VALIDATE run; at an **internal node** (which only splits) it is **acceptance requirements** — judged by VALIDATE and inherited *down* as the contract each child must satisfy or kick back up. A node is **not buildable** until it carries decidable `✅ v` of the right kind; if CONSTRUCT/VALIDATE later has to invent unspecified behaviour, the plan was **incomplete** → back to PLAN. Benchmarks (the cost/quality dimensions to track and later optimise) are named here too; deferred levers logged not built: `🎯 fd` (accuracy), `⚡ opt` (speed), `🔮 Future` (expansion).

**4 · consolidate** — not a lossy summary but a template-completion pass: walk the **Plan facet** template — *overview (produced by DESIGN) · correctness basis + refs · staged tasks (indep/seq) · behaviour spec · benchmark plan · risks & edge-cases · success criteria · child roster · firmed boundary* — landing what the move produced into each slot, concise but **complete** (every slot thought through, nothing required omitted). **Written for a cheaper/cold reader:** it is the durable SoT that CONSTRUCT (which forks warm off it) and VALIDATE consume. A final **self-check** closes the move: one in-context pass of the facet against the design layer — every slot complete, criteria decidable, nothing silently invented; cheap, but it catches omissions, not delusions, so the arms-length **plan-audit** (`validate.md` → *What it is*) still runs before any CONSTRUCT is dispatched. Then hand the children to the scheduler, each tagged with its difficulty rating.

**One evolving facet.** The Plan facet is not a separate document from the Design facet: a node carries **one** facet that elaborates stub → design → plan. PLAN *adds* the plan layer and firms the boundary but never overwrites the design layer — the *why* must survive for warm children and for re-visits — and *overview* simply **is** the design-level summary, which the MCP serves as an altitude-appropriate view. (Cross-cuts DESIGN; mirrored in `design.md`.)

**Aspects** are recruited here on the **shape** question — an aspect scoped over this subtree: is it relevant to N, is N marked, does the plan honour its contract? Behaviour-threading is CONSTRUCT/VALIDATE's job. Recruit an in-scope aspect with a **marker, not a dedicated part**: a block-form marker (empty inline value + a `>` blockquote) carries the multi-paragraph shape-consideration the MCP serves for that aspect, so "considered in the plan" and "picked up by the MCP" are the *same* artefact (one contiguous blockquote under the marker line, not free-floating prose).

**Generic vs plugin.** The generic PLAN move owns the *shape* above (decompose, firm, specify-behaviour, benchmarks, stages). What "correct" *means* is **plugin-supplied**: r-science fills the correctness basis with equations / invariants / references / reproducibility-seeds and a functional-by-default bias; a dashboard plugin fills it with renders-on-real-data / a11y / perf budget. Same move, different oracle vocabulary.

---

## Conduct — seal-conditioning

The decomposition **is design**, so a sealed node **proposes** it rather than splitting autonomously:

| <br />                            | decompose / boundary / criteria                                              | landed plan                                    |
| --------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------- |
| **Sealed** (default; root sealed) | *proposed*: "these x children / y staged tasks; alternatively z — pros/cons" | awaits sign-off (batched to the HITL view)     |
| **Unsealed**                      | autonomous                                                                   | written; children scheduled; faults cascade up |

Sign-off is **parked, not blocking** (as DESIGN): schedule *independent* children while a sealed decomposition awaits sign-off; never build atop an unconfirmed split.

---

## I/O contract

- **Reads (MCP, scoped):** N's **Design facet** (direction · boundary · alternatives · confidence — a warm fork already holds it); ancestor boundaries — at minimum the *chain of firmed boundary contracts* from root to parent (what N integrates against and must not violate), plus the nearest trusted design for direction; siblings at their current elaboration (the integration surface); in-scope aspects (shape); the registry (`alt` / `de` / `fd` / `opt`). **Open (leaning maximal — revisit against a real project):** whether this stays the lean boundary-chain or widens to the *full* ancestor + sibling plans. Depth is small (≤\~5–10) so even maximal is bounded; cross-sibling consistency ("things that rhyme") argues for more, token-thrift for less.

- **Writes (validated path):** the **Plan facet**; **create child stub nodes** (`🧩 Part-of`), each with its interface-fidelity boundary; firm N's own boundary toward mock; the `✅ v` behaviour + correctness basis + benchmark requirements; log `🎯 fd` / `⚡ opt` / `🔮 Future`; a per-child difficulty rating.

- **Never** writes the raw planning transcript — `summarise` distils it; the local cache keeps the rest for the spirit-check.

---

## Move-outcome (dispatch seam — pins with DESIGN's)

PLAN reports: new **fidelity** and **confidence**; an **outcome** ∈ `{ build-ready | spawned | fault | escalate }`, faults in the shared `(layer, locus)` vocabulary adopted in `construct.md`. What were `reconsider-design@N` and `re-diverge` are **merged** into the single `fault(design@N)` — one value at two intensities, and the re-entry rule already keys warm-vs-cold on the *cause* (`design.md` → reconcile); `restructure@ancestor` is `fault(structure@ancestor)`, which PLAN may raise because it reads the ancestor boundary chain (evidence-locality — unlike CONSTRUCT/VALIDATE, whose faults are locus-N only). The old catch-all outcome splits in two — `build-ready` (this node hands to CONSTRUCT, via the scheduler's **plan-audit**: the arms-length check at the one seam whose consumer cannot judge — `validate.md`) and `spawned` (fission: children created and scheduled) — each carrying a **per-child / per-construct difficulty rating** (per-decision, not volume — see `design.md`). A single PLAN's children may be a **mix**: each child is born *either* a stub (needs its own DESIGN → PLAN) *or*, when PLAN can already see it is a true leaf, a build-ready leaf-plan — never a half-state, the choice being the same fission test applied one level down. PLAN never *triggers* CONSTRUCT itself; it emits readiness and the **scheduler** dispatches (so the seal gate and the fault-ladder stay in one place).

This is the other half of the **C↔D seam**: PLAN's fault vocabulary and DESIGN's are pinned together by the **shared enum, now adopted** (`construct.md` → *Move-outcome*: layer × locus, evidence-locality, the one-hop ladder). A downstream construct failure routes back **up** the ladder — retry construct → tier-up → `fault(plan@N)` → `fault(design@N)` → `fault(structure@ancestor)` → escalate — stopping at the first **sealed** node, each rung raised by the move whose evidence supports it.

One `restructure` variant is **project fission** — a subtree that is really its own project (an independent package, a thesis chapter) is *promoted out*: a rare, **user-signed-off** restructure, never a routine PLAN outcome. PLAN or the scheduler may *propose* it, and the scheduler **warns** when subtree size or depth crosses a threshold ("consider splitting into independent projects").

---

## The floor pass (breadth-first — not a separate mode)

There is no "stub mode": the shallow shape falls out of the tree, not out of a PLAN switch. What the **scheduler** chooses is *ordering* — go **breadth-first** (decompose one level, firm each boundary to **mock** so the walking skeleton walks, author each node's **acceptance requirements**) before going **depth-first** into full behaviour-spec on any one branch. The floor pass defers *depth*, **not** the requirements: even a shallow node states the criteria its children validate against — otherwise the failure mode appears, a big tree of jargon and hand-waving that hides real design faults. A floor-pass stub-PLAN does **just enough for each child's DESIGN to know what it is designing** — decompose, firm the boundary to mock, state the acceptance requirements — and **no more**: the design itself is the child's DESIGN, never PLAN's. Keeping the assembled skeleton green after every PLAN write needs a **cheap, quiet gate** — a `devtools::check`-style tool that returns "all good" or a terse failure, never verbose output, so it does not pollute PLAN's context (or that of any DESIGN/PLAN forked off it); a **needed substrate tool**. Full PLAN follows when best-first deepening returns to the node.

---

## Altitude behaviour (falls out of the dials — no branching logic)

- **Root / near-root:** a big, collaborative *decomposition* — many children, high stakes, seal-conditioned proposal.

- **Leaves:** the *implementation detail* is heaviest here. A leaf PLAN is the **most detailed facet in the tree** — a complete build brief a **weaker model** can implement without judgement calls: staged tasks, full behaviour spec, `✅ v` criteria, edge cases, gotchas. If a leaf's plan reduces to two lines, the tree was over-split — keep the tree shallow and navigable (by rjs and Claude both); detail lives in the leaves, not in node count.

So the load is **decomposition-heavy at the top and implementation-detail-heavy at the bottom**; only the pure pass-through middle is light — and all of it falls out of difficulty and centrality, no branching logic.

---

## Worked example (continuing the mixture-tox node #3 "mixture model: CA vs IA")

DESIGN landed **CA**; boundary *consumes per-component SSDs, emits a combined PAF*; confidence tentative. PLAN forks warm, sealed under the root:

1. **inputs current** — the scheduler handed PLAN a fresh design; direction still CA, nothing upstream moved.
2. **decompose** — two pieces with their own correctness stories → **children**: `#3.1 per-component SSD consumer` (SSD → per-component fraction) and `#3.2 CA combiner` (fractions → combined PAF), independent of each other — plus the **glue leaf** `#3.3` (wire consumer → combiner behind #3's boundary; owns the mixing-ratio handling, which only exists at composition level), sequential after both. Fission, not build.
3. **firm boundary** — pin #3's mock: given mock SSDs, return a plausibly-shaped PAF so the skeleton runs — handed to `#3.3` as its starting artefact.
4. **specify behaviour** — `✅ v` "combined PAF matches the reference msPAF worked example (Posthuma & de Zwart, Table X) within tolerance"; invariants = monotone in exposure, PAF ∈ \[0,1]; edge case = component SSD all-`NA` → propagate; benchmark = runtime at realistic component count; `🎯 fd` non-parametric SSD logged. (#3 is an internal node, so these are its **acceptance requirements**; the executable `testthat` suites — tolerances, oracles, seeds — get written by PLAN when #3.1 / #3.2 are planned as leaves, and the executable subset of #3's own requirements becomes `#3.3`'s integration suite.)
5. Sealed → propose the three-child split + criteria with pros/cons; on sign-off, schedule #3.1–#3.3 and mark #3 ready to fold.

---
