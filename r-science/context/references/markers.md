# Marker grammar specification

Single source of truth for the emoji-sigil marker vocabulary used in issue
bodies throughout this project.  `ctx_core.py` implements this grammar.  `#18`
(stub content) must not fork it.

---

## Design principles

**The full `emoji + keyword + :` triple is the canonical match token.**  A marker
registers only when all three appear together, line-anchored and in order
(e.g. `🧩 Part-of:`).  Requiring *both* halves is deliberate, because each one
collides with ordinary prose on its own: a bare emoji — ✅, ❓, ⚡ and 🔒 are all
common in running text — is treated as decoration, and a bare keyword ("Part-of",
"Future:") is treated as prose too.  The two omissions are handled
**asymmetrically**: a bare keyword looks like a forgotten sigil, so the linter
flags it (I8) and asks the human to repair it; a bare emoji is just decoration, so
it passes silently.  The linter never invents a marker from half a token.

**Line-anchored.**  The triple must begin at the first non-whitespace token on its
line (that token is the emoji).  A marker appearing mid-sentence is prose
decoration.  Indentation (leading spaces or tabs) is allowed.

**Quoting ≠ asserting.**  Markers inside fenced code blocks (` ``` `) do not
register.  A standalone blockquote — one that is not immediately preceded by an
empty-value block-form marker line — is inert quoted text; nothing inside it is
scanned for further markers.  Quoting another issue's marker text never
double-registers it.

---

## Emoji normalisation

GitHub and editors occasionally differ in whether they emit U+FE0F (variation
selector-16, "emoji presentation") after a base codepoint.  For example
`🏷️` is U+1F3F7 U+FE0F and `🏷` is bare U+1F3F7.  The parser normalises every
input with `unicodedata.normalize('NFC', text)` and additionally strips a
trailing U+FE0F from the glyph before matching, so both forms are one token.
`render()` emits the NFC-normalised form without a dangling U+FE0F.

---

## Two forms

### Inline form

Value follows the colon on the same line, trimmed of surrounding whitespace,
and terminates at end-of-line.

```
^[ \t]*<EMOJI>️?[ \t]*<Keyword>:[ \t]*(?P<value>.*?)[ \t]*$
```

Use for short values: issue references, keys, aspect tokens, single citations.

### Block form

The marker line carries an empty inline value (nothing after the colon, modulo
whitespace).  The value is the immediately-following sequence of `>` blockquote
lines, stripped of their `> ` prefix and joined by `\n`.  Collection
terminates at the first line that does not start with `>`.

Use for multi-line prose, LaTeX `align` blocks, and rationale text.

---

## Vocabulary

| Emoji | Keyword | Value type | Form |
|-------|---------|------------|------|
| 🧩 | `Part-of:` | comma-list of issue refs `#\d+` → `list[int]` | inline |
| 🏷️ | `aspect:` | aspect token → `str` | inline |
| 🧱 | `Boundary:` | comma-list of issue refs → `list[int]` | inline (block permitted) |
| ⛔ | `Blocked-by:` | comma-list of issue refs → `list[int]` | inline |
| 📐 | `Design:` | single issue ref `#\d+` → `int` | inline |
| 🟰 | `Eq:` | equation key / identifier → `str` | inline (block for multi-line LaTeX) |
| 📚 | `Cites:` | comma-list of citation keys → `list[str]` | inline |
| 🧭 | `Confidence:` | `low` \| `tentative` \| `high` → `str` (gauge) | inline |
| 📊 | `Fidelity:` | `stub` \| `interface` \| `mock` \| `correct` → `str` (gauge) | inline |
| 🔒 | `Seal:` | `sealed`\|`unsealed` (+ optional who/when) → `str` | inline |
| ❓ | `Question:` | keyed `q` → `Keyed` | inline / block |
| ✅ | `Validation:` | keyed `v` → `Keyed` | inline / block |
| ⚖️ | `Alternative:` | keyed `alt` → `Keyed` | inline / block |
| 🔮 | `Future:` | keyed `fut` → `Keyed` (optional `[v<n>]`) | inline / block |
| 🎯 | `Refinement:` | keyed `fd` → `Keyed` | inline / block |
| ⚡ | `Optimisation:` | keyed `opt` → `Keyed` | inline / block |
| 🪦 | `Dead-end:` | keyed `de` → `Keyed` | inline / block |
| 🗄️ | `Artefact:` | keyed `art` → `Keyed` | inline / block |
| ➕ | `Pro:` | keyed under an option (`<opt>.p`) → `Keyed` | inline / block |
| ➖ | `Con:` | keyed under an option (`<opt>.c`) → `Keyed` | inline / block |

---

## Keyed markers

Some markers are **tracked items** carrying a stable id and an evolving status, so
a later comment supersedes an earlier one by id (the fold; see `context-spec.md`).

- **Id:** `#<issue>.<prefix><n>` — e.g. `#16.q4`. The prefix encodes the kind and
  must match it; the issue-part must match the carrying node (checked by I9).
- **Value grammar:** `<id> [<status>] [<text>]`. First token is the id; if the
  second token is one of the kind's status words it is the status, else the
  default applies and the remainder is text. `render` always emits the status, so
  the round-trip is unambiguous.
- **Block form with id:** when the inline value is just the id (+ optional
  status), the immediately-following blockquote is the text — so a detailed
  dead-end or artefact keeps its id inline and its body in the quote.

| Kind | prefix | default status → others |
|------|--------|-------------------------|
| `Question` | `q` | `open` → `answered` |
| `Validation` | `v` | `open` → `met` / `unmet` |
| `Alternative` | `alt` | `proposed` → `rejected` / `viable` / `chosen` |
| `Future` | `fut` | `declared` → `activated` / `dropped` |
| `Refinement` | `fd` | `declared` → `activated` / `dropped` |
| `Optimisation` | `opt` | `declared` → `done` / `dropped` |
| `Dead-end` | `de` | `closed` → `revived` |
| `Artefact` | `art` | `live` → `stale` |
| `Pro` | `<opt>.p` | `standing` → `refuted` / `moot` |
| `Con` | `<opt>.c` | `standing` → `refuted` / `moot` |

```
⚖️ Alternative: #16.alt1 rejected censored data breaks it
… later comment supersedes by id …
⚖️ Alternative: #16.alt1 viable our data is uncensored, X moot

🪦 Dead-end: #7.de1
> Tried FFT convolution; padding dominated at n<512.
```

I8 flags a sigil-less keyed keyword (e.g. `Future:`) only when an id follows it,
so ordinary prose beginning with such a word is not a false positive.

## Deferred work: Future / Refinement / Optimisation (#33)

Three keyed registers hold work that is **not** an open child. (Anything load-bearing
for the current sweep is an open `Part-of` child instead — there is no "load-bearing"
flag; the fold is `min` over open + closed-completed children + own glue.)

| Marker | Means | Bears on *this node's* correctness? |
|--------|-------|-------------------------------------|
| 🎯 `Refinement` (`fd`) | a **contingent accuracy lever** — "we made a reasonable approximation; *if* it proves inadequate, here is a more-exact one" (e.g. gaussian → non-parametric SSD) | **yes** — pulled only on gestalt review |
| ⚡ `Optimisation` (`opt`) | a **contingent speed lever** — pulled only if speed proves inadequate | no (speed, not correctness) |
| 🔮 `Future` (`fut`) | an **expansion** — makes the node nicer, or spawns a child with its own correctness (e.g. a coefficient summary table; a section image) | no |

Classification rule for the grey zone:

- correctness-bearing **and** only-pull-on-gestalt-review → **`Refinement`**
- nicer, actually planned → **`Future` with a version tag**
- nicer, no present plan → **bare `Future`**

### Version tag `[v<n>]` (Future only)

A `Future` marker may carry an optional, disciplined version tag between the status and
the text — `🔮 Future: #16.fut1 declared [v1] cli message about generated warnings`. It is
a **query selector** for the release gate, so it is strict: only `[v<n>]` is accepted;
a malformed tag (`[v1.0]`) or a tag on any non-`Future` marker is a parse finding. The
tag is **optional** — omit it for speculative "someday" items. A whole dormant *node*
that is planned for a version carries the same intent as a `v<n>` label (a derived
index, not parsed here).

### Two thresholds

- **`correct`** — the fidelity fold above (load-bearing children done + own glue); a
  per-node property.
- **`release-ready`** — `correct` **plus** the `opt`/`fd` levers gestalt-reviewed and the
  version-tagged `Future`s triaged (add-or-defer). "Add" promotes a future via the node
  inline/dormant threshold and may transiently drop a node below `correct` by design.

## Pros & cons (sub-keyed under an option)

`➕ Pro:` and `➖ Con:` attach a tradeoff to an **option** — an `alt`/`fd`/`opt`
marker — by extending its id with a `.p<n>` / `.c<n>` segment:

```
⚖️ Alternative: #37.alt1 proposed one move-skill parametrised by (move × seal)
➕ Pro: #37.alt1.p1 standing one FSM owner; shared seal handling written once
➖ Con: #37.alt1.c1 standing prompt bloat — all-move instructions in one place
… later, when a con is shown wrong …
➖ Con: #37.alt1.c1 refuted bloat avoided by per-move fragments
```

Each pro/con is **individually folded latest-wins by id**, so a single one can be
superseded (`standing → refuted`) or made `moot` (infrastructure elsewhere changed
the calculus) without touching its siblings. Status default is `standing`.

The MCP decides **visibility by mode**: serve pros/cons during a *converge*/decision
move, withhold them during a fresh *re-diverge* so a re-assessment isn't anchored.
They are **optional and one line each** — the linter never demands them. An optional
free-text `[dimension]` tag may lead the body (e.g. `[performance]`, `[difficulty]`)
for future MCP grouping; it is convention, not parsed.

## Gauges and seal

Unkeyed, single-valued markers; the latest one in a node's stream wins. A value
outside the allowed set is a Finding (never silently dropped).

- `🧭 Confidence:` — `low` | `tentative` | `high`.
- `📊 Fidelity:` — `stub` | `interface` | `mock` | `correct` (a parent's effective
  fidelity is the min over its load-bearing children).
- `🔒 Seal:` — `sealed` | `unsealed` (+ optional `@who` and date). Default is
  **sealed**, inherited from the nearest sealed/unsealed ancestor.

## Per-marker examples

### 🧩 `Part-of:`

Declares that this node is a child of one or more parent issues.

**Positive — recognised:**
```
🧩 Part-of: #16
```
Parses to `Marker(PART_OF, [16], line)`.

**Positive — comma list:**
```
🧩 Part-of: #16, #17
```
Parses to `Marker(PART_OF, [16, 17], line)`.

**Negative — bare keyword (no emoji), not recognised:**
```
Part-of: #16
```
Not parsed as a marker.  I8 flags it as a finding.

**Negative — emoji mid-sentence, not recognised:**
```
As shown 🧩 Part-of: #16 in this summary.
```
Not a marker; emoji is not the first non-whitespace token.

---

### 🏷️ `aspect:`

Tags this issue with a named aspect that must correspond to an `aspect:x`
GitHub label on the issue.

**Positive:**
```
🏷️ aspect: numerics
```
Parses to `Marker(ASPECT, "numerics", line)`.

**Positive — bare glyph (no U+FE0F), equivalent:**
```
🏷 aspect: numerics
```
Same result after normalisation.

**Negative — label only, no marker:**
If the issue has the label `aspect:numerics` but no `🏷️ aspect: numerics` line,
I2 raises a finding (label has no corresponding in-text marker).

---

### 🧱 `Boundary:`

Declares the set of child issues that this parent "owns" as a boundary.  Only
valid on parent nodes; naming a non-child is a finding (I5).

**Positive:**
```
🧱 Boundary: #17, #18
```
Parses to `Marker(BOUNDARY, [17, 18], line)`.

**Negative — on a leaf node:**
A node with a `Boundary:` marker but no children in the tree → I5 finding.

---

### ⛔ `Blocked-by:`

Lists issues that must be resolved before this one can proceed.

**Positive:**
```
⛔ Blocked-by: #12
```
Parses to `Marker(BLOCKED_BY, [12], line)`.

**Negative — bare keyword:**
```
Blocked-by: #12
```
Not a marker.  I8 flags it.

---

### 📐 `Design:`

Points to the single design node (`#\d+`) that specifies this implementation
issue.  The referenced node must exist (I7).

**Positive:**
```
📐 Design: #17
```
Parses to `Marker(DESIGN, 17, line)`.

**Negative — dangling reference:**
```
📐 Design: #999
```
Parsed (value type is valid), but I7 raises a finding because `#999` is not in
the model.

**Negative — non-numeric value:**
```
📐 Design: not-an-issue-ref
```
`parse()` emits a finding; the marker is not registered.

---

### 🟰 `Eq:`

Registers an equation key used in citations and cross-references.

**Positive — inline:**
```
🟰 Eq: smith2020_msPAF
```
Parses to `Marker(EQ, "smith2020_msPAF", line)`.

**Positive — block form (multi-line LaTeX):**
```
🟰 Eq:
> \begin{align}
> a &= b \\
> c &= d
> \end{align}
```
The empty inline value selects block form; the blockquote lines (stripped of
their `> ` prefix, joined by `\n`) become the value.

**Negative — bare keyword:**
```
Eq: smith2020_msPAF
```
Not a marker.

---

### 📚 `Cites:`

Lists bibliographic citation keys.

**Positive — single key:**
```
📚 Cites: smith2020
```
Parses to `Marker(CITES, ["smith2020"], line)`.

**Positive — comma list:**
```
📚 Cites: smith2020, jones2021
```
Parses to `Marker(CITES, ["smith2020", "jones2021"], line)`.

**Negative — inside fenced code block:**
````
```
📚 Cites: smith2020
```
````
Not registered; code block suppresses extraction.

---

### 🪦 `Dead-end:`

A **keyed** marker (prefix `de`) — see [Keyed markers](#keyed-markers). Records a
rejected design path; the id is inline, the rationale is the body (inline, or the
immediately-following blockquote for detail).

**Positive (block body):**
```
🪦 Dead-end: #7.de1
> Tried FFT-based convolution.  Padding to next pow2 dominated
> cost at n<512; the direct loop was 3× faster in that regime.
```
Parses to `Marker(DEAD_END, Keyed("#7.de1", "closed", "Tried FFT-based
convolution. …"), line)`.

**Negative — no id:** `🪦 Dead-end:` with a blockquote but no id is a Finding —
keyed markers require an id.

**Negative — quoting blockquote:** a standalone blockquote (not the body of an
immediately-preceding marker line) is inert; nothing inside is registered.

---

## Suppression rules (summary)

1. **Fenced code blocks** — any content between ` ``` ` (or `~~~`) fences is
   ignored, regardless of indentation.
2. **Standalone blockquotes** — a `>` line that is not the block-form value of
   an immediately-preceding empty-value marker is inert.  Content inside is
   never scanned.
3. **Mid-line emoji** — an emoji not at the first non-whitespace position on its
   line is prose decoration.

These three rules together ensure "quoting ≠ asserting": showing a marker as an
example or quoting another issue's text never manufactures a phantom marker.

---

## Round-trip property

`parse(render(m)).markers == [m]` must hold for every marker `m` drawn from the
vocabulary, in both inline and block form, and across emoji variation-selector
normalisation.  This is the headline correctness property tested in
`test_ctx_core.py::TestRoundTrip`.
