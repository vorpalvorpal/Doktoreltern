# MAP

Orientation map for this repository. The **node tree is the source of truth**
for the workflow redesign: it lives in the ctx node store at
`r-science/context/store` — its **own git repo**, nested inside this one.
Read `nodes/<id>/node.md`; directory nesting *is* the tree. Every other
document in this repo is a working surface or a historical record, not
authority.

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
- **Walking-skeleton dogfood** — `docloop/dogfood/` (gitignored; its own
  repo).
- **Substrate code** — `r-science/context/scripts` and
  `r-science/context/ctx_mcp`; run pytest from `r-science/context`.
- **The docloop app** — `docloop/`; run vitest from `docloop/`.
- **Taking a docloop turn** — `docloop/HANDOFF.md`.
- **r-science skills** — `r-science/<skill>/SKILL.md`.

Claude-memory files and session records are not authority either; where
anything disagrees with the node tree, the tree wins.
