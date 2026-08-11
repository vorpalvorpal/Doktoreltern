# Prior art review: the beads storage migrations (SQLite → JSONL+cache → Dolt)

> Research report, 2026-08-11, commissioned for the third-party review of the ctx node store.
> External research only. Closest sister report: `git-backed-store-prior-art.md`, which surveys the
> git-native tracker graveyard; this one is a single-project case study of the most-watched live
> experiment in that space. Also related: `agent-task-graph-trackers-prior-art.md`.
>
> Evidence base: the beads git history at HEAD `05e3f99a` (2026-08-10, ~11.8k commits), its issue
> tracker (~5,600 issues), its published docs, DoltHub's blog, and the author's own post-mortem.
> Claims sourced to commits and issue numbers are verifiable; adoption numbers are as of 2026-08-11.

## 1. Why this case is worth a file

`beads` (Steve Yegge, ~26k stars) is the closest public analogue to the ctx node store: a
dependency-aware work graph, stored in git, written concurrently by coding agents, with a
`ready` query as its central primitive. It has now shipped **three** storage architectures in ten
months, each one a repair of the previous one's central defect, each one introducing a new defect
of comparable size. The full arc is documented in public, including the author's own admissions.

This is the rare case where prior art includes the counterfactual: we can see what happens when a
git-backed text store is abandoned for a versioned database, *and* what happened to the dozen
projects that refused to follow.

## 2. The three architectures, and the circle they close

| Era | Source of truth | Central defect |
|---|---|---|
| Pre-launch (Oct 2025) | SQLite `.db` committed to git | Binary — git cannot merge it at all |
| v0.x (Oct 2025 – Feb 2026) | JSONL in git; SQLite as gitignored cache | Two sources of truth → daemon, drift, races, tombstones |
| v1.x (Feb 2026 –) | Dolt (versioned binary DB); JSONL an optional export | Server lifecycle, storage bloat, idle CPU, data-loss reports |

The system is now structurally where it began — a binary database as the committed source of truth —
with the single difference that Dolt is a binary format that can three-way merge. At HEAD,
`cmd/bd/init.go:333` reads *"Dolt is the default and only supported storage backend"*; `sqlite`,
`postgres` and `mysql` survive as tombstoned flags that print migration guidance.

**Correction to a claim circulating in secondary sources:** several write-ups state SQLite quietly
returned as a supported backend in mid-2026. It did not. Postgres/MySQL adapters merged 2026-07-09
(`1fc38ba7`) and were rolled back; `6fd9dbda` (2026-07-18) extended that rollback to SQLite, on the
stated rationale of consolidating on *"a single storage engine and dialect."* Verified at HEAD.

## 3. Why a SQLite cache *and* git-tracked JSONL

The dual-storage design is usually described as a deliberate index-over-text architecture. The
history shows it is a fossil of the reverse decision.

beads launched **SQLite-only**, with the `.db` file committed to git — the first README sells *"Zero
setup — Single binary + SQLite database file."* `GIT_WORKFLOW.md` documents the wall they hit:

