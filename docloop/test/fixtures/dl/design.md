# Move: DESIGN — draft v0 (for hash-out)

> The **first** move in the per-node loop **design → plan → (construct) → validate**.
> docloop format: comments are `:mark` / `:::mark` directive anchors; their threads live in the `threads/<id>/` sidecar store.
> Builds on converged decisions: internal/external consistency; the warm-fork tree; seal-conditioning; read-only scout + retrieval-pointer; whiteboard as a *separate, suggested* move.

---

## What it is

**"Is this the right thing — and what, in essence, is it?"**

Design lands a **direction** + its **rationale** + **alternatives** + a **boundary/contract** + a **confidence**, and writes them as the node's **Design facet**. It does **not** elaborate the direction into an implementable plan (that's PLAN) and does **not** build children (that's PLAN/`structure`). The fork to PLAN happens right after design's final `summarise`.

The **boundary is declared at** ***interface*** **fidelity** — the contract surface (inputs / outputs / types / responsibility): provisional but real, enough for siblings to integrate against and for the walking skeleton to wire. PLAN + CONSTRUCT then firm it as fidelity climbs interface → mock → correct; once past interface, a change to a *sibling-visible* boundary is a cross-node event (cascade / restructure), not a free edit. (That interface rung is the provisional/in-stone line we couldn't place earlier.)

DESIGN stays **child-free at every altitude**. During the **floor pass** the scheduler still reaches *interface* fidelity for a node by interleaving DESIGN with a light, **stub-only PLAN/`structure`** breadth-first — so a runnable skeleton appears early — but the children are created by that stub-mode PLAN, never by DESIGN.

It is deliberately a **cheap** — better, **proportionate** — mostly-autonomous gate: its cost scales with stakes (centrality · uncertainty · reversibility · how much the alternatives actually differ; see *The dials*), and its whole job is to be **cheaper than wasting PLAN + IMPLEMENT on the wrong thing**. Low-stakes / many-right-answers (a dashboard widget: dropdown vs buttons) → a quick "good enough, moving on"; high-stakes / unclear-with-knock-ons (what distributional assumptions to make?) → stop, weigh prior art and alternatives, and document *why this, what else we considered, and what affordances the alternatives would have given*. Explicitly *not* the whiteboard (the rare, high-tier, user-driven, from-first-principles rethink). Design may *suggest* doing a whiteboard if the design decisions are too unclear or cross across multiple parts of the tree and require user input.

---

## The pipeline

```
reconcile → situate → question → (optional: spike) → summarise
```

> **What "intensity" means below** (it recurs) — and how it differs from **model/effort**, which is a *separate* dial. A move is resourced along two orthogonal parts:
>
> - **Model / effort** — a **cold-restart-costing** choice: `/effort` and model are fixed for a conversation's life (even a fork inherits the parent's model), so *any* change **always** pays a cold start — rare, deliberate, and worth resisting for small tasks (don't bounce models and keep re-paying the start-up cost). And because models are poor judges of *which* model/effort a task needs (self-knowledge is unreliable), the just-finished move does **not** name one. It emits a single **qualitative, per-decision difficulty rating** (`0–10`, anchored with worked examples — note a big-but-routine task is *low*, not high; see *Move-outcome*). A **deterministic, move-dependent lookup table** then reads {that rating · the current warm fork’s (model, effort) · what *intensity* can absorb} and routes: continue the warm fork, or spawn a new one at the setting the table picks. (Each move rates the work it hands *forward*: DESIGN's rating resources PLAN; PLAN's per-child ratings resource each child's next dispatch.) Match is **exact, not “close enough”** — a conversation’s model+effort are fixed, so you either continue *this* fork or you cold-start.
>
> - **Intensity** — the cache-safe bundle: prompt/skill/template selection · how widely to scout/brainstorm · spike-or-not · deep-dive-or-not. No model change ⇒ no cache break ⇒ dial it freely; derive it **deterministically** from centrality · confidence · open-qs, plus the difficulty rating above — intensity is the cache-safe lever the router spends **first**, before it will pay for a cold start (the old “escape-hatch difficulty flag” is now just the rating itself). Breadth is **qualitative** — “a few / many / all practical alternatives”, never a fixed count. Shows up inside the move as *more/fewer stages + more/less breadth*, never a live dial.

The middle two stages are the consistency check, split along the internal/external axis:

**0 · reconcile** — *always; cheap.* On (re-)entering N, the MCP has provided the latest state as part of the prompt: have any `❓ q` / `✅ v` resolved since last visit? Recompute confidence. Ask "am I still in the right place?". If a resolved item changes the picture, the rest of the pipeline runs against the new state.

- **Re-entry is a delta, not greenfield.** When PLAN kicks a node back (a premise moved), the scheduler re-runs DESIGN and picks the mode deterministically from the cause: **warm** when refining N's *own* resolved question (prior reasoning still valid — keep it); **cold** — just the SoT node text + the `alt` / `de` registry, not the transcript — when a *premise moved* under N, so it is re-thought fresh without anchoring to now-suspect reasoning. Cold ≠ amnesiac: the durable ledger still feeds it (*frame-intact → warm, frame-broken → cold*). (Mirrored from `plan.md`'s reconcile note.)

