# Leitstand as modules: a thinking note

2026-10-06. Written after the panel, on Robin's prompt: the rewind and checkpoint system is useful
with no fixed flow, so the flow should be a layer on top; think about what can be modular and what
can be taken from others. Nothing here is decided. Sources: the seven reviews (`reviews/`),
`research/doktoreltern-design.md`, `research/doktoreltern-prior-art.md`,
`research/sampletidy-port.md`.

## 1. The cut

The cleanest seam the prior art found is between "which work to do next" and "keep it running".
That is Robin's line too. Below it sits a base that knows nothing about builds. Above it sits a
flow that can be swapped.

| Module | Job | Knows about | Useful alone |
|---|---|---|---|
| **A. Rewind** | Mark a point in a live session; later return to it and submit some text | Claude Code only | Yes |
| **B. Store** | Typed items in files, one writer, lint, and a pure `render` of any scope to text | Nothing | Yes |
| **C. Consent** | Which items the agent may change and which need Robin | The store | With B |
| **D. Gates** | One command per check; exit 0 met, 1 deviation, 2 tool fault; full output on disk | The project's language, via stellwerk | Yes (exists) |
| **E. Workers** | Task in; a diff we compute, evidence and a verdict out | A skill, a model | Yes |
| **F. Flow pack** | The order of steps, the item kinds it needs, the rules card, which skill and gate serve each step | A to E | No: this is the swappable part |
| **G. Watch** | Status line, heartbeat, notify, relaunch | A | With A |

**The rule that keeps it modular:** a lower module never names a higher one. Rewind does not know
there is a store. The store does not know there is a build. Only the flow pack names units,
audits, slices or skeletons.

## 2. Each module, its contract, and what to take

### A. Rewind

- **Contract: two verbs.** `mark <name>` records the current message. `rewind <name> --then
  <command>` returns to it and submits whatever the command prints. Nothing else crosses.
- **Alone, it replaces "checkpoint and I'll compact".** At a context threshold the mod asks the
  model for a handover note, rewinds to the mark, and submits the note. No store, no flow. This
  is usable in any long session, including ones like this.
- **With a store,** `--then` is `render`. With a flow, the flow decides where the marks go.
- **The route sits behind the two verbs.** Route F today; route A, a program on the SDK, or Robin
  typing `/compact` by hand are substitutes. This is what contains the risk of early-access mods.
- **Taken from others: the parts only.** Claude Code has an interactive `/rewind` and the SDK has
  `forkSession`; nothing lets a program return a live session to a named mark and submit text.
  (The module needs a name that does not collide with `/rewind`.) One warning does apply: rules dropped at a compaction were broken 30 to 38% of the time afterwards
  in one study, so the rules card must be inside every rewound context.

### B. Store

- **Contract:** `put`, `get`, `lint`, `render(scope) -> text`. `render` is a pure function of the
  files. Every write is validated first and is one git commit.
- **The item kinds are data, not code.** A flow pack ships a small schema file naming its kinds
  and fields. The tool stays generic. This is the main modularity decision in the note, and it
  has a known hazard: Doktoreltern's marker language grew to 17 kinds and 1,172 lines and was
  named its largest liability. Every scheme that survived had three to five kinds. So a pack is
  capped at five.
- **Taken from others:**
  - doorstop: one file per item, and **suspect links**. A child stores its parent's fingerprint;
    change the parent and every test and plan entry built on it is flagged until re-checked.
  - OpenFastTrace: the grammar linking a spec item to its tests, proving cover. About 200 lines.
  - beads: the edge names only (`blocks`, `parent`, `discovered-from`, `supersedes`).
  - Doktoreltern's `ctx`: validated write with a commit per write, immutable per-dispatch
    records, serving the ancestor path and not the whole tree, and the **askability rule**: a
    reset is safe only if the store provably carries everything a decision needs. That is the
    panel's cold-reader test, reached independently.
- **Reuse `ctx` itself?** Its store, lint and serving are about 1,000 lines and its 361 tests
  pass, but the validated write and the linter both call the 1,172-line marker module that is
  meant to be left behind. Also against: integer ids, R-science vocabulary, Python. A
  fresh small tool copying its shape looks cheaper than untangling it. Unsettled.

### C. Consent

Doktoreltern did not end up with "free nodes and core nodes". Its design (never built, and
enforced there only by a judgement check) ended with something better:
**consent attaches to what the human decided, and is derived.** Every item Robin signed or ruled
on is his; the rest is the agent's.

