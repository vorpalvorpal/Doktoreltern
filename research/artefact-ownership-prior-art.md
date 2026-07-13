# Prior art: spec-tree ↔ artefact ownership — raw research reports

> Three research-agent survey reports, 2026-07-11, commissioned for the
> artefact-ownership question (does every chunk of the artefact belong to one
> leaf of the spec tree?). Synthesised into
> `docloop/workspace/artefact-ownership.md`; this file keeps the full detail and
> citations. Untracked working material, not part of any plugin.

---

# Report A — literate programming, document-owns-code, projectional editing

Research question: can a spec tree own a differently-shaped artefact chunk-for-chunk, with surgical spec→artefact edits? This cluster is the richest source of prior art because tangle/untangle *is* exactly that problem: an exposition tree (doc order) owning a build tree (compiler order), with a deterministic mapping and, sometimes, a reverse channel.

## 1. Knuth's WEB/CWEB and noweb

**(a) Ownership/identity.** Chunks are identified by *name*, not ID. In WEB/CWEB a section is `@<Name of section@>=`; in noweb `<<chunk name>>=`. Crucially, a chunk name is a *set*, not a single block: multiple definitions with the same name are **concatenated in document order** (CWEB's unnamed `@c` sections all append to one implicit output stream). So identity is many-to-one: several doc-side fragments own one code-side location jointly, ordered by appearance. There are no stable IDs — renaming a chunk silently orphans its references (weave flags "never used" chunks, but tangle-time detection of dangling references is the only integrity check). ([noweb homepage](https://www.cs.tufts.edu/~nr/noweb/), [noweb CRAN vignette](https://cran.csail.mit.edu/web/packages/noweb/vignettes/noweb.pdf))

**(b) Shape mismatch.** This is the founding insight of the family: exposition order and code order are *deliberately* non-isomorphic. Tangling is a deterministic macro expansion from named **root chunks** (`notangle -R'file.c'`; one web can hold many roots, one per output file). The doc tree is a DAG of chunk references; the artefact shape falls out of which roots you extract. The mismatch is bridged not by structure alignment but by a *compiler for the mapping* plus **provenance pragmas**: CWEB emits `#line` directives and noweb has `-L` so compiler errors and debuggers point back into the web source. That's the family's canonical answer to "the artefact isn't the doc": don't make them isomorphic, make the projection deterministic and make provenance survive it.

**(c) Cross-cutting/metadata.** Handled honestly: it isn't owned. WEB has "limbo" material and macro sections; but Makefiles, headers, and build glue typically live *outside* the web or get shoved into awkward catch-all chunks. CWEB's answer for declarations-needed-everywhere is that a chunk can be referenced from many places — i.e. cross-cutting content becomes a *shared chunk included by multiple owners*, which inverts the invariant (one chunk, many consumers) rather than solving it.

**(d) Failure modes.** No untangle, ever — Ramsey kept noweb strictly one-way; `nountangle` is a misnomer (it converts plain code *into* a web with comments as doc, not tangled edits back). Practitioner retrospectives report: debugging friction despite `#line` (tooling — linters, IDEs, coverage — sees generated files it tells you not to edit); **chunk proliferation** destroying readability of control flow; language bias in tools (Inweb mangling C++/Python); single-file tangles killing incremental compilation; and pervasive tool lock-in ([Zumi, "My many misadventures with Literate Programming"](https://zumi.neocities.org/bloge/literate_programming)). The one-way design is a *conclusion*, not an omission: WEB's authors judged round-trip unmaintainable and made "never edit the tangled file" a social contract enforced by generated-file headers.

## 2. Leo editor

Leo is the most instructive system here because it spent 25 years on exactly this question and left an unusually candid engineering log ([History of Leo](https://leo-editor.github.io/leo-editor/history.html)).

**(a) Ownership/identity.** An outline node owns a span of the derived file. Two eras: (1) original tangle/untangle used chunk-name conventions — the untangle command was, per Ream, "the most complex and difficult code I have ever written," and it never became reliable; (2) `@file` embeds **sentinel comments** in the derived file marking node boundaries and nesting, plus **gnx's (global node indices)** — permanent unique IDs introduced in Leo 4.1 as "a foolproof way of associating nodes in .leo files with nodes in external files." The lesson: *names and heuristics failed; explicit IDs written into the artefact succeeded.*

**(b) Shape mismatch.** The outline tree flattens to files via `@others` and section references; sentinels record the **complete nesting structure redundantly** in the flat file. Ream's key design law: "the write code must contain absolutely no conditional logic," because otherwise the read (untangle) code cannot reconstruct which branch was taken. Round-trip works precisely because the projection is bijective-by-construction — every byte of the derived file is attributable either to a node or to a sentinel.

**(c) Cross-cutting/metadata.** Weak spot. Files Leo doesn't own are simply outside (`@ignore`, or not in the outline). Organizer nodes (structure with no code) are representable with sentinels but are exactly what gets *lost* in the sentinel-free modes. A hard-won rule: "@file nodes should contain no orphan or ignored nodes" — mixing owned and unowned content inside one derived file caused catastrophic divergence between outline and file.

**(d) Failure modes — the richest record in the cluster.**

- **Untangle-by-inference is a tarpit**: pre-sentinel untangle produced years of bugs and was abandoned wholesale ("much easier to untangle files derived from @file — the old tangle code created all sorts of problems that just disappear").
- **Clone bugs and "disastrous reversions"**: subtle clone/sync bugs caused spurious read errors that could revert user work — the class of bug that "undermines confidence" in the whole system.
- **Sentinel pollution has real costs**: Ream himself, decades in: "I have just now realized how badly sentinels interfered with git diffs." This drove `@clean` (2015, Mulder/Ream algorithm): no sentinels, changes to the external file are propagated back into the outline by a **diff-match algorithm**. Cost: ambiguity returns — edits spanning node boundaries are assigned heuristically, and pure-structure information (headlines, organizer nodes) is unrecoverable from the flat file. `@shadow` splits the difference: sentinels kept, but in a hidden parallel file.
- Independent user experience confirms: round-trip "does a pretty good job… it can trip up sometimes," requiring careful manual editing to avoid corrupting the source ([Zumi](https://zumi.neocities.org/bloge/literate_programming)).

Leo's trajectory is a proof sketch: **exact round-trip requires either markers in the artefact or a shadow copy to diff against; you can trade marker pollution for heuristic ambiguity, but not eliminate both.**

## 3. org-mode babel tangle

**(a) Ownership/identity.** `:tangle path` headers on source blocks; block→file position identity is established only when `:comments link` (or `yes`/`both`) is set, which writes sentinel comment pairs into the tangled file. Identity is thus a *link-by-heading-name-plus-counter* — fragile under heading renames and duplicated headings. Without `:comments link`, there is no identity at all and `org-babel-detangle` cannot run. ([Org manual, Extracting Source Code](https://orgmode.org/manual/Extracting-Source-Code.html))

**(b) Shape mismatch.** Same noweb model (`<<ref>>` expansion, many blocks → one file, one org file → many files). Line-number back-mapping exists (`org-babel-tangle-jump-to-org`).

**(c) Cross-cutting/metadata.** Not modeled. Tangled files are expected to be 100% generated; mixed ownership is unsupported. Header args like `:shebang`, `:mkdirp` handle a thin slice of metadata; everything else (project files, manifests) is out of scope.

**(d) Failure modes — well documented on the org list.**

- **Sentinel matching by regex is brittle**: a literal `[[...]]` bracket link *inside a code block body* is mistaken for a block delimiter, breaking detangle — a 2026 bug with patch discussion ([orgmode list](https://list.orgmode.org/orgmode/87jysrbejg.fsf@bhw-yoga.localdomain/), [patch](https://orgmode.org/list/87wlvoce93.fsf_-_@pabryan.au/)); earlier false-positive fixes ([Kevin Foley patch](https://orgmode.org/list/m2k15bnpef.fsf@Kevins-MBP.home.lan/)).
- **Detangle × noweb don't compose**: expanded `<<references>>` in the tangled file break the sentinel geometry — "Not in tangled code" errors ([2018 thread](https://lists.gnu.org/archive/html/emacs-orgmode/2018-05/msg00531.html), [2016 thread](https://lists.gnu.org/archive/html/emacs-orgmode/2016-01/msg00721.html)). Reverse sync only works for the *simple* projection; compose the projection (macro expansion) and reversibility dies.
- **Practical drift**: literate-config users routinely report tangle-on-save being too slow/noisy and quietly abandon the loop (e.g. [org-tangle-config.el archived as "proven to be unnecessary"](https://github.com/trev-dev/org-tangle-config.el)); Doom Emacs's literate module has its own tangle-breakage issue history ([#3729](https://github.com/hlissner/doom-emacs/issues/3729)). The common steady state: tangle one-way, treat detangle as an emergency tool you don't trust.

## 4. nbdev (fast.ai)

**(a) Ownership/identity.** Cells marked `#| export` are owned by the notebook; the exported module is generated with an `# AUTOGENERATED! DO NOT EDIT!` banner plus per-symbol provenance. Since nbdev2, **sync keys off the notebook's stable cell ID** ("each exported cell is tagged with its unique notebook cell ID, so nbdev_update always updates the correct cell") — like Leo, they converged on opaque IDs, not names ([nbdev README](https://github.com/AnswerDotAI/nbdev), [sync docs](https://nbdev.fast.ai/api/sync.html)).

**(b) Shape mismatch.** Notably *small* by design: one notebook → one module (`#| default_exp core`), cells exported **in notebook order**. nbdev mostly avoids the problem by forcing near-isomorphy — doc order ≈ module order. The escape hatch for genuine mismatch is `#| export other.module`, letting a cell tangle into a *different* module than its notebook's default — a per-chunk override of the ownership map ([export docs](https://nbdev.fast.ai/api/export.html)).

**(c) Cross-cutting/metadata.** Explicitly carved out of the ownership model: `settings.ini` is the single hand-maintained config; `setup.py`, `_modidx.py` (the symbol→notebook index that powers doc links and reverse sync), `__init__.py`, and CI workflows are generated or templated by `nbdev_new`, owned by the *tool*, not by any notebook. This is the cleanest answer in the cluster: **three ownership classes — chunk-owned, tool-generated, and one designated human-owned metadata file** — rather than pretending everything has a leaf owner.

**(d) Failure modes.**

- **Reverse sync is deliberately crippled**: `nbdev_update` propagates *in-place edits to existing cells only* — "you can't create new cells or reorder cells… your corrections should remain limited" ([sync docs](https://nbdev1.fast.ai/sync.html)). Structural changes must happen on the doc side. This asymmetric contract (full forward, patch-only reverse) is the only reverse channel in the cluster with a decent reliability record.
- **Merge conflicts** required a whole subsystem: git hooks stripping outputs/metadata, `nbdev_fix` auto-resolving output-only conflicts ([merge docs](https://nbdev.fast.ai/api/merge.html), [fast.ai forums](https://forums.fast.ai/t/nbdev-best-practices-for-small-research-project-handling-merge-conflicts/85671)).
- **The co-creator's abandonment**: Hamel Husain now recommends against it — AI tools "struggle to differentiate between editing the notebook and editing the final source code," so you fight the tooling; idiosyncratic source-of-truth formats "isolate you from your team"; and the promised doc-sync benefit didn't materialise anyway ([Why I Stopped Using nbdev](https://hamel.dev/blog/posts/ai-stack/)). Directly relevant to Doktoreltern: an LLM-driven workflow multiplies, not reduces, the cost of a nonstandard source of truth, because every agent must be re-taught which surface is writable.

## 5. Projectional editing (JetBrains MPS, Intentional) and views-over-code research

**(a) Ownership/identity.** The clean-room solution: there is **one canonical AST store; every node has a UUID**; all "shapes" (textual, tabular, diagrammatic, flattened) are projections that never exist as editable ground truth. Identity is total and free — no sentinels, no names, no diffing — because nothing is ever parsed back ([MPS concepts](https://www.jetbrains.com/mps/concepts/), [Wikipedia](https://en.wikipedia.org/wiki/JetBrains_MPS)).

**(b) Shape mismatch.** Dissolved rather than bridged: projections are arbitrary functions of the store, so doc-shape and artefact-shape are just two projections. mbeddr demonstrated this at ~10 person-years scale, including prose-with-embedded-code views — literate programming as a projection ([Voelter et al., Lessons learned from developing mbeddr](https://voelter.de/data/pub/voelterEtAl2017-buildingMbeddr.pdf)).

**(c) Cross-cutting/metadata.** Actually the paradigm's *strength*: cross-cutting concerns are annotations/aspects on AST nodes, projected in or out per view — no single-owner constraint needed because the store is shared and views are read/write lenses.

**(d) Failure modes.** Severe, and they're the reason the paradigm stayed niche:

- **You lose the text ecosystem**: storage is XML/serialized AST; command-line diff/merge is meaningless; MPS ships its own UUID-aware projectional diff/merge to compensate ([tomassetti interview](https://tomassetti.me/business-applications-jetbrains-mps-daniel-stieger/), [MPS FAQ](https://www.jetbrains.com/help/mps/mps-faq.html)). Total tooling lock-in: every editor, grep, CI linter, and now every LLM must go through the projection engine.
- **Editing UX friction** — days of acclimatisation; naive projectional editors reject intermediate malformed states ([Robust Projectional Editing](https://voelter.de/data/pub/robustProjectionalEditing.pdf)).
- **Intentional Software** spent ~15 years (2002–2017) on exactly "capture intent once, project any implementation shape" and never shipped a generally adopted product before the Microsoft acqui-hire ([Wikipedia](https://en.wikipedia.org/wiki/Intentional_programming), [hal2020 retrospective](https://hal2020.com/2017/04/18/does-intentional-finally-have-clear-intent/), [HN thread](https://news.ycombinator.com/item?id=14426288)).
- The lighter-weight academic strand — **Code Bubbles / Debugger Canvas / fluid source-code views** — projects *fragments* of ordinary files into task-oriented working sets with edits written back to the underlying files ([Code Bubbles](https://cs.brown.edu/people/spr/codebubbles/indexold.html), [Debugger Canvas](https://www.infoq.com/news/2011/06/debugger-canvas/)). It round-trips reliably precisely because fragments are *contiguous spans of real files located by the IDE's symbol index* — identity comes from the language's own structure (function boundaries), not from an imposed chunk grammar.

## 6. Others: Entangled, marimo, Literate CoffeeScript, knitr purl/spin

**Entangled** ([entangled.github.io](https://entangled.github.io/), [entangled.py](https://github.com/entangled/entangled.py), [IEEE paper](https://ieeexplore.ieee.org/document/10254816/)) — the most direct modern attempt at *bidirectional* markdown↔code.

- (a) Blocks carry CSS-style attributes: `#id`, language class, `file=` target; composition via noweb `<<ref>>`; same-name blocks append. A **`.entangled/filedb.json` records which files Entangled owns plus content hashes**, "so Entangled will never overwrite files it isn't supposed to" — ownership as an explicit, tool-maintained manifest rather than in-file markers.
- (b) Watch daemon: markdown change → tangle; source change → `stitch` back into the markdown block bodies.
- (c) Unowned content: files not in the filedb are simply untouchable; within owned files there is no mixed ownership.
- (d) Failure modes, per its own README: **the filedb is a merge hazard** ("Entangled can get confused when you merge, and there is a conflict on `.entangled/filedb.json`" — recovery is regenerate-with-`tangle -r`); editing *both* sides while the daemon is down produces conflicts the tool detects by hash but cannot resolve; and stitch, like nbdev, only maps edits back into *existing* block bodies — you cannot mint new blocks or restructure from the code side.

**marimo** ([Python, not JSON](https://marimo.io/blog/python-not-json), [lessons learned](https://marimo.io/blog/lessons-learned)) — solves the problem by **refusing to have two representations**: the notebook *is* a pure `.py` file (cells = decorated functions), so doc shape and artefact shape are one file and git/LLMs/IDEs all work natively. They explicitly rejected the flat-script-with-cell-comment-markers design because it broke importability. Lesson: the most robust "sync" is the one you design away.

**Literate CoffeeScript** — degenerate case worth noting: markdown with code blocks compiled *in document order*, no chunk names, no reordering. Ownership trivial because the projection is the identity on order. Shows the cost curve: reordering power is what creates the whole identity/round-trip problem.

**knitr purl / spin** — `purl()` extracts code from .Rmd (one-way); `spin()` is the inverse *for that comment convention only*. Round-trip exists solely because the "doc" is embedded losslessly in the code file as comments — i.e. the artefact is the canonical store and the document is the projection, the mirror image of WEB. R Markdown practice is overwhelmingly one-way (knit, never detangle).

## Transferable ideas (Report A)

1. **Opaque stable IDs stamped into the artefact (Leo gnx's, nbdev cell IDs, MPS UUIDs).** Every system that made ownership reliable converged on IDs; every system that used names/headings/regex (org-babel, early Leo) accumulated false-positive bugs. *Risk:* sentinel pollution — Ream's own late realisation that "sentinels interfered badly with git diffs"; humans and tools will edit around, duplicate, or delete markers.
2. **Ownership manifest outside the artefact, with content hashes (Entangled filedb, Leo @shadow).** A machine-maintained map `leaf-id → (file, span, hash)` lets you verify the invariant deterministically without trusting in-file markers alone. *Risk:* the manifest is a merge-conflict magnet and a second source of truth that drifts when edits bypass the tool. Make it regenerable from the markers, never hand-merged.
3. **Asymmetric round-trip contract (nbdev): full forward projection, patch-only reverse.** Reverse sync that only updates *existing* chunk bodies in place — never creates, deletes, or reorders chunks — is the only reverse channel in the cluster with a working track record. Structural change must go through the spec tree. *Risk:* it's a social contract; needs a gate that rejects artefact content with no owner.
4. **Three-class ownership taxonomy (nbdev): leaf-owned / tool-generated / designated-metadata.** The invariant then reads "every artefact byte is in exactly one class, and class-1 bytes have exactly one leaf." *Risk:* the metadata class becomes a dumping ground; keep it a closed allowlist enforced by lint.
5. **Provenance pragmas for the debugging gap (CWEB `#line`, noweb `-L`, org tangle-jump).** Failures surface in artefact coordinates and must be translatable back to the owning spec node mechanically. *Risk:* spans go stale; regenerate the index on every commit rather than maintaining it incrementally.
6. **Shared chunks for genuine cross-cuts (WEB's multi-referenced sections) — as an explicit, rare escape hatch.** Model it as its own leaf (the chunk has one *owner*, many *consumers*) rather than weakening one-chunk-one-leaf. *Risk:* chunk proliferation — the documented literate-programming readability killer.

**Anti-transfer:** untangle-by-inference (pre-sentinel Leo, `@clean`'s residual ambiguity) — heuristic reverse-mapping without markers cost Leo years and still loses structure; and full projectional storage (MPS/Intentional) — total identity guarantees at the price of leaving the plain-text ecosystem, which contradicts Doktoreltern's portability principle and, per Husain, is now *worse* in an LLM workflow, not better.

## Recurring gotchas (Report A)

- **Round-trip is the graveyard.** Forward projection (tangle) is a solved, boring problem everywhere; every reverse channel is either abandoned (noweb, knitr), crippled by design (nbdev, Entangled stitch), heuristic and lossy (@clean), or bought by abandoning text (MPS). Plan for asymmetry from day one.
- **Name-based identity rots; regex-based sentinel parsing produces false positives.** IDs or nothing.
- **Composition breaks reversibility**: the moment the projection does more than concatenate, detangle fails. Keep the leaf→chunk map as close to 1:1 concatenation as possible; put cleverness in the spec tree, not the projection.
- **"Both sides edited while the syncer was off"** is the universal corruption path. If sync isn't enforced at a gate, it will be bypassed.
- **Sentinels tax every downstream consumer** — git diffs, reviewers, linters, and LLMs all pay.
- **Cross-cutting/metadata is never solved inside the ownership model** — every surviving system either excludes it, assigns it to the tool, or gives it a designated catch-all owner. The failure mode of not deciding is Leo's "orphan nodes → disastrous reversions."
- **Ecosystem/LLM alignment beats internal elegance**: nbdev's co-creator quit it because AI tooling couldn't tell writable surface from generated surface; marimo won mindshare by making the canonical form ordinary code. Any ownership scheme should keep the artefact looking like a normal R package to every tool that doesn't know about Doktoreltern.

---

# Report B — requirements traceability, safety-critical engineering, MDE, lenses, IaC

## 1. Safety-critical traceability (DO-178C / ARP4754A / ISO 26262 / IEC 62304)

**(a) Ownership/identity across refactorings.** Identity lives in requirement IDs held in a requirements-management tool (DOORS etc.), not in the code. Traceability is bidirectional across every level: system req → high-level SW req → low-level req → source → object code → test ([Parasoft DO-178C guide](https://www.parasoft.com/learning-center/do-178c/requirements-traceability/), [Parasoft ISO 26262](https://www.parasoft.com/learning-center/iso-26262/requirements-traceability/)). Refactoring the code doesn't move identity — the trace matrix is re-verified after change, which is exactly why it's expensive. Change-impact analysis is done *through* the links, so stale links directly corrupt impact analysis.

**(b) Hierarchy↔flat bridge.** The standards don't demand structural isomorphism, only *complete link coverage in both directions*. The bridge is the trace matrix itself: an explicit N:M relation between the hierarchical requirements decomposition and flat code modules. DO-178C explicitly tolerates one requirement → many code units and one unit → many requirements; what it forbids is *unlinked* elements in either direction.

**(c) Cross-cutting / derived / glue — the crown jewel of this cluster.** DO-178C has a precise, deterministic disposition rule for code that traces to no requirement. Every unlinked element must be classified as exactly one of:

1. **Derived requirement** — a real design decision with no parent; you must *write the missing requirement*, mark it "derived", and feed it back to the system safety assessment because it may introduce failure modes the hazard analysis never saw ([DO-178C Wikipedia](https://en.wikipedia.org/wiki/DO-178C), [ee-aero cert guide](https://ee-aero.com/glossary/topic/software-cert/)).
2. **Dead code** — must be removed.
3. **Deactivated code** — allowed to stay but requires explicit justification and protection against accidental activation.

So "glue with no parent" is not an exception to the invariant; it's a forced state transition: either it gets a spec node (derived), or it dies, or it's quarantined with a signed waiver. Untraced code is never allowed to just sit there ([StrictDoc's DO-178 note](https://strictdoc.readthedocs.io/en/stable/stable/docs_extra/DO178_requirements-TRACE.html)). ISO 26262's cross-cutting safety mechanisms (watchdogs, memory protection, redundancy) are handled by giving them their own *technical safety requirements* — the cross-cutting concern is reified as a first-class spec item rather than smeared as an annotation.

**(d) Failure modes.** Traceability rot is the canonical one: manual RTM maintenance degrades the moment requirements change faster than the matrix is updated ([Jama RTM pros/cons](https://www.jamasoftware.com/requirements-management-guide/requirements-traceability/requirements-traceability-matrix-pros-and-cons/)). Empirical studies (26 organisations, 100+ practitioners) find a persistent belief that traceability costs more than it delivers, leading to end-loaded traceability — links created just before the audit, worthless for engineering ([systematic review + industry case study](https://www.researchgate.net/publication/265807397_Requirements_traceability_A_systematic_review_and_industry_case_study), [Gotel & Finkelstein](http://www0.cs.ucl.ac.uk/staff/A.Finkelstein/papers/rtprob.pdf)). The traceability research community's own "Grand Challenge" retrospectives concede that after a decade, link creation and *evolution* remain unsolved ([Grand Challenge v1.0](https://link.springer.com/chapter/10.1007/978-1-4471-2239-5_16), [arXiv 1710.03129](https://arxiv.org/abs/1710.03129), [Cleland-Huang FOSE'14](http://selab.netlab.uky.edu/homepage/publications/2014-ICSE-FOSE.pdf)). N:M link explosion is the standard reason matrices become write-only.

## 2. Docs-as-code traceability tools

**Doorstop** ([repo](https://github.com/doorstop-dev/doorstop)). One YAML file per item, IDs like `REQ001`; documents form a tree via parent-prefix links; everything versioned in git. Coverage linting: items flag "suspect links" when a linked parent's content hash changes — a fingerprint-invalidation mechanism, not just an ID link. Pain points ([OpenRegulatory review](https://openregulatory.com/qms_software/doorstop)): brutal learning curve, "typically maintained by only one developer in an organization"; RTEMS rejected it because links can't carry attributes, so you can't represent multiple overlapping DAGs over the same items ([RTEMS tooling assessment](https://docs.rtems.org/docs/main/eng/req/tooling.html)).

**OpenFastTrace** ([repo](https://github.com/itsallcode/openfasttrace), [user guide](https://github.com/itsallcode/openfasttrace/blob/main/doc/user_guide.md)) — the most directly relevant design in this cluster:

- IDs are `artifact-type~name~revision` (e.g. `dsn~validate-authentication-request~1`). **The revision number is the staleness mechanism**: bumping it voids all existing coverage links, forcing downstream re-verification. Renames are *not* handled — a rename is a delete+create and all coverage breaks (deterministic, but crude).
- Code links back via comment tags: `// [impl->dsn~foo~1]`. Flat code, hierarchical spec — bridged purely by these typed edges.
- The `Needs: impl, utest, itest` field on each spec item declares *which artifact types must provide coverage*, so "every leaf must be covered by exactly these kinds of chunks" is machine-checkable. Reports distinguish shallow vs **deep coverage** (transitively covered) and flag **orphaned** links.
- Cross-cutting/hierarchy mismatch is handled by **coverage forwarding** (`arch --> dsn : req~x~1`): a level that has nothing to add delegates its coverage obligation downward without writing a dummy item. This is a clean answer to "internal nodes don't build anything."

**Sphinx-Needs** ([open-needs](https://open-needs.org/)). Need-objects with IDs inside Sphinx docs; arbitrary typed links; filterable matrices generated at build. Failure mode is scale: O(N) filtering made large projects painfully slow until pre-indexing was retrofitted; monorepo users must split into modular sub-projects ([discussion #1220](https://github.com/useblocks/sphinx-needs/discussions/1220)).

**StrictDoc** ([user guide](https://strictdoc.readthedocs.io/en/latest/sphinx/strictdoc_01_user_guide.html)). Requirements in `.sdoc` files; source traceability via in-code **range markers** plus language-aware (tree-sitter) linking of *functions/classes* to requirements with relation roles ([release 0.8.0](https://github.com/strictdoc-project/strictdoc/releases/tag/0.8.0)). The function-level granularity is the closest existing thing to "chunk = named code element owned by a spec item".

**ReqIF** ([OMG spec](https://www.omg.org/reqif/)) is the cautionary tale for interchange: round-trips between DOORS/DNG/Polarion lose images and tool-extensions ([ReqIF.academy forum](https://www.reqif.academy/forums/topic/reqif-roundtrip-to-doors-ng-problem-with-images/)). Lesson: an ownership map that must survive tool boundaries will rot at the seams; keep it in plain text in one substrate.

## 3. Model-driven engineering codegen

**(a) Identity.** In EMF, every model element gets generated code keyed by its metamodel identity; regeneration is idempotent per element. The `@generated` Javadoc marker is the ownership bit: the generator only overwrites methods still marked `@generated`; delete the tag and the element becomes hand-owned forever. A **per-chunk ownership flag stored in the artefact itself**.

**(b) Hierarchy↔flat.** The generator is a unidirectional projection; nobody pretends the shapes match. Two disciplines keep hand code and generated code apart:

- **Generation Gap pattern** (Vlissides): generated base class + hand-written subclass; generated files never edited, often not committed ([Wikipedia](https://en.wikipedia.org/wiki/Generation_gap_(pattern))). Ownership by *file*, enforced by inheritance structure.
- **Protected regions** (Acceleo): marked blocks inside generated files that survive regeneration. Comparison: protected regions are fragile; generation gap is cleaner but doubles the class count ([practitioner comparison](https://emfmodeling.blogspot.com/2011/10/generation-gap-pattern-vs-protected.html)).

**(c) Cross-cutting/glue.** MDE's honest answer: it doesn't own it. Glue lives in the hand-written half of the gap, invisible to the model. This is precisely where MDE traceability dies.

**(d) Failure modes — well documented.** Round-trip UML↔code failed: "model-code drift" turned diagrams into shelfware; bidirectional incremental transformations never matured ([Round-trip engineering, Wikipedia](https://en.wikipedia.org/wiki/Round-trip_engineering); [Crofts retrospective](https://neil-crofts.medium.com/whatever-happened-to-model-driven-development-ec0175139720)). Hutchinson & Whittle's empirical study (17+ companies) found the failures were as much social as technical — "disparity between those who benefit and those who must do additional work" ([study](https://www.researchgate.net/publication/220266108_Model-driven_engineering_practices_in_industry)). The survivors scaled back: unidirectional generation with a hard generated/hand-written boundary; no round trip.

## 4. Bidirectional transformations / lenses

**The formal shape.** A lens is `get : Source → View` plus `put : View × Source → Source`, with laws guaranteeing round-trips ([Foster et al., TOPLAS 2007](https://dl.acm.org/doi/10.1145/1232420.1232424)). The spec-tree↔artefact problem is *exactly* the asymmetric-lens shape: the artefact-view discards spec structure, and `put` needs the *original source* to restore what the view dropped. Tractability is well characterised: it works when the discarded information is cleanly separable ("constant complement"); it degrades when a view update is ambiguous about which source element it came from.

**The killer finding: alignment is the hard part, and alignment = identity.** Positional `put` corrupts data the moment the view is reordered. Boomerang's **dictionary lenses** fixed this by having the programmer nominate a *key* per reorderable chunk ([Boomerang, POPL'08](https://www.cis.upenn.edu/~bcpierce/papers/boomerang.pdf)). **Matching lenses** generalised this to pluggable alignment strategies ([Barbosa et al., ICFP 2010](https://www.cs.cornell.edu/~jnfoster/papers/matching-lenses.pdf)). **Delta lenses** go further: propagate *edits* (with explicit identity of what moved/renamed) instead of whole states, precisely because state-based diffing can't reliably distinguish "renamed" from "deleted+created" ([Diskin et al.](https://link.springer.com/chapter/10.1007/978-3-642-24485-8_22)). Even the laws are contested — at least 12 competing formulations ([A Tangled Web of 12 Lens Laws](https://link.springer.com/chapter/10.1007/978-3-030-79837-6_11)). The theorem-shaped lesson: **a spec↔artefact sync is only deterministic if chunk identity (keys) is explicit; inferring correspondence from content is where every state-based system loses data.** Terraform's `moved` block and EMF's `@generated` are both ad-hoc rediscoveries of delta-lens alignment.

## 5. Terraform / IaC

**(a) Identity.** Resource *addresses* (`module.net.aws_vpc.main`) are the ownership keys; the **state file** is a persistent spec↔artefact map. Renames would break identity, so Terraform 1.1 added **`moved { from, to }` blocks** — explicit, declarative rename records processed at plan time ([HashiCorp refactoring guide](https://developer.hashicorp.com/terraform/language/modules/develop/refactoring)). The delta-lens insight productised: never infer renames; record them.

**(b) Hierarchy↔flat.** Config is hierarchical (modules); the cloud is flat (resource IDs). The address is a *path* into the hierarchy used as a flat key — the mapping is total and mechanical, and the state file materialises it.

**(c) Unowned / cross-cutting.** Resources not in state are simply **invisible** — plan cannot detect unmanaged "shadow" resources at all ([Scalr drift guide](https://scalr.com/learning-center/terraform-drift-detection-how-to-prevent-and-remediate)). Bringing them under ownership requires explicit `import`. Read-only references to things owned elsewhere use `data` sources — a clean "reference without ownership" primitive.

**(d) Failure modes.** (i) Drift: out-of-band edits diverge state from reality; drift detection never detects missing ownership. (ii) Reconciliation can be destructive: auto-remediating drift has destroyed production databases ([Terracotta drift post](https://blog.tryterracotta.com/terraform-drift-checks/)). (iii) A failed run that doesn't persist state orphans live resources. (iv) `moved` gotchas: exact-address matching only, conflicting `moved` blocks merged from parallel branches produce confusing errors ([Scalr moved-blocks guide](https://scalr.com/learning-center/terraform-moved-blocks-refactoring-without-pain)).

## 6. Other apt systems

**BDD/Cucumber (feature files → step definitions).** Deliberately N:M: steps are meant to be *reused* across features; 1:1 "feature-coupled step definitions" is the named anti-pattern, causing "an explosion of step definitions, code duplication, and high maintenance costs" ([Cucumber anti-patterns](https://cucumber.io/docs/guides/anti-patterns/), [feature-coupled step definitions](https://github.com/martco/cucumber/wiki/Feature-Coupled-Step-Definitions-(Antipattern))). Real-world report: ~1,200 step definitions with copy-pasted one-word variants. Direct warning: forcing 1:1 leaf↔chunk on inherently shared behaviour reproduces this anti-pattern — shared glue wants to be a library owned by *no* leaf, referenced by many.

**ReqToCode (2026, arXiv).** Proposes "Traceables": *generated, language-native code elements* representing single requirements, referenced from implementation/tests so links are compile-time-checked, with graduated staleness signals (deprecation warning → build failure) when a requirement changes ([arXiv 2603.13999](https://arxiv.org/html/2603.13999)). Make the spec item a symbol the compiler resolves, and rot becomes a build error.

**CODEOWNERS.** A flat path→owner manifest; last-matching-rule wins. Known failure: files are "incomplete, stale, or not enforced at the branch-protection level — making them documentation rather than gates" ([Aviator](https://www.aviator.co/blog/code-reviews-at-scale/), [Expedia's "Owning Your CODEOWNERS"](https://medium.com/expedia-group-tech/owning-your-codeowners-file-332e288c1d12)). Lesson: an ownership map that isn't a *gate* is dead weight within months.

## Transferable ideas (Report B)

1. **The DO-178C three-way disposition rule for unowned chunks.** Any artefact chunk with no owning leaf must be deterministically classified: derived (mint a spec node, surface to the parent for risk review), dead (delete), or waived (keep with recorded justification). Makes "enforce ownership deterministically" a closed decision procedure. *Risk:* ceremony inflation — solo, the "mint a derived node" path becomes a rubber stamp that launders glue into noise nodes.
2. **OpenFastTrace's `needs` + coverage forwarding + revision-voiding.** Each spec node declares which artifact types must cover it; internal nodes *forward* their coverage obligation to children (matching only-leaves-build); bumping a node's revision deterministically voids all coverage links. *Risk:* revision-voiding is all-or-nothing — people respond by not bumping revisions; Doorstop's content-hash "suspect link" is the softer alternative.
3. **Terraform-style ownership state + explicit `moved` records.** Keep the leaf↔chunk map as a materialised state file, and require an explicit `moved {from, to}` record on renames — never infer renames from diffs. *Risk:* state drift the moment an edit path bypasses the map; detecting *unmanaged* chunks requires a separate full-scan lint.
4. **Generation-gap file discipline instead of chunk-level markers.** Make ownership *structural*: one leaf ↔ one file. Cross-cutting metadata treated as *generated* from the leaves. *Risk:* the residue that can't be generated or partitioned is exactly where the pattern historically leaked; enumerate and waive it explicitly, not ignore it.
5. **ReqToCode's "spec item as compile-time symbol" / staleness as build failure.** *Risk:* annotation fatigue; per-chunk annotations recreate the N:M matrix file-level discipline was meant to avoid. Pick one granularity and gate it.
6. **Deliberate shared-glue escape hatch (from BDD).** Explicit library/glue nodes that own reusable internals; leaves may call but not modify. *Risk:* the glue node becomes a junk drawer; needs a size lint and periodic re-homing.

## Recurring gotchas (Report B)

- **Rot is the default state.** Only maps that are *gates* stay true.
- **Renames are the universal identity killer.** Every mature system converges on explicit, recorded move/rename edits.
- **N:M creep.** The stable designs *reify* the shared thing as its own first-class item rather than tolerate matrix explosion or misfile glue.
- **The two-owner boundary must be mechanical, not conventional.** Protected regions leak; whole files and compile-checked symbols hold.
- **Round-trip sync is a tar pit.** Keep one direction authoritative; make the reverse *detection + forced disposition*.
- **Reconciliation can be destructive.** Graduated signals (warn → fail → human decision) beat auto-fix.
- **Sociotechnical asymmetry kills adoption** (Hutchinson & Whittle). Solo with LLM agents this inverts favourably — the agent can be *made* to pay the bookkeeping cost on every dispatch — arguably the strongest reason the invariant is more viable for Doktoreltern than it was historically.

---

# Report C — ownership maps, desired-state reconciliation, cross-cutting decomposition

Framing used throughout: **spec tree = desired-state hierarchy; artefact = actual state with a different shape; the candidate invariant is a bijection leaf↔chunk.**

## 1. Kubernetes: ownerReferences and server-side apply field ownership

**(a) Mechanisms, two granularities.**

- *Object-level*: every dependent object carries `metadata.ownerReferences` pointing at its owner; the garbage collector deletes dependents when the owner goes ([Owners and Dependents](https://kubernetes.io/docs/concepts/overview/working-with-objects/owners-dependents/)).
- *Field-level*: server-side apply (SSA) tracks, in `metadata.managedFields`, **which field manager owns which individual fields of one object**. Multiple actors each own disjoint fields of the same object; the API server maintains the ledger, not the clients ([Server-Side Apply](https://kubernetes.io/docs/reference/using-api/server-side-apply/)). The closest existing thing to "several spec leaves own disjoint chunks of one artefact file" — and crucially the ownership map is **first-class server-side metadata recomputed on every write**, not a manually maintained manifest.

Conflicts are explicit: applying a field another manager owns returns an error; the applier may back off, adopt the current value (co-owner), or `--force-conflicts`, which overwrites and **transfers ownership away** ([oneuptime SSA field ownership](https://oneuptime.com/blog/post/2026-02-09-server-side-apply-field-ownership/view)).

**(b) Shape mismatch.** Many-specs-to-one-object: a Deployment spec, an HPA, and a mesh injector all write into the same Pod template. SSA's answer to non-isomorphism is not to force one owner per object but to **shrink ownership granularity until disjointness holds again** (fields, list items via merge keys).

**(c) Cross-cutting.** Shared fields get *co-ownership*; defaulted fields are owned by nobody until someone applies them; cross-namespace owner references are simply banned.

**(d) Failure modes.**

- *Omission = relinquish = delete.* SSA requires "fully specified intent": if a manager omits a field it previously applied, it stops owning it, and if no one else owns it the field is **deleted** — a documented counterintuitive trap ([D2iQ write-up](https://eng.d2iq.com/blog/conflict-resolution-kubernetes-server-side-apply/)).
- *Force-conflict churn*: two controllers that both force ownership continually undo each other ([Argo CD SSA conflicts](https://oneuptime.com/blog/post/2026-02-26-argocd-server-side-apply-conflicts/view)).
- Tooling has set wrong ownership in `managedFields` ([kubectl #1337](https://github.com/kubernetes/kubectl/issues/1337)).

**Lesson vs file-level:** field-level ownership works because (i) the substrate defines a canonical merge structure, (ii) the ledger is machine-written on every mutation, (iii) conflict is an error, not silent last-write-wins.

## 2. Build-system target ownership: Bazel/Buck and Nix

**(a)** Bazel enforces exactly the wanted invariant — **deterministically** — but only for *generated* files: no two targets may produce the same output file; "the files generated by a rule always belong to the same package as the rule itself" ([Bazel build-ref](https://bazel.build/concepts/build-ref), [visibility](https://bazel.build/concepts/visibility)). Enforcement is trivial because outputs are declared in the build graph and checked at graph-construction time. Nix goes further: a derivation (hash of the full recipe) owns its store paths; identity *is* the hash, so two specs cannot collide on an output by construction ([Nix derivation manual](https://nix.dev/manual/nix/2.34/store/derivation/), [Tweag on content-addressed outputs](https://www.tweag.io/blog/2021-02-17-derivation-outputs-and-output-paths/)).

**(b)** Bazel deliberately allows many fine-grained targets per directory; the "1:1:1 rule" is a convention some ecosystems adopt and others reject. Fine granularity buys caching and minimal re-runs but costs constant BUILD-file upkeep ([Wix migration experience](https://medium.com/wix-engineering/migrating-to-bazel-from-maven-or-gradle-part-1-how-to-choose-the-right-build-unit-granularity-a58a8142c549)). Practitioner consensus: hand-maintained fine-grained maps rot; the mapping is maintained by *tools* (gazelle-style generators).

**(c)** Cross-cutting handled by **aggregator targets**: filegroups, roll-ups, packaging rules that consume many targets' outputs and own the combined artefact. Nobody assigns a shared file to one "real" leaf; a dedicated derived node owns it with provenance on its inputs.

**(d)** The invariant only holds inside the generated zone; checked-in sources are outside it. One-owner-one-artifact constraints get *stricter* as addressing gets more content-based. Granularity upkeep is the perennial complaint.

## 3. CODEOWNERS and OWNERS manifests

**(a)** Declarative path-pattern → owner map, separate from the artefact, file/directory granularity. GitHub semantics: **last match wins** — a broad `*` rule silently overridden by any later, more specific rule; the single most common trip-up ([koalr guide](https://koalr.com/blog/github-codeowners-guide)). Google's per-directory OWNERS files gate approval hierarchically ([CACM monorepo paper](https://cacm.acm.org/research/why-google-stores-billions-of-lines-of-code-in-a-single-repository/)).

**(b)** The org chart (a tree) mapped onto the source tree via patterns; the mismatch is absorbed by pattern precedence. Never achieves disjointness; achieves *a* deterministic resolution order.

**(c)** Docs, security policy, top-level configs "don't fit one team's box": one owner creates a bottleneck, no owner invites rot. Practice is fallback catch-all owners plus coverage measurement ([measuring coverage](https://til.codeinthehole.com/posts/how-to-measure-codeowner-coverage-within-a-large-repo/)).

**(d)** *Silent failure of the map itself*: typo'd team names don't error, they just fail to assign; owners without write permission are silently ignored. *Declared-vs-actual drift*: written ownership records "considered out of date and ignored"; different ownership approximations agree on only 0–40% of developers ([arXiv 2408.12807](https://arxiv.org/pdf/2408.12807)); weak ownership correlates with defects ([Bird et al., Microsoft](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/ownership.pdf)). The map is advisory unless separately enforced.

## 4. FOSD, delta-oriented programming, AOP, MDSOC — the direct theoretical precedent

This cluster is *exactly* the Doktoreltern problem, studied for 25 years, and its history is a warning.

**(a)** Feature-Oriented Software Development composes a product from feature modules by **superimposition**: each artefact parsed into a Feature Structure Tree, merged by matching nodes on name/type recursively; FeatureHouse did this language-independently ([Apel, FeatureHouse ICSE'09](https://www.infosun.fim.uni-passau.de/cl/publications/docs/ICSE2009fh.pdf)). Delta-oriented programming generalises: each feature is a *delta* (add/modify/remove) applied in order ([Schaefer et al.](https://link.springer.com/chapter/10.1007/978-3-642-15579-6_6)). AOP uses pointcuts to inject cross-cutting behaviour. Ownership granularity is **declaration-level** (class, method, field) — the literature explicitly found statement-level granularity breaks superimposition ([FeatureHouse experience report](https://www.researchgate.net/publication/255566456_Language-Independent_and_Automated_Software_Composition_The_FeatureHouse_Experience)).

**(b)** FOSD's core admission: the feature tree and the program's class structure are **non-isomorphic by nature**, so a feature's contribution is a *scattered slice* across the artefact. Tarr & Ossher named the disease the **"tyranny of the dominant decomposition"**: any single hierarchy privileges one concern dimension and scatters all the others ([N Degrees of Separation, ICSE'99](https://dl.acm.org/doi/pdf/10.1145/302405.302457)). The **expression problem** is the formal kernel: rows = data cases, columns = operations; *no single tree modularises both dimensions* ([Wadler 1998](https://homepages.inf.ed.ac.uk/wadler/papers/expression/expression.txt), [Bendersky's survey](https://eli.thegreenplace.net/2016/the-expression-problem-and-its-solutions/)). This is a proof-shaped objection to a strict leaf↔chunk bijection: it *is* a dominant decomposition, and some future spec change will cut across it.

**(c)** Cross-cutting is the entire raison d'être: features/aspects/deltas are first-class owners of scattered contributions; the composed artefact is generated; provenance lives in the composition trace.

**(d) What became of it.** IBM's Hyper/J and the Concern Manipulation Environment "have not seen wide use" ([Wikipedia AOP](https://en.wikipedia.org/wiki/Aspect-oriented_programming)); AspectJ survives only in niches. Documented reasons: **fragile pointcuts** (name/structure matches silently break under refactoring — pointcut power "sacrifices uniqueness of coordinates," [DOP-vs-AOP analysis](https://dev.to/canonical/delta-oriented-programming-from-the-perspective-of-reversible-computation-2oke)); reasoning about N-way composition order; tooling/debugging opacity (you can't read the code that runs); SPL adoption stalled on tooling ([PhaDOP](https://www.sciencedirect.com/science/article/abs/pii/S2590118424000261)); superimposition failing below declaration granularity ([Kästner/Apel FOSD survey](https://www.cs.cmu.edu/~ckaestne/pdf/gttse11.pdf)). The research program was *technically right* about non-isomorphism and still failed on ergonomics — the composed artefact stopped being the thing developers read and edited.

## 5. GitOps reconciliation loops: Argo CD, Flux, prune and drift

**(a)** Desired state in git; a controller diffs desired vs actual and reconciles. Flux stamps labels and keeps an explicit **inventory** of applied object references in `.status.inventory` — pruning deletes exactly (inventory − current-source) ([Flux Kustomization docs](https://fluxcd.io/flux/components/kustomize/kustomizations/)). Argo CD moved from label-based tracking to an **annotation `tracking-id` embedding the resource's own group/kind/namespace/name**, because the shared well-known label collided with other tools that also set it ([Resource Tracking docs](https://argo-cd.readthedocs.io/en/latest/user-guide/resource_tracking/)).

**(b)** Git repo layout ≠ cluster layout; identity is attached to the *rendered artefact*, not inferred from repo position.

**(c)** Two Applications claiming one resource ⇒ `SharedResourceWarning`, flip-flopping sync ([Argo discussion #8545](https://github.com/argoproj/argo-cd/discussions/8545)); prune exemption annotations exist; cluster-wide shared things (namespaces, CRDs) are the standing headache — usual answer is a dedicated "platform" Application owning them.

**(d) Prune is where wrong ownership maps kill.**

- Argo CD **pruned a ServiceAccount still present in the repo**, triggered by an unrelated PR — automated prune + imperfect tracking = deleted Cluster Autoscaler credentials ([argo-cd #14090](https://github.com/argoproj/argo-cd/issues/14090)).
- Default posture everywhere is *prune off* or *prune with confirmation* (`Prune=confirm`); emerging doctrine: "deletion is a privileged runtime operation, not sync with extra steps" ([platform-notes on Argo 3.3](https://platform-notes.com/blog/argocd-3-3-gitops-deletions-safer/)).
- Moving a resource between owners is a documented danger zone in Flux: remove from the old Kustomization with prune protection first, or the old owner GCs it out from under the new one.

## 6. Declarative schema migration, Terraform identity, Unison

**Atlas/Prisma (schema as spec, diff as plan).** Atlas supports *versioned* migrations (hand-owned delta files) and *declarative* (tool diffs current vs desired and generates a plan), with a plan/approve/apply workflow explicitly modelled on Terraform ([declarative vs versioned](https://atlasgo.io/concepts/declarative-vs-versioned)). The mature pattern is **hybrid**: declarative while iterating locally, then freeze the diff into a versioned, reviewed delta at the team boundary — desired-state for exploration, owned deltas for anything applied to state you can't regenerate.

**Terraform `moved` blocks.** Resource identity is its **address in the config tree**; renaming or re-nesting changes the address, and without an explicit `moved { from, to }` mapping Terraform plans a **destroy-and-recreate** ([refactoring docs](https://developer.hashicorp.com/terraform/language/modules/develop/refactoring)). The sharpest available answer to "what happens to leaf-owned chunks when the spec tree is restructured": position-derived identity is fragile, so refactors must ship *explicit identity-migration declarations*, validated at plan time.

**Unison — identity divorced from layout entirely.** Definitions are content-addressed typed ASTs; names are metadata over hashes; the codebase is a definition graph, not files ([the big idea](https://www.unison-lang.org/docs/the-big-idea/)). Renames and moves can't break anything because *position was never identity*. The non-isomorphism problem dissolves: the spec tree and any file layout are both just name-spaces over the same hash-identified chunks. Cost: the whole toolchain (VCS, diff, review) must be rebuilt around the database; a decade in, adoption remains niche.

**Requirements traceability matrices (cautionary baseline).** Manually maintained trace links "drift out of sync within weeks"; past an inflection point maintenance burden kills the practice unless links are created automatically as a by-product of the workflow ([Jama pros/cons](https://www.jamasoftware.com/requirements-management-guide/requirements-traceability/requirements-traceability-matrix-pros-and-cons/), [Ketryx agile RTM](https://www.ketryx.com/blog/best-practices-for-maintaining-a-requirement-traceability-matrix-in-agile)).

## Transferable ideas (Report C)

1. **Machine-written ownership ledger, SSA-style, at sub-file granularity.** Don't hand-maintain a build map; have the apply/commit path record which leaf last wrote which chunk (declaration granularity, per FOSD). Conflict = hard error with an explicit force that *transfers* ownership and logs it. *Risk:* only sound if every write goes through the machinery — one out-of-band edit and the ledger lies; needs a linter that diffs ledger vs artefact.
2. **Inventory-based, confirmation-gated pruning.** Each leaf's dispatch record lists exactly the chunks it produced; "spec node deleted ⇒ delete its chunks" computed from inventories, never pattern-matching; deletion is privileged and human-confirmed. *Risk:* even inventory systems mis-prune under races/renames (Argo #14090); never auto-prune anything expensive to rebuild.
3. **Aggregator nodes own cross-cutting artefacts; leaves own contributions.** For an R package, DESCRIPTION/NAMESPACE should be **derived outputs of a deterministic collator** over facts each leaf declares (NAMESPACE via roxygen already works exactly this way — the ownership unit is the `@export` tag in the leaf's chunk, not the file). *Risk:* the collator becomes a god-node hiding real design decisions (version bumps, license) that do need a human owner — split "computed from leaves" fields from "architect-owned" fields explicitly.
4. **`moved` blocks for spec-tree refactors.** Require explicit `from → to` identity mappings checked at plan time; absence surfaces as "will delete chunk X and create chunk Y" rather than silently doing it. *Risk:* forgetting one is silent destroy/recreate — make the planner flag any delete+create pair with high content similarity as a suspected missing move.
5. **Weaken the bijection to "disjoint field-set cover," not one-chunk-per-leaf.** SSA's deep insight: when spec and artefact are non-isomorphic, keep *disjointness* (no chunk has two owners) but drop *one-chunk-per-owner* (a leaf may own a scattered set of chunks across files). Disjoint-cover is checkable deterministically; bijection with the artefact's flat shape is not achievable without fighting the tyranny of the dominant decomposition. *Risk:* scattered ownership sets are harder for humans to hold in mind; mitigate with a generated per-leaf "what I own" view.
6. **Hybrid declarative/versioned application (Atlas).** The leaf's spec is declarative, but every spec→artefact application is materialised as a reviewed, recorded delta. *Risk:* drift if deltas are ever hand-edited after generation; the delta must be derived, never authored.

## Recurring gotchas (Report C)

- **Wrong-owner garbage collection is the universal catastrophic failure.** Any auto-delete driven by an ownership map must assume the map is sometimes wrong.
- **Hand-maintained ownership maps rot on a timescale of weeks.** Only ledgers written as a side-effect of the write path stay true.
- **Validate the map itself, not just the artefact.** Silent no-ops are worse than errors; the map needs its own linter.
- **Precedence semantics surprise humans.** Prefer *conflict-is-an-error* over any silent precedence.
- **Granularity has a sweet spot: the declaration.** File-level too coarse (bottleneck owners, shared files); statement-level too fine (superimposition and pointcuts break).
- **Identity-by-position is fragile; every mature system decouples identity from location** — content hashes (Nix, Unison), embedded tracking-ids (Argo), explicit moved declarations (Terraform). If chunk identity is "path in the spec tree," tree refactors become artefact rebuilds unless moves are first-class.
- **Deterministic enforcement is only cheap for generated artefacts.** The more of the artefact that is derived from leaf declarations, the more of the invariant you get "for free"; hand-edited zones need the ledger + linter instead.
- **The strict single-tree ownership dream has been tried and it stalled.** MDSOC/Hyper/J/FOSD correctly diagnosed that no single decomposition fits both structure and behaviour, built composition machinery to escape it, and still failed on tooling ergonomics. Take the diagnosis (expect N:M pressure at cross-cutting points; design an explicit escape hatch), skip the cure (full superimposition composition).
