# dl TDD suite — plan criterion → test map

Written 2026-07-10 against `model-api.md` + `plans/dl-00-overview.md` + plans A–D,
before any production code exists. Run: `npx vitest run test/dl/` from `docloop/`.

Expected pre-implementation state: 13 files import-red (unresolved `scripts/dl/*`
imports), 20 assertions red, 5 green. **Every green is a deliberate
unchanged-behaviour pin** (marked ✅-pin below); everything else must go green only
as its package lands.

## Shared / overview

| Criterion (dl-00) | Test |
| - | - |
| Tiling invariant is load-bearing | `blocks.test.ts` › splitBlocks — tiling invariant (all) |
| Output discipline: one line success / terse stderr failure, no partial writes | asserted throughout the CLI tests (read-edit-cli, verbs-cli, commit, check CLI); `helpers.ts#stripHarnessNoise` filters the declared-acceptable vite-node/vite.config noise |
| Doc discovery: tracked top-level `*.md`, never `turn.xml` | `commit.test.ts` › never stages turn.xml; `read-edit-cli.test.ts` › unknown doc lists tracked docs |

## Package A

| Criterion | Test(s) |
| - | - |
| A1 tiling: real docs + torture | blocks › segments tile back… (design.md, plan.md, torture) |
| A1 `:::mark` container = one block | blocks › a :::mark container wrapping two paragraphs… |
| A1 3-item list = 3 blocks, nested rides along | blocks › a 3-item bullet list yields 3 blocks… |
| A1 fence with fake heading/item = one block | blocks › a fence containing… ; table: › a GFM table is one block |
| A1 sectionRange incl. unknown / duplicate | blocks › sectionRange suite (4 tests) |
| A1 empty doc / one-paragraph doc | blocks › degenerate docs (2 tests) |
| A1 headingTrail | blocks › heading trail (2 tests) |
| A2 determinism / whitespace sensitivity | refs › refOf (3 tests) |
| A2 parseRef rejections | refs › parseRef (4 tests) |
| A2 assertFresh names current ref | refs › assertFresh (2 tests) |
| A3 idempotence on corpus + torture | canonical › idempotence (3) — fixtures re-canonicalised once in setup per A3 |
| A3 Milkdown fixed point (jsdom) | canonical › Milkdown fixed point (3) |
| A3 anchors preserved byte-for-byte | canonical › anchor preservation (2) |
| A3 list-spread normaliser pos + neg | canonical › list-spread normaliser (2) |
| A3 content-preservation guard throws | canonical › content-preservation guard (see ambiguity #3) |
| A4 journal round-trip / latest-hash / path | journal (4 tests) |
| A5 header ref + marker count + reconstruction | read-edit-cli › dl read (header test; stripping markers… reconstructs) |
| A5 section read, global ordinals, whole-doc ref | read-edit-cli › a section read shows… |
| A5 error: unknown doc, nothing on stdout | read-edit-cli › unknown doc… (unknown/ambiguous **section** errors covered at unit level in blocks › sectionRange only) |
| A6 single replace / new ref / canonical file | read-edit-cli › replaces a middle block… |
| A6 shift none / signed shift | read-edit-cli › equal-block-count replace; › a delete reports a signed shift |
| A6 multi-op ascending applies bottom-up vs original numbering | editops › multi-op batch given ascending… |
| A6 overlap → error, file untouched | editops › rejects overlapping…; read-edit-cli › overlapping ops… |
| A6 stale ref names current ref, no write | read-edit-cli › stale ref… |
| A6 body keeps inline anchor | read-edit-cli › replacement body carrying an existing inline anchor… |
| A6 sloppy body lands canonical | read-edit-cli › a sloppy-formatted body… |
| A6 shift-map property | editops › every untouched old ordinal… (deterministic op set, not randomised — see note #6) |
| A6 insert-after 0 / delete 1-N | editops › insert-after 0 prepends…; read-edit-cli › delete 1-N empties… (asserts zero blocks, not a specific byte — see ambiguity #4) |
| A6 ambiguous body hard error | editops › hard-errors before any work… |
| A7 dispatcher --help / unknown verb / stubs | dispatch-cli (3 tests; integration goes via `npx vite-node scripts/dl.ts` directly rather than `npm run dl` — equivalent) |

## Package B

| Criterion | Test(s) |
| - | - |
| B1 newest model commit beats newer human HEAD | gitio › returns the NEWEST model-authored commit… |
| B1 legacy `C turn:` fallback / all-human null | gitio › legacy fallback…; › an all-human repo… |
| B1 docAt at rev / absent / null-rev empty tree | gitio › docAt (3) |
| B2 dirty human draft recovered + folded | agenda-cli › commits a dirty human draft… |
| B2 clean tree → no commit | agenda-cli › a clean tree creates no commit… |
| B2 journal-matched dirt → no commit, warn | agenda-cli › a mid-model-turn re-run… |
| B3 one paragraph → one item + heading context | agenda-delta › editing one paragraph… |
| B3 inserted section → one item, empty old | agenda-delta › inserting a whole section… |
| B3 pure anchoring change → zero items | agenda-delta › a pure anchoring change… |
| B3 reorder → delete+insert, no crash | agenda-delta › reordering two sections… |
| B3 new doc → whole-doc item | agenda-delta › a doc absent at the boundary… |
| B4 changed thread → full bodies | agenda-cli › a new human comment… |
| B4 unchanged-open → one-liner | agenda-cli › an untouched open thread… |
| B4 resolved since B with note / before B not listed | agenda-cli › a thread resolved by a human…; › a thread resolved BEFORE the boundary… |
| B4 legacy deleted dir → resolved, no crash | agenda-cli › legacy: a thread dir deleted outright… |
| B4 model self-open+resolve → resolved, no crash | agenda-cli › a thread opened AND resolved by the model… |
| B4 multi-doc attribution | agenda-cli › multi-doc: a thread anchored in plan.md… |
| B5 golden snapshot (the ONE sanctioned snapshot) | agenda-cli › golden snapshot of a scripted two-human-turn scenario (snapshot created on first green run — implementer must review it) |
| B5 nothing-to-do single line | agenda-cli › nothing-to-do state… |
| B6 orient docs/counts/turn/history≤5 | orient-cli (3 tests) |

## Package C

| Criterion | Test(s) |
| - | - |
| C0 resolve marks, dir + comments intact | store-resolved › writes threads/<id>/resolved.md… |
| C0 marker shape author/created/note; empty note | store-resolved › the resolved marker carries…; › an empty note… |
| C0 missing dir created on resolve | store-resolved › resolving a never-written thread… |
| C0 re-resolve overwrites (last wins) | store-resolved › resolving an already-resolved id… |
| C0 listThreads populates `resolved` / undefined | store-resolved › the resolved marker carries… + ✅-pin › unresolved threads have resolved === undefined |
| C0 legacy lint marker rules | lint-core-resolved (2 red + ✅-pin unchanged orphan) — markers seeded directly on disk, since calling today's `resolveThread` deletes the dir and would pass vacuously |
| C0 API DELETE {note} / no body | api-resolve (2 tests; kept free of `scripts/dl/*` imports so C0 can land before A) |
| C0 renderTurn: no phantom entries | ✅-pin store-resolved › reports status="resolved"… (plan says "no change — verified anchor-driven"; green-now is the point) |
| C0 id never reused after resolve | store-resolved › a resolved t9 still counts… |
| C1 rule 1 dup id across docs | check › rule 1 (the "duplicated id claims within the store" half is untestable — dirs are unique by filesystem; see ambiguity #7) |
| C1 rule 2 pos+neg | check › rule 2 (2) |
| C1 rule 3 orphan pos/neg + 3b + union regression | check › rule 3 (4, incl. the 2026-07-09 multi-doc-blindness regression) |
| C1 rule 4 malformed frontmatter | check › rule 4 |
| C1 rule 5 WARN non-t<N> | check › rule 5 |
| C1 rule 6 non-canonical names doc | check › rule 6 |
| C1 rule 7 empty span / mid-word | check › rule 7 (2) |
| C1 rule 8 >3 fragments WARN | check › rule 8 |
| C1 rules 9a–9d pos; backtick + adjacent-emphasis neg | check › rule 9 (3 tests; positives via `fixtures/dl/lint-forbidden.md`, torture doc stays guard-clean) |
| C1 exit codes + CLI line format | check › exit-code shape (2) + › dl check — CLI output shape (2) |
| C2 happy path (author, record round-trip, scratch cleared, stdout) | commit › commits as the model author… |
| C2 resolve note → turn record | commit › carries a resolve --note through… |
| C2 foreign edit refusal naming file | commit › refuses on a foreign edit… |
| C2 no-journal refusal / untracked file / --allow-manual | commit › refuses when no dl writes…; › refuses on an untracked new tracked-pattern file… |
| C2 checkcore error → refuse, index clean | commit › refuses on a checkcore ERROR… |
| C2 turn.xml never staged/never blocks | commit › never stages turn.xml… |
| C2 parseTurnRecord | commit › round-trips the turn-record YAML… |
| C3 reply infers doc / no anchor error | verbs-cli › dl reply (2) |
| C3 comment ambiguous / --doc / union id allocation | verbs-cli › dl comment (2 + allocation test) |
| C3 --block stale / fresh disambiguation | verbs-cli › --block with a stale ref…; › --block with a fresh ref… |
| C3 resolve --note full contract | verbs-cli › dl resolve |
| C3 docs canonical + journal hashes after verbs | verbs-cli › verbs keep docs canonical + journalled |
| C4 /commit canonicalises | api-canonical › POST /commit… (uses sloppy list spacing, not `\~` — see note #8) |
| C4 /save-draft canonicalises | api-canonical › POST /save-draft… |
| C4 guard trip → 500, nothing written | api-canonical › content-guard trip |
| C4 GUI-canonical round-trip | api-canonical › a body already in canonical form… |

## Package D

| Criterion | Test(s) |
| - | - |
| Mid-word selection → one whole-word anchor | anchor-snap › a mid-word selection anchors whole words… |
| Leading/trailing spaces excluded | ✅-pin anchor-snap › trims leading/trailing whitespace… (already green: the serializer moves boundary spaces out; snapSelection must keep it true at the PM level) |
| Inline-code span never split | anchor-snap › a boundary inside an inline-code span… |
| Two-paragraph selection → one `:::mark`, zero inline | anchor-snap › a selection spanning two paragraphs… |
| Whitespace-only → null / no-op, doc identical | anchor-snap › returns null for a whitespace-only selection… |
| Single-block behaviour unchanged | ✅-pin anchor-snap › a clean word-aligned single-paragraph selection… |
| `thread new` path still passes | existing `test/thread-cli.test.ts` (untouched) is the regression gate |

## Conflicts with existing tests (for the implementer to reconcile — NOT touched here)

1. `test/threads-store.test.ts` › resolveThread — "deletes the thread directory" and "no-op on missing id" both pin pre-C0 behaviour and the old 2-arg signature.
2. `test/thread-cli.test.ts` › resolveThreadCmd — asserts `listThreads === []` after resolve; also `scripts/thread-actions.ts#resolveThreadCmd` calls the old `resolveThread(dir, id)` signature.
3. `test/lint-turn.test.ts` — pins the message `thread t1/ is orphaned (resolve should have deleted it)` (two places); wording and rule change under C0.
4. `test/api.test.ts` › DELETE /threads/<id> — expects `threads: []` after DELETE.
5. `test/api.test.ts` › /commit and /save-draft tests use bodies like `'v1'`, `'draft text'`, `'# Hello\n\nworld'` and assert byte-equality on read-back — under C4 canonicalisation these gain (at least) a trailing newline. Not listed in any plan; flagging as an additional C4 reconciliation item.

## Assumptions & ambiguities (details in the final report)

1. `DOCLOOP_WORKSPACE` env override assumed for CLI tests (`helpers.ts#runDl`).
2. Assumed module APIs where plans leave names open: `parseEditOps`/`applyEditOps` (+ shift as `{from, delta}[]`), `blockDelta(old,new)`, `checkWorkspace(ws)`.
3. A3 content-guard positive uses a bare `:mark` (spike: engine-swallowed). If the implementation's directive gate makes it survive, substitute another guard-tripping construct rather than weakening the guard.
4. `delete 1-N` end state: asserted "zero blocks", not empty-vs-`'\n'` (plan says "pick one, assert it" — implementer picks, then tightens the assertion).
5. vite-node/vite.config stdout noise is filtered by the harness, per dl-00 "acceptable for now".
6. A6 shift-map property test is deterministic, not property-randomised (kept reproducible).
7. C1 rule 1's "duplicated id claims within the store" is unrepresentable on a filesystem store (dirs are unique) — only the cross-doc half is tested.
8. C4's `\~`-escaping example depends on GUI-fixture bytes; the test uses sloppy list spacing as the canonicalisation witness instead.
