"""One-time dev assist for the #42 stage-4 v2 migration. NOT runtime.

Per CONTRACT-v2.md "Pinned API — Stage 4 tooling": the migration is a
content-preserving reorganisation — a node's markers/prose move out of
node.md's body into design.md/spec.md/log.md, and node.md becomes a thin
index (frontmatter kept, body emptied). *Where* each marker goes is a
per-node LLM judgement call (D1/D2, #64.q2), not something this module
decides; it only performs the mechanical move (given already-sorted
component bodies) and checks the result for semantic equivalence.

Two pieces:
    apply_split(store, node_id, *, design="", spec="", log="")
        Validate-then-write-then-one-commit for a single node.
    verify_migration(before_store, after_store) -> list[str]
        The safety gate: prove collate(read_nodes(...)) is unchanged
        (same tree, same per-node markers/gauges/relations) and that the
        migrated store still lints clean. [] means clean.

Imports `ctx_store`/`ctx_core`/`ctx_lint` directly (not path-relative) — this
module is run and tested with `scripts/` already on `sys.path` (the test
suite's conftest.py does this; a manual run needs the same).
"""
from __future__ import annotations

from pathlib import Path

import ctx_core
import ctx_lint
import ctx_store


def apply_split(store, node_id, *, design: str = "", spec: str = "", log: str = "") -> None:
    """Split a v1 node's body into file components; node.md becomes a thin index.

    Resolves the node dir via ``ctx_store._node_dir``; ``node.md`` must exist
    else ``StoreError``. Every non-empty component body is validated
    (``ctx_core.parse(body).findings``) up front, before anything is written —
    a malformed body raises ``ValidationError`` and the store is left
    byte-unchanged (atomic per node). Only non-empty components are written;
    node.md is rewritten with its original frontmatter and an empty body.
    Exactly one commit: ``node #<id>: v2 component split``.
    """
    store_path = Path(store)
    node_dir = ctx_store._node_dir(store_path, node_id)
    node_file = node_dir / "node.md"
    if not node_file.exists():
        raise ctx_store.StoreError(f"no such node: {node_id}")

    bodies = {"design.md": design, "spec.md": spec, "log.md": log}
    # _FILE_COMPONENTS order is load-bearing (fixed write order); keep only
    # the non-empty pieces — an empty component is simply not written.
    non_empty = {
        name: bodies[name] for name in ctx_store._FILE_COMPONENTS if bodies[name]
    }

    # Validate ALL non-empty bodies up front — nothing is written until every
    # one of them is confirmed clean. Same lint-before-write helper the rest
    # of the write path uses (ctx_core.parse(body).findings -> ValidationError).
    for body in non_empty.values():
        ctx_store._validate(body)

    frontmatter, _old_body = ctx_store._read_node_file(node_file)

    for name, body in non_empty.items():
        (node_dir / name).write_text(body)

    ctx_store._write_node_file(
        node_file,
        title=frontmatter["title"],
        state=frontmatter["state"],
        state_reason=frontmatter["state_reason"],
        labels=frontmatter["labels"],
        body="",
    )

    ctx_store._commit(store_path, f"node #{node_id}: v2 component split")


def _fingerprint(model: "ctx_core.Model", node_id: int) -> dict:
    """Everything verify_migration compares for one node.

    (title, state, state_reason, sorted(labels)), gauges, sorted boundaries,
    sorted blocked_by, the design_links entry, sorted aspects, the per-node
    keyed markers as {id: status} across every keyed kind (from
    model.registries), and the per-node registry (eq/cites) keys.
    """
    node = model.nodes.get(node_id)

    # {id: (status, text)} — comparing the text too catches a rationale marker
    # whose body was truncated/altered while its id+status survived (a verbatim
    # move parses identically, so a faithful split does not trip this).
    keyed: dict = {}
    for _kind, items in model.registries.items():
        for issue, kv in items:
            if issue == node_id:
                keyed[kv.id] = (kv.status, kv.text)

    registry_keys = sorted(
        key for key, issues in model.registry.items() if node_id in issues
    )

    return {
        "title": node.title if node else None,
        "state": node.state if node else None,
        "state_reason": node.state_reason if node else None,
        "labels": sorted(node.labels) if node else [],
        "gauges": dict(model.gauges.get(node_id, {})),
        "boundaries": sorted(model.boundaries.get(node_id, [])),
        "blocked_by": sorted(model.blocked_by.get(node_id, [])),
        "design_links": model.design_links.get(node_id),
        "aspects": sorted(model.aspects.get(node_id, [])),
        "keyed": keyed,
        "registry_keys": registry_keys,
    }


