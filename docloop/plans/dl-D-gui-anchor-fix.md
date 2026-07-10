# Package D — GUI `applyAnchor` fix (word-boundary snapping, no fragmentation)

*Read `dl-00-overview.md` first. Independent of packages A–C. This is the one GUI
change the spec allows (`model-api.md` Non-goals). Evidence: on 2026-07-09 anchors
arrived inbound as t17 in 8 `:mark` fragments and t21/t25 split mid-word.*

## Root cause

`applyAnchor` (`src/write-actions.ts`) does `tr.addMark(from, to, …)` on the raw
browser selection:
- a selection crossing block nodes forces the serializer to emit one `:mark[…]{#id}`
  fragment per text run per block (fragmentation);
- selections often start/end mid-word (browser drag), so fragments split words;
- a boundary inside an inline-code span splits the code span (documented HANDOFF
  gotcha, currently manual discipline).

## D1. `snapSelection` (new, in `src/write-actions.ts`)

`snapSelection(state, from, to) → {from, to} | null`, applied inside `applyAnchor`
before the `addMark` (and exported for tests):

1. **Trim** leading/trailing whitespace from the selected text range.
2. **Word snap**: if `from` or `to` falls inside a word (`\w` on both sides in the
   flattened text), move it **outward** to the word's edge — a partially selected
   word is anchored whole, never split.
3. **Inline-code snap**: if a boundary falls strictly inside a text run carrying the
   inline-code mark, extend outward to cover the whole code span.
4. **Empty after trimming** → return null (caller treats as no-selection, same as
   today's `hasTextSelection` false path).

## D2. Multi-block selections → container anchor

If the snapped range still spans more than one top-level block (detect via PM
resolved positions: `$from` / `$to` sharing the same block-level ancestor or not),
do **not** `addMark`. Instead wrap the covered top-level blocks in the existing
`commentBlockNode` (`:::mark{#id}`), extending the range outward to whole blocks.
One selection ⇒ exactly one directive, always — inline `:mark` within a block,
container `:::mark` across blocks. (The GUI already renders and resolves container
anchors; only creation was missing.)

## D3. Guard rail

After the transaction, re-serialize (`currentMarkdown`) and count `{#<id>}`
occurrences for the new id: if ≠ 1, roll back the transaction and surface the
existing error path (same philosophy as the content-preservation guard — refuse
loudly rather than persist a fragmented anchor). `extractAnchors` cannot be used for
counting here (it coalesces same-id fragments) — count textually, or walk the mdast
for directive nodes with that id.

## Adjudicated addition (2026-07-10, post-audit): fragment coalescing

`src/write-actions.ts` gained `coalesceMarkFragments`, applied to
`currentMarkdown()` output: Milkdown's serializer can emit a single anchor as
adjacent same-id `:mark` fragments (leaf-boundary behaviour, #704 family);
the coalescer deterministically re-joins them, and the D3 guard counts
occurrences POST-repair. Adjudication: accepted as an improvement — nothing
fragmented is ever persisted, which is the guard's actual goal; the implementation
predated this note (flagged by the compliance audit as an undocumented deviation —
the deviation is hereby recorded and approved).

## Correctness criteria (tests — jsdom editor tests, pattern of
`test/write-actions.test.ts`)

- Mid-word selection (`wo⟨rd and mo⟩re`) → serialized doc contains exactly one
  `:mark[word and more]{#tN}`; visible text unchanged.
- Selection with leading/trailing spaces → spaces excluded from the anchor span.
- Selection ending halfway through an inline-code span → whole code span inside the
  anchor, still one directive.
- Selection spanning two paragraphs → one `:::mark{#tN}` container wrapping both,
  zero inline `:mark` for that id, visible text unchanged (strip-anchors round-trip
  equality).
- Whitespace-only selection → no-op (returns false, doc byte-identical).
- Existing single-block behaviour unchanged: clean word-aligned single-paragraph
  selection produces the same markdown as before the change.
- `scripts/thread-actions.ts` `newThread` path (which reuses `applyAnchor`) still
  passes its suite; a `dl comment`/`thread new` span given with exact word boundaries
  is unaffected by snapping.
