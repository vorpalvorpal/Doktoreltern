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

import ctx_core


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

    try:
        nodes = ctx_store.read_nodes(store)
        platform = _platform_from(store, nodes)
    except ctx_store.StoreError as exc:
        print(f"operational: {exc}", file=sys.stderr)
        return 2

    findings = run_checks(ctx_core.collate(nodes), platform)
    for f in findings:
        print(f)
    return exit_code(findings)


if __name__ == "__main__":
    raise SystemExit(main())