**1 · situate — EXTERNAL consistency** — *intensity ∝ (1 − parent-confidence).* "Is N actually *needed*, judged against the nearest **confident** ancestor?" (Not necessarily the immediate parent — anchor on the nearest ancestor we trust; the whole root→N path is already loaded.)

- Pass → continue.

- **Fail** → N shouldn't exist here as specified → emit a **restructure fault** routed to the ancestor where the wrong assumption actually lives, and **stop** (don't design something that shouldn't exist). Sealed ancestor → escalate/park.

- **The external check has a ceiling (t20).** "Is N *needed / correct*?" is only answerable *within* the project’s scope. Near the root — "a dashboard to analyse trends in x" — correctness lives *outside* that scope and can’t be judged internally, so situate degrades to a **coherence** check: does the conception *hang together* on its own terms? At that altitude **assertion is legitimate and expected** — it buys commitment, not reality-contact (see *The dials* → Confidence, two axes) — provided the direction was interrogated in an initial brainstorm/whiteboard, not asserted blind.

- *This is where "restructure" comes from* — it's the external check returning "no", not a separate move. The ability to say "no" needs to be expressly licensed in the prompt so that the model actually feels free to force a restructure. This may need some empirical calibration to get right.

- **Project fission** is a restructure variant: a subtree that is really its own project (an independent package, a thesis chapter) is *promoted out* — rare and **user-signed-off**, *proposed* (by PLAN or the scheduler) not automatic; the scheduler warns when subtree size or depth crosses a threshold. (Mirrored in `plan.md`.)

**2 · question — INTERNAL consistency** — *intensity ∝ (1 − own-confidence) × centrality.* "Given we need it, is this the right *approach*, on its own terms?"

- Already confident → **skip to** **`summarise`** (sometimes the answer is just: yes, get on with it).

- Not confident → diverge: **scout** (prior art *and* poke-the-world spikes — read-only, retrieval-pointer) → **brainstorm** alternatives → **compare** against the ancestor node's, project's and plugin's desiderata → land a direction. Losers logged `⚖️ alt` (`viable` if close); dead-ends `🪦 de`.

  - Note: beware spending too much effort on low stakes-decision (2+ alternative approaches, all good enough, no clear winner - "premature optimisation is the root of all evil"). Work out *when* spikes are actually necessary. Centrality probably matters a lot here. How difficult will it be to go back if it does turn out to be the wrong direction? Are there *real differences* between alternatives where the *differences matter* to children nodes or to the final product? (These are the reversibility / differentiation dials — see *The dials*.)

- **Tunnel-vision smell** (confidence stays low after the check; or central + about-to-seal + never seriously diverged; or alternatives logged-but-never-weighed) → **suggest a whiteboard** (user-invoked).

