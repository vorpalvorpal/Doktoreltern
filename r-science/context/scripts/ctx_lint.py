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


def _platform_from(repo: str, nodes: list):
    """Best-effort Platform index from the live repo (sub-issue edges + labels).

    Derived, not canonical — text markers are the source of truth; this is what
    the linter diffs them against. Built via the fetch adapter; `settable` reflects
    whether this environment can write sub-issue edges back.
    """
    import ctx_fetch

    edges: set = set()
    labels: dict = {}
    settable = ctx_fetch._has_gh()
    for nd in nodes:
        labels[nd.number] = set(nd.labels)
    # Parent links are not on Node; fetch them per issue when gh is available.
    if settable:
        for nd in nodes:
            try:
                d = ctx_fetch._gh_json([
                    "issue", "view", str(nd.number), "--repo", repo, "--json", "parent",
                ])
            except ctx_fetch.FetchError:
                continue
            parent = (d or {}).get("parent")
            if parent:
                edges.add((parent["number"], nd.number))
    return ctx_core.Platform(edges, labels, settable)


def main(argv: list | None = None) -> int:
    """CLI entry: `ctx_lint <owner/repo>`."""
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv:
        print("usage: ctx_lint <owner/repo>", file=sys.stderr)
        return 2
    repo = argv[0]
    import ctx_fetch

    try:
        nodes = ctx_fetch.fetch_repo(repo)
        platform = _platform_from(repo, nodes)
    except ctx_fetch.FetchError as exc:
        print(f"operational: {exc}", file=sys.stderr)
        return 2

    findings = run_checks(ctx_core.collate(nodes), platform)
    for f in findings:
        print(f)
    return exit_code(findings)


if __name__ == "__main__":
    raise SystemExit(main())
