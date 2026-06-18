# #24 context substrate — specification (rev-6 design)

Specifies what the context substrate must do to support the workflow in
`workflow-redesign.md` (rev 6). **Base grammar** (emoji-sigil markers, line
anchoring, inline/block forms, fence/blockquote suppression, NFC normalisation,
the round-trip property) is unchanged — see `markers.md`, which stays the spec of
the *implemented* `ctx_core.py`. This doc is **spec ahead of code**: when a
section here is implemented, fold it into `markers.md` and delete it here.

Three new capabilities over the current core:

1. **Keyed markers** — tracked items with a stable id and evolving status
   (§2–§3).
2. **The fold** — read model is the *latest comment per kind/key*, across an
   ordered comment stream, not the issue body alone (§4).
3. **New vocabulary** — gauges, seal, artefact (§5).

---

## 1. From bodies to a comment stream

`collate()` currently parses `node.body`. Under rev 6 the living content is an
**append-only comment stream** and nothing is edited. The fetch adapter must
therefore supply, per node, its comments **in creation order**:

```
Node(number, body, comments: list[Comment], state, state_reason, labels)
Comment(seq: int, text: str)        # seq = creation order, 0 = the body/stub
```

The body is `seq == 0` (the write-once stub). `parse()` is unchanged (it parses
one text); the **collator folds across `[body] + comments`** in `seq` order.

## 2. Keyed markers

Some markers are *tracked items* carrying a stable id and a status that evolves
over later comments. Kinds and ids:

| kind | key prefix | what | status set (default first) |
|------|-----------|------|----------------------------|
| question | `q` | an open design question | `open` → `answered` |
| validation | `v` | a validation requirement | `open` → `met` / `unmet` |
| alternative | `alt` | a considered option (the ledger) | `proposed` → `rejected` / `viable` / `chosen` |
| dead-end | `de` | a tried-and-rejected path | `closed` (→ `revived`) |
| future | `fd` | a declared future direction | `declared` → `activated` / `dropped` |
| optimisation | `opt` | a known, deferred optimisation | `declared` → `done` / `dropped` |
| artefact | `art` | a reference to a cached artefact (§5.3) | `live` (→ `stale`) |

**Id format:** `#<issue>.<prefix><n>`, e.g. `#16.q4`. `n` is a monotonic integer
per `(issue, prefix)`. Ids are **always written in full** (issue-qualified) so a
comment in any issue can reference one greppably.

## 3. Keyed-marker value grammar

A keyed marker reuses the base production `<emoji> <Keyword>: <value>`; the
**value** is structured:

```
value      := <id> [ <status> ] [ <free-text> ]          # inline
id         := #\d+\.[a-z]+\d+
status     := one bare word from the kind's status set (else omitted ⇒ default)
free-text  := the remainder of the line (inline) or the blockquote (block)
```

**Block form for keyed markers:** the base rule triggers block form on an *empty*
inline value. Extend it: block form also triggers when the inline value is **only
an id (+ optional status)** — the following blockquote is the `free-text`. This is
how a detailed dead-end/artefact keeps its id inline and its body in the quote.

Examples (declaration, then a later comment that supersedes by id):

```
❓ Question: #16.q4 open Is foo correct when bar obtains?
…later comment…
❓ Question: #16.q4 answered Yes — foo holds when bar; see #16.art2

⚖️ Alternative: #16.alt1 rejected censored data breaks it (X)
…later comment…
⚖️ Alternative: #16.alt1 viable our data is uncensored, so X is moot

🪦 Dead-end: #7.de1
> Tried FFT convolution; padding to next pow2 dominated at n<512.
```

`render()` round-trips a keyed marker: `<emoji> <Kw>: <id> <status> <text>` (or
block when the text is multi-line / the kind is canonically block).

## 4. The fold (read model)

The MCP never returns raw streams. It returns a **folded view**:

- **Unkeyed markers** (relations, gauges, seal): the **latest comment** bearing
  that *kind* wins (gauges/seal are single-valued per node; relations like
  `Part-of` are a set — latest comment that carries them replaces the set).
- **Keyed markers**: group by `id` across the stream in `seq` order; the **last
  occurrence is current**. Earlier occurrences are history (served only on
  explicit request).

Derived views the fold produces:

- **current design / plan** = latest `Design`/`Plan` *typed comment* (typed
  comments are §6 of the design doc; a comment's type is its own marker,
  `Type: design|plan|construction`).
- **registries** = all current keyed items of a kind across the tree, filterable
  by status: dead-ends (`de`), future-directions (`fd`), optimisations (`opt`),
  alternatives (`alt`). These feed the accuracy/speed passes.