def _diff_node(node_id: int, before: dict, after: dict) -> list:
    """Human-readable discrepancy strings for one node's before/after fingerprint.

    Scalar/list fields diff whole; the two dict-valued fields (gauges, keyed)
    diff per inner key so the message names the specific gauge/marker that
    differs, e.g. "#33: gauge fidelity before=interface after=None".
    """
    out: list = []

    for field in ("title", "state", "state_reason", "labels", "boundaries",
                  "blocked_by", "design_links", "aspects", "registry_keys"):
        if before[field] != after[field]:
            out.append(
                f"#{node_id}: {field} before={before[field]!r} after={after[field]!r}"
            )

    gauge_keys = sorted(set(before["gauges"]) | set(after["gauges"]))
    for key in gauge_keys:
        b, a = before["gauges"].get(key), after["gauges"].get(key)
        if b != a:
            out.append(f"#{node_id}: gauge {key} before={b!r} after={a!r}")

    keyed_ids = sorted(set(before["keyed"]) | set(after["keyed"]))
    for kid in keyed_ids:
        b, a = before["keyed"].get(kid), after["keyed"].get(kid)
        if b != a:
            out.append(f"#{node_id}: keyed {kid} before={b!r} after={a!r}")

    return out


def verify_migration(before_store, after_store) -> list:
    """Compare before/after stores; [] means the split changed nothing semantic.

    Compares collate(read_nodes(...)) of both stores: same set of node ids,
    same tree_edges, and an identical per-node fingerprint (see
    _fingerprint). Then runs the lint over after_store (fs_checks +
    run_checks) — any finding there is also a discrepancy, since the migrated
    tree must stay schema-clean. Returns human-readable discrepancy strings
    naming the node and the field that differs; [] means clean.
    """
    before_model = ctx_core.collate(ctx_store.read_nodes(before_store))
    after_nodes = ctx_store.read_nodes(after_store)
    after_model = ctx_core.collate(after_nodes)

    discrepancies: list = []

    before_ids = set(before_model.nodes)
    after_ids = set(after_model.nodes)
    missing = sorted(before_ids - after_ids)
    added = sorted(after_ids - before_ids)
    if missing:
        discrepancies.append(f"node set: missing after migration: {missing}")
    if added:
        discrepancies.append(f"node set: unexpected new nodes after migration: {added}")

    missing_edges = sorted(before_model.tree_edges - after_model.tree_edges)
    added_edges = sorted(after_model.tree_edges - before_model.tree_edges)
    if missing_edges:
        discrepancies.append(f"tree_edges: missing after migration: {missing_edges}")
    if added_edges:
        discrepancies.append(f"tree_edges: unexpected new edges after migration: {added_edges}")

    for node_id in sorted(before_ids & after_ids):
        before_fp = _fingerprint(before_model, node_id)
        after_fp = _fingerprint(after_model, node_id)
        discrepancies.extend(_diff_node(node_id, before_fp, after_fp))

    fs = ctx_lint.fs_checks(after_store)
    platform = ctx_lint._platform_from(after_store, after_nodes)
    lint_findings = fs + ctx_lint.run_checks(after_model, platform)
    for finding in lint_findings:
        discrepancies.append(f"lint: {finding}")

    return discrepancies
