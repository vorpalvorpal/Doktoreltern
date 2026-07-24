# MAP

Orientation map for this repository. The **node tree is the source of truth**
for the workflow redesign: it lives in the ctx node store at `store/` (repo
root) — its **own git repo**, nested inside this one. Read
`nodes/<id>/node.md`; directory nesting *is* the tree. Every other document
in this repo is a working surface or a historical record, not authority.

## Where things live

- **Active whiteboards** — `docloop/workspace/*.md` (currently
  `whiteboard-restructure.md`). Whiteboards may **not** be cited as
  authority (store node #62): settled material is extracted into the tree
  and deleted from the whiteboard.
- **Archived whiteboards / drained move docs** —
  `docloop/workspace/archive/` (design, plan, construct, validate,
  artefact-ownership).
- **Research reports** — `research/` (the artefact-ownership survey plus
  six prior-art reports under `research/third-party-review/`).
- **Stale-doc snapshots** — `archive/` (e.g. `HANDOVER-2026-07-09.md`,
  `BACKLOG-2026-07.md`).
- **Walking-skeleton dogfood** — **RETIRED 2026-07-14**, archived to
  `archive/dogfood/` (gitignored; its own repo). A throwaway stand-in, now
  superseded by real dogfooding on an actual project; not authority and not part
  of the active workflow. See `archive/dogfood/ARCHIVED.md`.
- **Substrate code** — `ctx/scripts` and `ctx/ctx_mcp` (generic, no plugin
  owns it); run pytest from `ctx/`.
- **The docloop app** — `docloop/`; run vitest from `docloop/`.
- **Taking a docloop turn** — `docloop/HANDOFF.md`.
- **r-science skills** — `r-science/<skill>/SKILL.md`.
- **r-data skills** — `r-data/<skill>/SKILL.md` (data-engineering variant
  of the spine).

Claude-memory files and session records are not authority either; where
anything disagrees with the node tree, the tree wins.