- **confidence input** = resolved fraction = `answered(q) ∪ met(v)` / total, per
  node. (The gauge marker may also be set explicitly; the MCP surfaces both.)
- **dormant nodes** = `state == closed and "dormant" in labels`. Excluded from
  the active frontier, the floor, the fold of *active* structure, and centrality;
  **included** in the `fd`/`opt` registries (a dormant node is an activatable
  item). Activation = reopen.

**Checkpoints (length bound):** a `Checkpoint:` comment declares "current state of
keys `#…` as of seq N" so the fold can start from the latest checkpoint rather
than `seq 0`. Emitted at ~the gh comment-pagination boundary (≈100) and on
settle. (Mechanics — exact payload — are part 2.)

## 5. New vocabulary (extends `markers.md`)

### 5.1 Gauges (unkeyed, single-valued, folded latest-wins)

| emoji (TBD) | keyword | value set |
|-------------|---------|-----------|
| 🧭 | `Confidence` | `low` \| `tentative` \| `high` (coarse ordinal) |
| 📊 | `Fidelity` | `stub` \| `interface` \| `mock` \| `correct` |

Fidelity of a parent is *folded* from children (default: min over load-bearing
children); the marker records a node's *own* level, the MCP computes the rolled-up
one. The fold rule is a config field, so a weighted scheme can replace `min`
later.

### 5.2 Seal (unkeyed, folded latest-wins, default sealed)

```
🔒 Seal: sealed @rjs 2026-06-16
🔓 Seal: unsealed @rjs 2026-06-16
```

Value = `sealed|unsealed` + who + when. **Default is sealed**, inherited from the
parent when no marker is present; `unsealed` delegates the subtree; a later
`sealed` re-claims a node. The MCP computes each node's effective seal state from
its own latest `Seal` marker else its nearest sealed/unsealed ancestor.

### 5.3 Artefact (keyed `art`, block form; issues stay primary)

```
🗄️ Artefact: #16.art1
> what: fitted SSD posterior (10k draws)
> how:  Rscript scripts/fit_ssd.R --seed 42
> cache: tmp/art/<sha>.rds
```

The issue is the source of truth: the marker says *what it is, how to recreate it,
and where it's cached*. `tmp/` is a disposable, gitignored/buildignored,
size-bounded LRU cache; a missing artefact is recreated from `how`. (Cache layout
/ GC mechanics — part 2.)

## 6. Implementation deltas to `ctx_core.py`

Scoped so the pure-core stays pure and tested:

1. **Kinds** — add `QUESTION, VALIDATION, ALTERNATIVE, FUTURE, OPT, ARTEFACT,
   CONFIDENCE, FIDELITY, SEAL, TYPE, CHECKPOINT`; extend `_VOCAB` (glyph, keyword,
   parser, block-only). `DEAD_END` becomes **keyed**.
2. **Keyed value parser** — `_parse_keyed(kind)` → `Keyed(id, status, text)`;
   validates `id` regex and `status ∈ kind.status_set` (else a `parse` Finding).
3. **Block-form trigger** — extend to fire on "id-only (+status)" inline value.
4. **`Node`** — add `comments: list[Comment]`; **`collate()`** folds over
   `[body]+comments` in `seq` order (latest per kind / per key wins) and builds:
   `gauges`, `seal_state` (with ancestor inheritance), `registries[kind]` (current
   keyed items by status), `confidence_inputs`, `dormant: set[int]`.
5. **New checks** (continue `I9`+):
   - `I9` keyed-id well-formed and **unique on declaration**; every later use of
     an id has a prior declaration.
   - `I10` every cross-reference id resolves to a declared item.
   - `I11` gauge / seal / status values are in their allowed sets.
   - `I12` a `dormant`-labelled node is `closed`; an `fd`/`opt` that points at a
     node and that node's dormancy agree.
   - `I13` rolled-up fidelity consistency (a node ≥ `correct` ⇒ load-bearing
     children ≥ `correct`).
6. **`render()`** — keyed + new kinds, preserving the round-trip property
   (`parse(render(m)).markers == [m]`), including id/status.

The MCP serving API (folded views, ancestor-path assembly, history-on-request),
the checkpoint payload, and the artefact cache layout/GC are **part 2** of this
spec.

## 7. What's deliberately not here yet (part 2)

- MCP serving API surface (current-design, ancestor-path, registry, history).
- Checkpoint/consolidation comment payload + trigger details.
- Artefact cache directory layout, content-addressing, GC policy.
- Aspect-contract representation + the linter check that members honour it.
- Transcript distiller (presentation-text) + the spirit-check harness.
