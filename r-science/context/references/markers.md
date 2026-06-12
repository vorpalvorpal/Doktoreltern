# Marker grammar specification

Single source of truth for the emoji-sigil marker vocabulary used in issue
bodies throughout this project.  `ctx_core.py` implements this grammar.  `#18`
(stub content) must not fork it.

---

## Design principles

**The emoji is the canonical match token.**  A marker is recognised by its
leading emoji glyph, not by its keyword.  "Part-of" written in ordinary prose
does not register.  The linter never invents an emoji from a bare keyword; it
flags the omission and asks the human to repair it.

**Line-anchored.**  The emoji must be the first non-whitespace token on its
line.  An emoji appearing mid-sentence is prose decoration.  Indentation
(leading spaces or tabs) is allowed.

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
| 🪦 | `Dead-end:` | rationale prose → `str` | block |

---

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

Records a rationale for a design path that was tried and rejected.  Always
block form.  The value is the text of the immediately-following `>` blockquote,
with `> ` prefixes stripped and lines joined by `\n`.

**Positive:**
```
🪦 Dead-end:
> Tried FFT-based convolution.  Padding to next pow2 dominated
> cost at n<512; the direct loop was 3× faster in that regime.
```
Parses to:
```
Marker(DEAD_END,
       "Tried FFT-based convolution.  Padding to next pow2 dominated\n"
       "cost at n<512; the direct loop was 3× faster in that regime.",
       line)
```

**Negative — quoting blockquote, not preceded by an empty-value marker:**
```
Quoting #17 below:

> 🪦 Dead-end:
> Tried something else.
```
The outer blockquote is standalone (no immediately-preceding empty-value
marker), so nothing inside it is extracted.  No marker is registered.

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