- Each item has `owner = robin | agent`. Signing a spec item, or answering a question, sets it.
- The agent may add or change agent-owned items freely and reports them at the end.
- A change to a Robin-owned item is refused by the store, which files a question and parks only
  the work that depends on it. Other branches keep going.
- Doktoreltern chose a judgement check here and noted that "a judgement check can miss". With one
  writer, the mechanical version costs a field and a refusal.

This also answers the panel's sharpest disagreement (what happens when the spec is silent):
silence is filled by an agent-owned item, visible in the report; contradiction of a signed item
stops for Robin. It needs no separate rule.

### D. Gates

- Already separate (stellwerk), and already Robin's rule: no language in the tool.
- **Add an oracle gate.** Declare an existing implementation as the reference; record its outputs;
  compare with a stated normaliser. sampleTidy's R version is the oracle for a port; after a
  port, the previous release is.
- **Taken from others:** seeded-defect calibration (show each gate a known-bad input and require
  it to fail; werkbank's canaries never passed by their own rule in 13 runs), protected baselines (expected values live
  outside the agent's write scope and are hashed), the dbt result-file shape, diff-scoped
  mutation only.

### E. Workers

- **Contract:** a task file and a working directory in; a diff computed by us, an evidence log
  and a verdict out. The worker's own account of what it did is never the record.
- Skills are borrowed and pinned (superpowers, compound-engineering, built-in reviews). A second
  model family later is one more runner behind the same contract.
- **Worth a spike:** Claude Code's scripted workflows as the way to run a multi-agent step. The
  fan-out happens in a script, so the orchestrator's context grows by one result, not by every
  worker's hand-back.

### F. Flow pack

A pack is four small things: a schema (its item kinds), a rules card, a step table (step, skill,
gate, where the marks go, what `render` scope follows), and its write scopes. Candidates:

| Pack | For | Shape |
|---|---|---|
| none | Any long session | Rewind and a handover note |
| notes | Research, scoping (this session) | Rewind, store with questions and findings |
| port-with-oracle | sampleTidy to another language | Skeleton, then one slice at a time, each closed by the oracle gate |
| skeleton-then-widen | New work | Interfaces as code, one real path, then slices |

werkbank's lesson is that flow logic in code grows without limit. A pack holds no code. If a pack
needs a new refusal, that is a sign the flow is wrong, and the answer is to change the pack.

### G. Watch

Status line, heartbeat, notify, and a bounded relaunch. It reads; it never chooses work. It
belongs with A because it is needed the moment a session runs unattended, flow or no flow.

## 3. What this changes in the draft

- **The first thing built is A, then B and C.** Each is useful on its own within days, on work
  Robin already does. The flow comes last and is the cheapest part to get wrong.
- **The two hypotheses separate cleanly** (the Bar Raiser's point). A to C test "can a model run
  long without Robin minding its context". A pack tests "does this flow produce output he
  trusts". Either can fail without sinking the other.
- **The implementation language of the tool is a free choice.** It is a few thousand lines of
  file handling. Rust was chosen for the software Leitstand builds, and that question is now
  open too (section 4).
- **The redraft's §4 text mostly survives** as modules A, B and G. Its guards move: the store's
  refusals are C; write scopes belong to the pack.

## 4. Things to sit with

- **Residency.** A measurement on werkbank v2, which Doktoreltern v1's driver was designed
  against, argues against a resident orchestrator: 837
  turns, about 75% of spend, cost growing with the square of turns. Rewind is the answer on
  offer (F1: 78.7k tokens read from cache, 0.2k written, per reset), but it has not been shown
  over a real build, and it does nothing about plumbing turns. Module A is the cheapest way to
  find out.
- **Schema as data** may be more generality than one user needs. The alternative is two or three
  fixed kinds (item, task, note) and no schema file.
- **Language for sampleTidy.** The survey's view: a full Rust port is the riskiest option (units,
  legacy `.xls`, and Robin cannot read it), a bounded typed core is defensible, and port and new
  features compete. Two small spikes would inform it. If the tool is language-free, this
  decision can wait until the tool exists.
- **Whether the flow needs a table at all,** or whether a rules card and a skill are enough for a
  model orchestrator. werkbank v3 says prose rules decay; the reset re-plants them. Untested.
- **Doktoreltern's scheduler** (work on the least certain, most depended-on thing first) is the
  one idea there with no counterpart here. It is unproven and untuned. As a habit in a rules
  card it costs nothing; as code it is a second driver.
