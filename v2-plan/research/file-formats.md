# File format for the store: is TOML right?

2026-10-06. Marks: [F] fetched today (GitHub/crates.io API or project page), [S] search snippet, [K] my own knowledge (may be
stale), [M] measured here.
## Answer in one paragraph

Keep TOML for the item files. Validate with typed structs in the CLI plus a JSON Schema generated from them (or shipped by the
flow pack). Do not adopt CUE, Jsonnet, Pkl, Dhall, Nickel or Protobuf for the files. The decisive facts: the CLI is the only
writer, a schema is only ever checked in one place, cross-item lint must be written in code anyway, and the one thing the exotic
languages add (computation, inheritance, unification across files) is what this store should not have. The honest runner-up is
Markdown with YAML frontmatter, which wins on prose and loses on YAML's type traps. Confidence 70 percent; see section 6.
## 1. What was measured [M]
One spec item (S-012 from the redraft, with a two-paragraph requirement and two examples) written five ways, token counted with
tiktoken (cl100k and o200k; not Claude's tokenizer, so only the ratios mean anything):

| Form | chars | tokens |
|---|---|---|
| JSON, compact | 474 | 119-121 |
| YAML (block scalar) | 483 | 129 |
| Markdown + YAML frontmatter | 478 | 132 |
| KDL (raw-string prose) | 512 | 135 |
| TOML (`"""` prose, `[[example]]`) | 511 | 137 |

Spread is 15 percent on a small item, and the render function can print any format as it likes anyway. **Token cost is not a
reason to pick a storage format**; `render(scope)` should emit a purpose-made compact text, not the file. Round trip [M]:
tomlkit 0.15.1 parsed the file, changed a field and appended a table; comments, the `"""` block and spacing survived and an
unedited file re-serialised byte-identical. ruamel.yaml 0.19.1 kept comments but re-spaced one (`status: amended   #` became
`status: amended  #`). PyYAML parses `no`, `NO` as false, `0123` as 83, `1.10` as 1.1, and `2026-10-06` as a date (the
Norway/octal/float traps; confirmed [M]).
## 2. Candidates

Health as of today: TOML spec 1.1.0 published 2025-12-24 [F]; toml_edit 0.25.15 updated 2026-09-11, ~220M recent downloads,
maintained by Ed Page [F]; tomlkit 0.15.1, 2026-07-17 [F]; CUE v0.17.1, 2026-07-16 (still pre-1.0) [F]; Pkl 0.32.1, 2026-07-23
(pre-1.0, Apple) [F]; Nickel 1.18.0, 2026-09-19 (a Tweag project) [F]; Jsonnet v0.22.0, 2026-03-24 [F]; Dhall-haskell 1.42.2,
2025-01-19, nothing newer in 20 months [F]; kdl-rs 6.6.1, 2026-05-29 [F], KDL 2.0.0 final, with a separate KDL schema language
"loosely based on JSON Schema" [F]; Buf v1.73.0, 2026-09-11 [F]; eemeli/yaml 2.9.1, 2026-09-11 [F].
**TOML.** Typed key/values with tables; one canonical reading; multi-line strings.
- Gives: stable, unambiguous types (strings are quoted, so no Norway problem); comments; `"""` prose; best round-trip editors of
  any structured format (toml_edit in Rust, tomlkit in Python; Go's libraries are weaker [K]; TypeScript has `@iarna/toml`,
  `smol-toml`, with comment-preserving editing limited [K]).
- Costs: no schema standard; nested arrays of tables read badly past two levels; no null; dates are a real type (a plus here); a
  domain expert can hand-edit it (INI-like).
- LLMs: very well represented via Cargo.toml and pyproject.toml; produce valid TOML reliably for flat tables, slip on nested
  `[[a.b]]` headers [K].
**YAML.** Indentation-based; anchors; implicit typing.
- Gives: nicest prose (`|` blocks) and example lists; ubiquitous; JSON Schema works on it.
- Costs: implicit-type traps (above [M]); indentation errors; YAML 1.1 vs 1.2 splits between libraries; comment-preserving edit
  exists (ruamel in Python, `yaml` in JS) but not good in Rust/Go [K]; `serde_yaml` was archived in 2024 [K]. Strong on LLM
  familiarity.
**Markdown + frontmatter (YAML or TOML).** Body is prose, header is fields.
- Gives: prose-first reading; a requirement is a paragraph, not a string; renders on GitHub; closest to what a domain expert
  already writes; frontmatter is one small known format.
- Costs: two formats in a file; the body invites structure creep (headings, markers) which is exactly how v1's 1,172-line module
  arose; any structure inside the body must be banned by lint. With TOML frontmatter (`+++`) the YAML traps go away; Hugo
  supports it [K]. Several prose fields per item (requirement, rationale, note) do not fit one body.
**JSON / JSON5 / JSONC + JSON Schema.** The schema ecosystem is the real asset: validators in every language, generation from
serde/pydantic/zod, editor support. But JSON has no comments, makes multi-line prose a `\n` string, and is hostile to hand-
editing; JSONC/JSON5 have patchy libraries and weak round-trip. Good as the *schema* and interchange (render input), poor as the
authored file.
**CUE.** Constraint language: types and values are one lattice; unification merges many sources; schemas, defaults, enums,
cross-field constraints in the language itself; can validate YAML/JSON/ TOML files against a CUE schema (`cue vet`) [K].
- Gives that TOML does not: schema in the format; defaults; enum/regex/ranges; "reference resolves" is partly expressible only
  when all items are loaded as one value.
- Costs: Go only, no real Rust or Python library (Go library; CLI shells out) [K]; pre-1.0 and v0.17.0 had evaluation panics and
  hangs fixed in .1 [F]; steep for a non-engineer; the language has a famously hard-to-predict evaluation model; LLMs write CUE
  less well [K]. No comment-preserving programmatic edit of arbitrary CUE; but if CUE is only the schema and the data stays
  TOML, that cost vanishes and only the Go dependency remains.
**Jsonnet / Nickel / Pkl / Dhall.** Configuration languages with functions, imports, inheritance/overlays and types (Nickel
gradual types and contracts; Pkl classes with constraints and codegen to Java/Kotlin/Swift/Go [K]; Dhall total and typed,
decaying: 20 months without a release [F]). They all *compute* a document from code. A file written by a CLI, read by a domain
expert, must be data, not a program; a machine edit of computed config cannot preserve comments or intent, since the file is not
the value. Rule out as item files. Pkl and Nickel as a schema-only layer are conceivable but give nothing JSON Schema or serde
does not, at the price of a runtime (JVM-free native Pkl binary, Rust Nickel).
**KDL.** Node-based document language (KDL 2.0.0 final [F]); comments, raw strings, typed annotations; `node arg key=val {
children }`.
- Gives: a pleasant shape for "an item with children" (examples as repeated nodes, one line each); prose via `"""` or raw
  strings. Schema language exists, small ecosystem [F].
- Costs: libraries exist in Rust (kdl-rs, comment-preserving, 6.x [F]) but thin in Python, Go, TypeScript; v1/v2 split just
  ended; few LLM training examples [K]; some readers find braces-with-no-commas unfamiliar. A fine format, no capability this
  system needs.
**HCL, EDN, RON, Starlark.** HCL: good Go library, weak elsewhere, invites expressions. EDN, RON: few libraries or Rust-only. Starlark: programs. None beats TOML.
**Protobuf text format; Protobuf/Buf as schema.** The wire format is for services, not diffs. Text format is readable but poorly
known to humans and LLMs; no comments round-trip guarantee for editing. What Protobuf offers is schema evolution (field numbers,
`reserved`, `buf breaking` detecting incompatible changes [F: Buf is active]). This is a real idea for "the format is expensive
to change", but it solves a distributed-service problem; here one CLI owns all reads and writes and files are in git, so a
`schema` integer and a migration command (section 5) give the same safety. Not worth a compiler toolchain.
**SQLite / DuckDB with files as export.** Gives real constraints (foreign keys, CHECK, UNIQUE, cycle checks by recursive query),
fast queries for lint and render, transactions without the temp-file-rename protocol. Costs: binary file in git (no diffs, no
merges, no hand-edits), so "git is the log" is lost unless every write also exports text, at which point the text is the store
and the database a cache. As a derived, throw-away *index* built by `lst index` for lint and chooser queries it is attractive.
Not the source of truth.
**Plain typed code** (data definitions in Rust/Python/TS): perfect checking, but a file becomes a program tied to one language, not expert-editable. No.
## 3. Comparison table

(++ strong, + ok, - weak, -- bad)

| | TOML | YAML | MD+YAML | JSON+Schema | CUE | KDL | Pkl/Nickel/Jsonnet | SQLite |
|---|---|---|---|---|---|---|---|---|
| Small git diffs | ++ | ++ | ++ | + | + | ++ | + | -- |
| Hand-editable by expert | + | + | ++ | -- | -- | + | -- | -- |
| Prose handling | + | ++ | ++ | -- | + | + | + | + |
| Tables of examples | + (`[[example]]`) | ++ | + | + | + | ++ | + | + |
| Type traps | ++ | -- | - | ++ | ++ | ++ | ++ | ++ |
| Comment-preserving machine edit | ++ (Rust, Py) | + (Py, JS) | + | -- | -- | + (Rust) | -- | n/a |
| Libraries in Rust/Py/Go/TS | ++ | ++ | ++ | ++ | Go only | Rust only | -- | ++ |
| Schema in or beside format | -- (std) | - | - | ++ | ++ | + | ++ | ++ |
| LLM reads | ++ | ++ | ++ | ++ | + | - | - | n/a |
| Cross-item lint in format | no | no | no | no | partial | no | partial | yes |
## 4. Which exotic capabilities help, which to avoid

Real gains, and where each is obtained without leaving TOML:
- **Schema in a shipped file.** Wanted: a flow pack ships "at most five kinds". The cheapest form is a small data file (kind,
  fields, types, enums, required, id-reference fields, and which fields hold prose), read by the CLI at run time and checked by
  a generic validator (JSON Schema draft 2020-12 is the common standard; `jsonschema` in Python, `jsonschema`/`boon` in Rust,
  `ajv` in TS [K]). That meets "defined as data". CUE does this more elegantly but needs Go; the elegance is not what is being
  bought.
- **Constraints such as enums, ranges, "owes a property test".** The last one needs the item and a scan of test files: code, not
  schema, in any option.
- **Cross-item rules** (id resolves, no cycle, suspect fingerprints, owner rule). No format does these across one-file-per-item:
  CUE could after loading everything as one value, but cycle detection and fingerprint compare are still a program. Write them
  in the CLI; about 150 lines. They are the same in every option, so they do not discriminate.
- **Protobuf-style evolution rules.** Take the idea (never reuse a field name for a new meaning; reserve removed names), not the
  toolchain.

Avoid, whichever format: **computation in a file; inheritance or defaults supplied by a different file; imports;
anchors/aliases; anything where the meaning of one item depends on another file's text.** Rationale: the store is read cold by a
model after a rewind and edited by one writer; a file must mean the same thing read alone, and a diff must show what changed.
Defaults belong in the CLI's code, applied on read and never written out, a rule that costs nothing and keeps files minimal.
## 5. Prose and example tables, in the top three

**TOML** (recommended). Prose in `"""`; examples as repeated `[[example]]`, which stay readable at two levels (item and example)
and degrade when nested deeper. Use inline tables (now allowed to span lines in TOML 1.1 [F]) for one-line rows. Keep to two
levels by rule.

```toml
id = "S-012"
status = "signed"            # draft | signed | amended
requirement = """
When the same readings file is loaded twice, `readings` holds each source row once.
A reading's key is (station_id, read_at).
"""
needs = ["S-003"]
example = [
  { given = "readings.csv, 3 rows, loaded twice", then = "3 rows" },
  { given = "empty file",                          then = "unchanged" },
]
```

**Markdown + YAML frontmatter.** Prose is the body, so it reads best; one prose field per item, so rationale and notes need a
second file or a fenced section, and the section names become the bespoke parser v1 died of. Allowed only if the body is a
single opaque string.

```markdown
---
id: S-012
status: signed        # draft | signed | amended
needs: [S-003]
examples:
  - {given: "readings.csv, 3 rows, loaded twice", then: "3 rows"}
  - {given: "empty file", then: "unchanged"}
---
When the same readings file is loaded twice, `readings` holds each source row once.
A reading's key is (station_id, read_at).
```

**YAML or KDL as third.** YAML has the best block scalar and table, but its traps rank it third. KDL's shape suits examples best (`example given="..." then="..."` one node per row, prose in a raw `"""` string) but its library coverage is thin.

Tables of examples that grow past about ten rows, or are used as real test data, should be a separate `.csv` or `.tsv` file the
item names, since test data is data and a CSV is what both the expert and the test harness already read. This is a stronger rule
than any format choice.
## 6. TOML pitfalls and whether they bite here

| Pitfall | Bites? |
|---|---|
| Nested arrays of tables hard to read | Rarely: items are flat plus one `[[example]]`/`[[decision]]` level. Rule: two levels maximum, lint it. Unit state's `[intent]`+`[[intent.dispatch]]` is the worst case in the draft; flatten it. |
| Multi-line strings | Fine. `"""` keeps text; `'''` literal avoids escaping backslashes. Leading newline is trimmed. Hand edits keep working. |
| No schema standard | Bites, but only mildly: solved by typed structs plus generated JSON Schema (same as every option except CUE). |
| Date types | Helps: `2026-10-09T14:02:11Z` is a real type; but beware local vs offset datetimes; store UTC with `Z`. |
| No null | Absence means unset; the CLI should never write empty-string sentinels. Good for diffs. |
| Comment preservation | Good with toml_edit and tomlkit [M for tomlkit]. Weak point: Go and TS editors [K]. If the CLI is Go or TS, this becomes the largest risk; choose Rust or Python, or re-test. |
| Key order | tomlkit/toml_edit keep it; serde-style whole-file rewrites do not. Rule: the CLI edits in place, never regenerates. |
| TOML 1.1 is new (Dec 2025 [F]) | Some libraries still target 1.0; avoid 1.1-only syntax until the chosen library is checked. |
## 7. Versioning and migration rule (format-independent)
1. Every file begins `schema = N` (the redraft already has this). N is per kind and set by the flow pack; the CLI has its own
  format number for the store layout.
2. The CLI reads the current N and N-1, never writes N-1. Reading N-1 into the current struct is code (a function
  `up_N-1_to_N`), tested with a frozen sample of every old version kept under `tests/data/`.
3. `lst migrate` rewrites all files from older versions in one commit, edit-in-place so comments survive, atomic via a branch,
  refusing to run on a dirty tree. `lst doctor` reports files at old versions.
4. Evolution rules, borrowed from Protobuf: add optional fields freely (no bump); never reuse a field name with new meaning; a
  removed field is listed as reserved for one major version so a stale file is flagged, not silently misread; renames are a bump
  with a migration.
5. A full format change (e.g. TOML to markdown) is the same mechanism: the CLI gains a second reader and `migrate` converts.
  Because render is pure and only the CLI touches files, the cost is one reader and one writer. Keeping nothing but data in the
  files (section 4) is what makes this cheap.
## 8. Recommendation

**TOML files, flat items with at most two levels, typed structs in the CLI as the schema, JSON Schema generated or shipped for
flow-pack kinds, cross-item lint in code, long example tables as CSV, an optional SQLite index derived for queries.** Reasoning:
it is the only option that is simultaneously unambiguous, comment-preserving on machine edit, readable by an expert, well known
to models, and well supported where the CLI is likely to be written. Every exotic option adds either a runtime language (Go for
CUE, JVM-ish or Rust for Pkl/Nickel) or computation we want to ban; none removes the need for code-based cross-item lint.

Confidence: 70 percent TOML over markdown+YAML frontmatter (the runner-up); 90 percent TOML or markdown frontmatter over any
exotic language. The weakest link is CLI language: if Go or TypeScript is chosen, comment-preserving TOML editing is the part to
retest.

Tests that would change my mind (both cheap, neither run here since they need model calls):
1. **Reading and writing test.** Give a small model the same five items in TOML, markdown frontmatter and YAML; ask ten resume
  questions and have it produce a new item and an edit through the CLI's interface. If markdown frontmatter wins by a clear
  margin (more than 10 points) on questions about prose-heavy items, switch to it with TOML frontmatter.
2. **Round-trip test in the chosen CLI language.** Take the 12 draft files from the redraft, make 20 scripted edits (change
  field, append `[[example]]`, delete a key), diff against the hand-made expectation. If comments or ordering are lost in the
  library for that language, TOML's main advantage is gone and Python/Rust must be chosen or markdown considered. Done here only
  for tomlkit and ruamel.yaml, on one file (section 1).

Not examined: real LLM accuracy per format (not run); library versions for Go and TypeScript TOML editors (from knowledge only).