**3 · spike** — *optional.* When a decision hinges on an empirical unknown, a **budgeted** back-of-envelope calc / feasibility probe (read-only scout's poke-the-world mode). Result → the artefact cache (full raw output) **+ a claim-with-evidence note on the node**: the finding, *plus* a short method sketch + a pointer to the artefact — the SoT artefact `what / how / cache` shape — enough that an experienced cook could re-run it, not a bare summary.

- **3b · reasoning deep-dive (effort / tier escalation)** — *rare; gated.* The same "dispatch a sub-room" reflex as a spike, but for a hard *reasoning* nut rather than an empirical one (@rjs). Because `/effort` and tier are **fixed for the life of a conversation**, the only way to actually turn effort *up* mid-design is to **cold-spawn a fresh room at max effort** (and/or a higher tier), seeded with just the hard sub-problem. Gate it hard —  it only pays when the nut is genuinely load-bearing (high centrality × residual uncertainty *after* the normal question stage). The sub-problem should be stated as self-containedly as possible to not use up context unnecessarily - though note: writing a question itself takes up tokens in the main conversation, so the calling LLM prompt should be as short as possible, assuming that the MCP will add additional context about the current node (but not ancestor ones).

**4 · summarise** — condense the reasoning into the lean **Design facet** and append it to the node. **Load-bearing — but not for the reason I first wrote:** a warm PLAN fork inherits the full divergence regardless (that's the free spirit-check). `summarise` is for the node's **durable memory** — what the MCP serves to *cold* readers and *cold re-entries* later, and what compiles toward the issue. PLAN forks immediately after (warm); we *cold-spawn* PLAN from the summary only when we deliberately want fresh, unbiased eyes (see *The dials*).

- This summarise includes the **design direction** + its **rationale** + (optional) **prior art** + **alternatives** (including info about any spikes) + a **boundary/contract** + a **confidence**

- Closes with a cheap in-context **self-check** — direction, boundary, confidence, alternatives present and mutually consistent — before the facet is written. It catches omissions, not delusions (same context, same blind spots); the consuming PLAN, the seal, and downstream VALIDATE stay the real validators (see `validate.md` → *Where validation sits in a node's life*).

**One evolving facet.** The Design facet is the *design layer* of a single facet a node carries, not a standalone document: PLAN later adds a plan layer over it (stub → design → plan) without overwriting this layer — the *why* must survive for warm children and for re-visits — and the MCP serves an altitude-appropriate view of the one facet. (Cross-cuts PLAN; mirrored in `plan.md`.)

---

## The dials — how DESIGN right-sizes itself

The move's intensity is a function of a few **knobs**. The aim is that none is a vibe: each is *computed* from markers the MCP already holds, so the model can't inflate its own confidence just by asserting it. For each — how it's **calculated**, how it's **consumed** here, and how it **fails**.

### Confidence — "how far have we got from having touched reality?"

- **Calculated (provenance, not self-report).** A node's confidence is the **strongest evidence backing its direction**, decayed by **distance** and **staleness**. Evidence is ordinal:
  `asserted < prior-art < spiked < mock-validated < implemented-and-tested < implemented-and-reviewed < user-tested`.
  *Asserted* = the model/human just reasoned it (no reality contact — the floor). *Prior-art* = someone external already did it (cheap, real, but only as good as the match). *Spiked / validated* = we actually ran something. *implemented* there is a real working artefact that does what it says it does (*tested*) and that a model has checked it does the correct sort of thing (*reviewed*). \*user-tested \*= a user has actually tried using the thing and it seemed to work - this is *very* different to a user said that this is the thing that they want. Users are not good at knowing what they want, and even worse at expressing those preferences explicitly. Note also, that a user need not be a Human. The user of an MCP is an LLM. There is no reason to think that the LLM is going to be any better at knowing, beforehand, what it wants out of an MCP, than a human is at knowing what it wants out of a UI. **Distance** = how many assert-only inference hops lie between N and the nearest ancestor whose evidence is ≥ spiked. **Staleness** = an ancestor changed since N last synced → N's inherited confidence is provisional until re-reconciled (cf. the delta-read question, *I/O contract* / t12).

- **Two axes, not one.** The ladder above is the *evidence* axis (reality-contact); it is **orthogonal** to the *commitment* axis (unsealed → proposed → **sealed**). Sealing is the joint human+LLM decision to build on the current evidence — **authority, not evidence**: a seal near the root is often only `asserted`, because spikes can't run at that abstraction. Per Doktoreltern's anti-sycophancy stance, an asserter being confident (a human, *or* the LLM "user" of an MCP) buys **commitment weight, not correctness** — so `asserted-by-human` doesn't truly outrank `asserted-by-model` on *this* axis. The dangerous cell is **sealed-but-only-asserted**: committed yet low reality-contact — exactly the tunnel-vision that attention-ordering (and a doubt-pass) must hunt.

- **Consumed.** (a) *situate's trust-anchor test* is **binary** — "the nearest ancestor we trust" = the nearest whose provenance is ≥ spiked; an assert-only ancestor is never a trust anchor, situate climbs past it. (b) *question intensity* ∝ (1 − own-confidence). (c) *deepening priority* (best-first) ∝ centrality × (1 − confidence). (d) It does **not** hard-gate building — the float orders *attention*, the provenance type gates *trust* (this is the licensed "incorrect version 1" stance).

- **Fails when.** The model is subjectively sure of an assert-only node (mitigated: provenance stays low regardless of vibe); inherited confidence drifts stale (mitigated: delta-sync); prior art is *found but doesn't actually match* (mitigated only by checking the cite, not just retrieving it).

### Centrality — "how much depends on getting this right?"

- **Calculated.** A graph property: out-degree in the dependency DAG (how many nodes consume this node's boundary), weighted by *their* centrality (PageRank-ish) — or, cheaply, subtree size + count of sibling boundaries that touch it + whether it's an *aspect hub*. It's **cheap and fully deterministic**. For subtrees that don’t exist yet (the floor pass), fold in the finishing move’s **difficulty rating** — the same single estimate that drives resourcing (*Move-outcome*): even a stub tells "quick and easy" from "many moving pieces", and difficulty is the right proxy for the missing subtree’s weight (unnecessary work ∝ #children × their difficulty). **Supersede it with real structure** as children land (recompute on every structure change).

- **Consumed.** Scales question intensity, spike-worthiness, deep-dive licensing (*The pipeline*), sign-off strictness, and deepening priority. High centrality × low confidence = the thing to attack next.

- **Fails when.** The tree doesn't exist yet (floor pass), so centrality is estimated and can be wrong; a node becomes central *retroactively* as others come to depend on it → it must be recomputed on every structure change; over-weighting centrality starves leaf-level correctness.

### Reversibility & differentiation — "does it even matter if we're wrong, and do the choices really differ?"

These hide inside "stakes" but deserve naming — they're the **anti-premature-optimisation guard** (t10, and the note in *The pipeline*).

- **Reversibility** = cost to change the decision *later*. A central node behind a *firm boundary* can still be cheap to change internally — so this is distinct from centrality. High reversibility → spend less now.

- **Differentiation** = do the alternatives differ in ways that *reach* children or the product? Dropdown-vs-buttons → low differentiation, pick one and move on. Distributional assumptions → high differentiation (knock-on effects), stop and think.

- **Consumed.** They *gate intensity down*: even a central, uncertain node gets a light touch when the decision is cheap to reverse **and** the alternatives barely differ. Conversely, high-differentiation + low-reversibility is what *earns* a spike or a deep-dive.

### Prior art — an input that moves the others

Per the embeddings idea (t14): keep **summaries of cited literature / sibling-branch findings** in a vector store. The scout does a **cheap local lookup first** (what have we already found, here or on other branches?) → orients on it → *then* widens to web search only if needed. Effect: prior art is the **cheapest confidence-builder** (raises provenance assert → prior-art) and lowers the cost of diverging (you don't start cold).

**Synthesis.** Question-stage intensity is high only when the knobs *agree*: uncertain **and** central **and** hard-to-reverse **and** the alternatives genuinely differ. Any one of "cheap to undo" / "choices barely differ" / "already confident (prior art or validation)" pulls it back toward a quick, documented "good enough, moving on."

---

## Conduct — seal-conditioning

Same pipeline, different conduct:

| <br />                            | situate / question / compare             | landed direction                                          |
| --------------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| **Sealed** (default; root sealed) | *proposed* with alternatives + pros/cons | awaits sign-off (batched to the HITL view)                |
| **Unsealed**                      | autonomous                               | written; external-check failure cascades up automatically |

Even the decision to **not** diverge (high confidence) is surfaced on a sealed node, so the human can object to a fast rubber-stamp.

**Sign-off is parked, not blocking.** The seal-conditioned sign-off is batched to the HITL view; the fork does **not** stall on it. It continues — but only on branches *independent* of the parked decision (never speculatively build atop an unconfirmed seal: if the human later changes it, dependent work cascade-invalidates). Two caveats: **(a)** a parked warm fork ages out of the ~1-hour cache on long human delays, so re-entry is then a **cold spawn** — a **structured re-seed** from the MCP's durable view (like a principled `/compact`: it keeps the *summarised* decisions but drops the ephemeral thinking), **not** a transcript replay (the pacing/sleep mechanism keeps the most valuable forks warm; the rest accept this cold re-seed); **(b)** at a true **bottleneck** node — where everything downstream depends on this one decision (e.g. the root direction) — there is nothing independent to do, so "park-and-continue" degenerates to genuinely waiting on the human.

---

## I/O contract

- **Reads** (MCP, scoped): root→N ancestor *current Design facets* (situate); siblings (boundary coherence); the registry (`alt`/`de`/cites — don't re-explore a logged dead-end); N's own current Design facet (reconcile).

  - *Proposed (t12): a warm fork already holds root→N as of fork-time, so* *`reconcile`* *should be a* ***delta-sync**, not a full re-read —* *`context(node, since=<last-seen-ref>)`* *returning only what changed on ancestors since.* *`since=null`* *⇒ full read, for* ***cold*** *callers (a fresh-eyes cold PLAN, or a parked fork re-entering cold). Deltas are non-empty only to the degree the tree is* ***non-linear*** *(restructure / cascade / sibling-invalidation) — which is exactly their job: the propagation channel for cross-branch news. This argues for a* ***git-backed node store*** *(delta =* *`git diff <ref>`) with issues as a projection/index, not the SoT.*

  - **Decision leaning (t12)** — recorded on #60, *not yet implemented*: **drop GitHub issues as the backing entirely.** Issues-as-node-store (one-issue-per-node, #16) was always bolted onto an architecture it didn’t fit — no cheap "diff since ref", locked to GitHub, awkward under concurrent multi-fork writes. Replace with a **native graph-traversal store**: git-backed, filesystem / markdown-graph (the tree is mostly a tree), so delta = `git diff <ref>` falls out for free, it’s portable/offline, and branch/merge mirrors the fork-tree. Crucially, **docloop is already that store’s HITL surface** (git-per-turn co-editing + a rendered human view), so the two converge — build once. Issues, if kept at all, become a generated projection/index, never the SoT. Scout prior art for markdown/filesystem graph stores before designing.

- **Writes (validated path):** append the **Design facet** = direction · reasoning · `⚖️ alt` · `🧱 boundary/contract` · `🧭 confidence` · deferred (`fd`/`opt`); update the confidence gauge; log `🪦 de` and spike-artefact markers and prior art summaries.

- **Never** writes the raw divergence transcript to the node — `summarise` distils it; the local transcript cache keeps the rest for the spirit-check.

---

## Move-outcome (dispatch interface to the scheduler)

Design reports: new **confidence**; and a **fault signal** ∈ `{ ok | restructure@ancestor | whiteboard-suggested | escalate }`. `ok` carries "ready to fork to PLAN". Pin this shape *with* PLAN's — it's the C↔D seam. (In the shared `(layer, locus)` vocabulary since adopted — `construct.md` → *Move-outcome* — `restructure@ancestor` is `fault(structure@ancestor)`: situate may name an ancestor because it is the one stage that reads the ancestor chain, per evidence-locality; `whiteboard-suggested` stays a suggestion flag, not a fault.)

**One forward number** — a `0–10` difficulty rating (anchored with worked examples so it is calibrated, not vibes). But guard *what "difficulty" measures* — per-decision hardness, not volume (t1). **Difficulty and size are two axes, not one:** a big-but-routine node ("make a thing with 100 simple bits") is *low* difficulty — each bit is easy — and its bigness shows up as **many children**, never as a high rating. They route differently, and conflating them is the failure mode t1 caught (rate it 10 → run Opus/max over a mountain of easy work):

- **Difficulty → model/effort** (the router in *The pipeline*). Escalate the tier only for *irreducible per-decision* hardness — the already-agreed **decompose-first** rule (#44/#36): difficulty first triggers **fission**, and only *irreducible* hardness earns a bigger model.

- **Size (child-count) → decomposition / farm-out**, never a bigger model — you split easy volume into cheap children (parallel / farmed out), you don’t buy horsepower for it. Size isn’t a new predicted metric: it’s the stub-PLAN structure centrality already tracks.

- **Centrality → difficulty × size** (attention ∝ *total* work) — the one place the product is the right quantity.

So last turn’s "one number collapses three estimates" was too strong (t1 is right): the rating collapses cleanly for *attention*, but **resourcing reads its components separately** — difficulty picks the tier, size picks decompose-or-not. The deterministic scheduler consumes both; real structure supersedes the size estimate as children land.

**Build the seam now, defer the policy (t19).** This is very likely premature optimisation, so specify only the *interfaces*: the difficulty rating on the move-outcome, a **swappable deterministic router** (the move-dependent lookup table), and a **usage log**. Leave the actual routing policy — the table’s thresholds — blank until real usage data exists to fit it. Watch the over-specification trap: if pinning down the estimate ever gets detailed enough to basically *be* the child nodes, stop estimating and just write the children.

---

## Altitude behaviour (falls out of the dials — no branching logic)

- **Root / near-root:** situate near-vacuous (no/!confident parent) but question *heavy* — high stakes, generalities, low starting confidence → full diverge, often a whiteboard suggestion; collaborative.

- **Leaves / belt:** situate cheap (confident parent), question light (high confidence) → frequently just `reconcile → situate → summarise`, diverge skipped; mostly autonomous.

So the *same* move is an expensive brainstorm-anchor up top and a 10-second sanity check at the bottom — driven only by the dials (`parent-confidence`, `own-confidence`, `centrality`, plus reversibility / differentiation).

---

## Worked example (dogfood — mixture-tox node #3 "mixture model: CA vs IA")

1. **reconcile** — fresh node, nothing resolved yet.
2. **situate (external)** — parent #1 (package, msPAF, conf HIGH). Does an msPAF package *need* a mixture model? Yes; high parent-confidence → cheap pass, \~no effort.
3. **question (internal)** — conf LOW, centrality HIGH (load-bearing; `uncertainty` aspect hub) → full diverge: scout (concentration addition vs independent action; Posthuma/de Zwart) → compare vs desiderata (components similarly-acting → CA the better default) → land **CA**; log `#3.alt1 IA — viable when components act independently`. Literature decisive → no spike.
4. **summarise** — Design facet: *direction* CA; *reasoning* similarly-acting components + regulatory precedent; *alt* IA (viable → dormant #8); *boundary* consumes per-component SSDs, emits a combined PAF; *confidence* tentative (rising when the `v` "matches reference msPAF" is set); *deferred* `fd` non-parametric SSD.
5. Sealed (under sealed root) → propose CA + the IA alternative with pros/cons; on sign-off, fork to PLAN.

---
