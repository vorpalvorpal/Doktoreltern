#!/usr/bin/env python3
"""Consistency linter CLI — wires fetch → collate → CHECKS → findings → exit code.

The invariant checks themselves live in `ctx_core.CHECKS` (pure, unit-tested);
this module is only the imperative wiring: pull a repo, build the model + platform
index, run every check, print findings, and choose an exit code.

Exit codes
----------
    0  clean (no "finding"-severity results; info/warning do not flip it)
    1  at least one "finding"
    2  operational failure (auth, rate limit, transport)

Maps to #24 (substrate: consistency linter).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import ctx_core

# v2 (CONTRACT-v2.md) — dot-prefixed dirs that are recognised node components.
# Anything else dot-prefixed under a node dir is an L3 finding.
_KNOWN_COMPONENT_DIRS = frozenset({".comments", ".tests", ".records", ".attachments"})


def exit_code(findings: list) -> int:
    """1 if any finding-severity result is present, else 0.

    Only severity == "finding" flips the code; "warning" and "info" do not.
    """
    return 1 if any(f.severity == "finding" for f in findings) else 0


def run_checks(model, platform) -> list:
    """Run every check in ctx_core.CHECKS and concatenate their findings."""
    findings: list = []
    for check in ctx_core.CHECKS.values():
        findings.extend(check(model, platform))
    return findings


def _component_findings(node_id: int, filename: str, text: str) -> list:
    """Run ctx_core.parse over one component's text and re-key its findings.

    parse() findings carry issue=0 (parse() has no notion of which node it is
    parsing) and a bare detail; fs_checks knows both the node id and which
    component file the text came from, so each finding is rebuilt keyed to
    that filename with the original line folded into the detail (L1).
    """
    out = []
    for f in ctx_core.parse(text).findings:
        out.append(ctx_core.Finding(
            node_id, filename, f"line {f.line}: {f.detail}", line=f.line,
        ))
    return out


def fs_checks(store: str) -> list:
    """Walk <store>/nodes; return v2 structural + per-component-parse findings.

    Defensive: never raises on a malformed tree (bad dir names are findings,
    not crashes) — this is what lets `main` call it unconditionally, before it
    knows whether the tree is even readable by `read_nodes`. Walks the
    filesystem itself, independent of read_nodes.

    Rules (each -> a "finding"-severity ctx_core.Finding):
      L1 per-component parse: node.md's body (frontmatter stripped) plus any
         present design.md/spec.md/log.md are each run through ctx_core.parse;
         findings are re-keyed to the component filename (see
         _component_findings). `.comments/` is out of scope (frozen v1
         evidence) — only the file components and node.md are parsed.
      L2 child-id validity: a non-dot subdir whose name isn't a decimal
         integer -> key "child-id", reported against the enclosing node (the
         one case that would otherwise crash read_nodes at int(name)).
      L3 dot-dir is a known component: a dot-prefixed subdir not in
         _KNOWN_COMPONENT_DIRS -> key "dot-dir".
      L4 component-bearing node needs node.md: a node dir with any component
         (a file in ctx_store._FILE_COMPONENTS, or a known dot-dir) but no
         node.md -> key "node-md".
    """
    import ctx_store

    findings: list = []
    nodes_dir = Path(store) / "nodes"
    if not nodes_dir.is_dir():
        return findings

    def _check_node(node_dir: Path, node_id: int) -> None:
        has_node_md = (node_dir / "node.md").exists()
        has_file_component = any(
            (node_dir / name).exists() for name in ctx_store._FILE_COMPONENTS
        )
        has_dot_component = any(
            (node_dir / name).is_dir() for name in _KNOWN_COMPONENT_DIRS
        )
        if (has_file_component or has_dot_component) and not has_node_md:
            findings.append(ctx_core.Finding(
                node_id, "node-md", "component files present but no node.md",
            ))

        if has_node_md:
            try:
                _, body = ctx_store._read_node_file(node_dir / "node.md")
            except ctx_store.StoreError:
                pass  # malformed frontmatter: read_nodes surfaces this itself
            else:
                findings.extend(_component_findings(node_id, "node.md", body))
        for name in ctx_store._FILE_COMPONENTS:
            path = node_dir / name
            if path.exists():
                findings.extend(_component_findings(node_id, name, path.read_text()))

    def _walk(dir_path: Path, owner_id) -> None:
        for entry in sorted(dir_path.iterdir()):
            if not entry.is_dir():
                continue
            name = entry.name
            if name.startswith("."):
                if name not in _KNOWN_COMPONENT_DIRS:
                    findings.append(ctx_core.Finding(
                        owner_id if owner_id is not None else 0,
                        "dot-dir", f"unknown component dir: {name!r}",
                    ))
                continue
            try:
                child_id = int(name)
            except ValueError:
                findings.append(ctx_core.Finding(
                    owner_id if owner_id is not None else 0,
                    "child-id", f"non-integer node dir: {name!r}",
                ))
                continue
            _check_node(entry, child_id)
            _walk(entry, child_id)

    _walk(nodes_dir, None)
    return findings


def _platform_from(store: str, nodes: list):
    """Empty Platform: there is no platform to derive one from post-migration.

    `Platform` is vestigial (see CONTRACT.md A5) — I1/I2, the only checks that
    read it, are deleted. Kept as a call site so `run_checks` still receives the
    `(model, platform)` shape the surviving checks expect.
    """
    return ctx_core.Platform(set(), {}, False)


def main(argv: list | None = None) -> int:
    """CLI entry: `ctx_lint <store-path>`."""
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv:
        print("usage: ctx_lint <store-path>", file=sys.stderr)
        return 2
    store = argv[0]
    import ctx_store

    if not os.path.isdir(os.path.join(store, ".git")):
        print(f"operational: not a store (no .git found): {store}", file=sys.stderr)
        return 2

    # fs_checks never raises, so it runs first even against a tree read_nodes
    # cannot walk. A "child-id" finding means read_nodes would crash at
    # int(name) — short-circuit before calling it.
    fs = fs_checks(store)
    if any(f.key == "child-id" for f in fs):
        for f in fs:
            print(f)
        return exit_code(fs)

    try:
        nodes = ctx_store.read_nodes(store)
        platform = _platform_from(store, nodes)
    except ctx_store.StoreError as exc:
        print(f"operational: {exc}", file=sys.stderr)
        return 2

    findings = fs + run_checks(ctx_core.collate(nodes), platform)
    for f in findings:
        print(f)
    return exit_code(findings)


if __name__ == "__main__":
    raise SystemExit(main())