> SQLite databases are **binary files**. Git cannot automatically merge them like text files.
> `warning: Cannot merge binary files: .beads/myapp.db (HEAD vs. feature-branch)`
> You must choose "ours" or "theirs" (lose one side's changes) OR manually export/import data.

Their first proposed mitigation is instructive: *"One person owns the database per branch."*

On **2025-10-12, the first day of the public repo**, commit `15afb5ad` ("shift to text-first
architecture") inverted it:

> **Before:** Binary SQLite database committed to git
> **After:** JSONL text files as source of truth, SQLite as ephemeral cache
> - Git-friendly text format with clean diffs
> - AI-resolvable merge conflicts (append-only is 95% conflict-free)

SQLite was not chosen as an index. It was **demoted** to one. The README of that commit gives the
retention rationale:

> - **JSONL files** — Source of truth, committed to git
> - **SQLite database** — Ephemeral cache for fast queries, gitignored
>
> ✅ **Fast queries** — SQLite indexes for dependency graphs
> ✅ **No daemon required** — In-process SQLite, ~10-100ms per command

So the defensible reasons to keep a cache are exactly two: **graph queries** (`ready` is a transitive
closure over blocking edges; JSONL gives no index, so every invocation reparses and rebuilds) and
**partial writes** (updating one field of one issue rewrites the whole JSONL file, or appends and
requires compaction).

Both are real. Neither survived contact with the cost. Note the "no daemon required" boast in that
same README, then the commits that follow within weeks: `bafb2801` incremental export with dirty-issue
tracking, `584cd1eb` auto-import, `97d78d26` *"Fix critical race conditions in auto-flush feature"* —
and eventually the daemon anyway. **The moment there are two representations, there is a reconciler,
and the reconciler is where the bugs live.** Yegge's own post-mortem names the result: *"bidirectional
sync, 3-way merge, two sources of truth, race conditions, and tombstone hell."*

The empirical counter-argument to reason one comes from the ecosystem (§6): `ticket` computes ready-work
in **a single AWK pass** over markdown files. The index earns its keep at a scale most stores never reach,
while the reconciliation bugs arrive in week one.

## 4. What Dolt was for, and what it genuinely delivered

The forcing function was concurrency, not tidiness. Per DoltHub's write-up, SQLite's last-write-wins
gave *"unrecoverable chaos"* and Gas Town **struggled past 4 concurrent agents**; with Dolt they
report ~160 on one host. The other half was auditability — agents need to see *which* agent changed
*what* and why ("semi-trusted writes"), which `dolt_log`/`dolt_diff` provide natively.

Yegge's framing ([DoltHub, 2026-01-15](https://www.dolthub.com/blog/2026-01-15-a-day-in-gas-town/)):

> **The sqlite+jsonl backend is clearly me reaching for Dolt without knowing about it.**

The deletion is the strongest evidence it worked. v0.50.0 removed ~19.7k lines of daemon/RPC;
v0.53.0 was titled *"11,000 Lines Deleted, Zero Features Lost,"* killing `internal/syncbranch/`
(5,720 lines), the snapshot manager, deletion tracking and the bespoke 3-way merge engine. Roughly
**38k lines of reconciliation scaffolding evaporated** because cell-level merge made the problem
class disappear. That is not a small win and should not be minimised.

## 5. What it cost

- **Binary size / build.** Linking Dolt in-process pulled the wazero WebAssembly runtime: *"168MB to
  41MB… ~127MB of binary weight and a 2-second JIT compilation penalty on every invocation."*
  Measured release assets: 8.8 MB (v0.46, pre-Dolt) → 41.2 MB (v1.0.0). Plus CGO and ICU4c, for a
  tool marketed as a single Go binary. Their fix was to **delete embedded mode entirely** (v0.56.0),
  making an external `dolt sql-server` mandatory — then rebuild embedded mode from scratch after the
  backlash.
- **Server lifecycle — the author's own verdict** (#2573): *"The Dolt server lifecycle has been the #1
  pain point since the migration, and the core issue is clear: standalone users shouldn't need to
  manage a database server."* That is the zero-config property SQLite gave for free, re-acquired at
  the cost of a DoltHub engineer landing 73 commits.
- **Resource burn.** `bd doctor`'s recursive CTE driving `dolt sql-server` to **120 GB RSS** on a
  2,682-issue database (#4475, open). Seven orphaned servers at ~38% CPU / 2 GB RSS and ~67 W battery
  drain (#4282). An upstream idle spin loop burning 18–20% CPU (dolt#10849).
- **Structural history bloat.** Every write mints a Dolt commit and `dolt gc` only reclaims what
  nothing references, so the chain stays reachable. Docs concede *"gigabytes of storage for a few
  thousand beads."* Open issue #4625: a 2.3 GB `.beads/` where the equivalent JSONL is 2.9 MB — ~800×.
  Recovery requires fencing every writer on every machine, force-pushing squashed history, re-cloning
  everywhere.
- **Data loss.** #2573 documents the loop: server crashes → all `bd` commands fail → agent runs
  `bd init` → "already initialized" → human deletes `.beads/` → issues gone. *"2+ complete database
  wipes with issue loss"* over two weeks. Also silent drift — 51 issues invisible to `bd list`, no error.
- **Concurrency was harder than advertised.** They built branch-per-worker then retired it: *"the
  concurrency wins are illusory… Branch isolation is the opposite of what a shared data plane
  requires."* Dolt is repeatable-read with no row locking, so beads invented application-level CAS — a
  shared `row_lock` cell rewritten on every status path to *force* a serialization conflict *"instead
  of silently cell-merging into a zombie claim."*
- **Engine leakage.** 159 non-test references typed to `storage.DoltStorage` across 61 files; the
  commit protocol fused into every write path. Their own pluggable-backends proposal concedes *"every
  command compiles against the full 144-method Dolt interface, so no second engine can exist."* One
  attempt died in four days as an 805-line wall of `panic("unimplemented")`. The project charter now
  carries a depguard-enforced rule — *"Beads should not become a storage engine… Avoid beads-side
  flocks, engine introspection, storage-specific retry loops, crash-recovery workarounds"* — which
  exists because all of those shipped.
- **Ongoing tax:** **102 of 426 open issues (24%) have "dolt" in the title** (measured via the GitHub
  search API, 2026-08-11). Not a snapshot artifact — an independent count days earlier gave 108/422.

**The irony worth recording.** Open issue #4796: two machines creating children under the same parent
produce a primary-key collision plus a `child_counters` conflict that Dolt's cell-level merge **cannot**
auto-resolve — *"the pull aborts and sync is blocked indefinitely,"* with no rebase path. Dolt was
adopted to end merge conflicts, and the one conflict class it cannot fix is **contended sequential ID
allocation** — precisely the `_next` landmine flagged in `git-backed-store-prior-art.md` §2.

## 6. The ecosystem reaction: three waves, and what survived

Three distinct backlashes, only the third about Dolt:

1. **Oct–Dec 2025** — JSONL merge conflicts and daemon corruption → `minibeads`
2. **Jan 2026** — code-quality backlash ("240k lines to manage markdown files") → `ticket`, `beans`, `trekker`
3. **Mar–Aug 2026** — the Dolt migration → `beads_rust`, `td`/`sidecar`, `dingles`, and mass pinning to v0.49.6

| Tool | Stars | Last commit | Storage | Merge strategy |
|---|---|---|---|---|
| Backlog.md | 6,437 | 2026-08-10 ✅ | one md file per task | cross-branch reconciliation |
| sidecar + td | 1,044 / 237 | 2026-08-11 ✅ | SQLite, **gitignored** | ducks git entirely |
| beads_rust (`br`) | 1,048 | 2026-08-10 ✅ | SQLite + JSONL, no daemon | 3-way vs saved base |
| beans | 897 | 2026-04-06 💤 | one md per issue, random IDs | git's own file merge |
| ticket (`tk`) | 856 | 2026-03-15 💀 | one md per ticket, urandom IDs | none (`sed` + `mv`) |
| ergo | 39 | 2026-08-05 ✅ | append-only txn log + lock | real transactions |
| minibeads (`mb`) | 12 | 2026-07-30 | md + YAML frontmatter per issue | coarse PID lock; conflicts resolved by a documented *agent prompt* |
| dingles | 0 | 2026-05-31 💀 | JSON per issue on a dedicated branch | `dingles merge`; author concedes races |

**Two findings matter more than the table.**

**(a) Nobody reimplemented Dolt.** Across the whole ecosystem there are only three strategies:
file-per-issue so git's own merge suffices; append-only log so conflicts are append/append; or
gitignore the database and delete the problem. Field-level merge exists **nowhere** except
beads_rust's base-snapshot sync. Everyone else either designed away the need or accepted losing an edit.

**(b) The reaction projects died; the parallel designs lived.** The two loudest anti-beads tools were
abandoned within ~3 months of peak attention (`ticket`, `beans`). The healthiest survivors —
Backlog.md and sidecar — were never primarily *about* beads. Being against an architecture is not a
maintenance strategy.

**`beads_rust` deserves precision** because its reputation is wrong. It is **not** an anti-Dolt fork;
it is a *freeze of pre-Dolt beads* with Yegge's public blessing: *"Rather than ask Steve to maintain a
legacy mode for my niche use case, I created this Rust port that freezes the 'classic beads'
architecture I depend on… This isn't a criticism of beads."* Its conformance tests pin against
`bd < 0.50`. It is genuinely alive (2,421 commits, 47 releases, on crates.io, 314 issues from ~130
distinct accounts). But it does **not** solve what pushed beads to Dolt: its merge is whole-row
last-write-wins (`PreferNewer => if l.updated_at >= r.updated_at`), so a `status` edit on one machine
and a `description` edit on another lose one of the two; its 3-way merge base is **gitignored**, so
clones share no common ancestor; and cross-machine sync is handed back to the user. It also depends
on `frankensqlite`, the author's own six-month-old from-scratch SQLite reimplementation — two of its
twelve open issues are B-tree corruption, including one the author filed after 264 sequential
`dep remove` calls turned a verified-clean database into `Rowid 6385 out of order`. Bus factor 1 by
explicit policy: zero human PRs merged.

## 7. Implications for the ctx node store

1. **Confirmation, strongly held: keep file-per-node.** `nodes/<id>/node.md` with nesting as the tree
   is the one strategy that survived across a dozen independent implementations. Two agents touching
   different nodes touch different files, and the conflict disappears by construction rather than by
   merge algorithm. This is also the cheapest possible answer to the concurrency problem that cost
   beads its entire architecture twice.
2. **Do not add a derived index "for `ready` performance" without evidence.** beads' dual-storage
   design was never justified on measurements; it was inherited. `ticket` computes ready-work in one
   AWK pass. The reconciler you would need arrives immediately; the performance you would gain arrives
   at a scale you may never see. If an index becomes necessary, make it **provably disposable** —
   rebuildable from the text with no write path of its own — which is the property beads lost the
   moment `bd create` wrote to SQLite first.
3. **The `_next` counter is the confirmed landmine, and this case sharpens it.**
   `git-backed-store-prior-art.md` §2 flagged contended sequential allocation as a known risk. beads
   #4796 is the empirical proof: it is the one conflict class that survived a migration to a
   cell-level-merging database specifically bought to eliminate merge conflicts. Buying a better
   merge engine does not fix it — only hash IDs, CAS-on-ref, or single-writer funnelling do. Every
   surviving markdown tool independently chose random or hash IDs.
4. **Watch for engine leakage as a design smell.** beads' `RunInTransaction(ctx, commitMsg, fn)` — a
   storage engine's commit message in a core signature — is how a swappable backend became
   unswappable across 61 files. The ctx equivalent to guard is letting the node store's git mechanics
   into the marker grammar or the scheduler's interfaces.
5. **Discount one risk.** Much of beads' pain is multi-machine, multi-agent, always-on-server pain.
   A solo store with a single MCP writer is immune to most of it — as `git-backed-store-prior-art.md`
   §1 also concluded. The transferable lessons are the two *architectural* ones (single source of
   truth; collision-free IDs), not the operational horror stories.

**Bottom line:** beads is a ten-month controlled experiment showing that the expensive problem is
never the storage format — it is having **two** of them. Each beads architecture was a reasonable
local response to its predecessor's worst defect, and the sequence still arrived back where it
started. The ctx store's single-source-of-truth, file-per-node design is on the surviving branch of
this tree; the two things that could push it onto the dead branch are a write-path index and a
contended counter.

Sources: beads git history at `05e3f99a` (commits `15afb5ad`, `1fc38ba7`, `6fd9dbda`; `GIT_WORKFLOW.md`,
`TEXT_FORMATS.md`, `cmd/bd/init.go`, `engdocs/PROJECT_CHARTER.md`, `PROPOSAL-pluggable-storage-backends.md`,
`engdocs/design/dolt-concurrency.md`) · beads issues #158, #2573, #4258, #4282, #4475, #4625, #4796, #4857 ·
beads.gascity.com docs (`architecture/dolt`, `recovery/history-squash`, `reference/troubleshooting`) ·
dolthub.com/blog 2026-01-15, 2026-01-22, 2026-03-13, 2026-04-02, 2026-07-22 ·
steve-yegge.medium.com "Gas Town: from Clown Show to v1.0" (2026-04-03) · HN 47770124, HN 46487580 ·
dolt issues #10563, #10849 · github.com/Dicklesworthstone/beads_rust (+ frankensqlite #426, #428) ·
MrLesk/Backlog.md · wedow/ticket · hmans/beans · rrnewton/minibeads · sandover/ergo · brianm/yatl ·
codeberg.org/mutablecc/dingles
