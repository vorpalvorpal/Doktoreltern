#!/usr/bin/env python3
"""One-time importer: GitHub issues -> local ctx_store (issue #60 migration).

Preserves issue NUMBERS as node ids — bodies reference each other via
`Part-of: #N` markers, so re-numbering would break every parent edge. That
means writing node files directly (via ctx_store's low-level helpers) rather
than through `create_node`, which auto-allocates ids from `_next`.

Not part of the runtime substrate; kept in dev/ for reproducibility. Uses `gh`
(the only remaining GitHub touch, and only for this bootstrap).

Usage:  uvx python r-science/context/dev/import_issues.py [--repo owner/repo] [--store path]
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE.parent / "scripts"))
import ctx_core   # noqa: E402
import ctx_store  # noqa: E402

DEFAULT_REPO = "vorpalvorpal/Doktoreltern"
DEFAULT_STORE = str(_HERE.parent / "store")


def _gh_json(args: list) -> object:
    out = subprocess.run(["gh", *args], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def _norm_reason(sr: str | None) -> str | None:
    sr = (sr or "").lower()
    return sr or None


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=DEFAULT_REPO)
    ap.add_argument("--store", default=DEFAULT_STORE)
    args = ap.parse_args(argv)

    if (Path(args.store) / ".git").exists():
        sys.exit(f"store already exists at {args.store}; refusing to overwrite")
    ctx_store.init_store(args.store)

    numbers = sorted(
        d["number"] for d in _gh_json(
            ["issue", "list", "--repo", args.repo, "--state", "all",
             "--limit", "300", "--json", "number"]
        )
    )
    print(f"importing {len(numbers)} issues from {args.repo} -> {args.store}")

    lint_warnings: list = []
    for n in numbers:
        d = _gh_json([
            "issue", "view", str(n), "--repo", args.repo,
            "--json", "number,title,body,state,stateReason,labels,comments",
        ])
        body = d.get("body") or ""
        labels = [lbl["name"] for lbl in d.get("labels", [])]
        ctx_store._write_node_file(
            ctx_store._node_file(args.store, n),
            title=d.get("title") or "",
            state=(d.get("state") or "open").lower(),
            state_reason=_norm_reason(d.get("stateReason")),
            labels=labels,
            body=body,
        )
        comments = d.get("comments") or []
        if comments:
            cdir = ctx_store._comments_dir(args.store, n)
            cdir.mkdir(parents=True, exist_ok=True)
            for i, c in enumerate(comments, start=1):
                (cdir / f"{i:04d}.md").write_text(c.get("body") or "")

        findings = ctx_core.parse(body).findings
        if findings:
            lint_warnings.append((n, [str(f) for f in findings]))

    ctx_store._next_path(args.store).write_text(f"{max(numbers) + 1}\n")
    ctx_store._commit(
        args.store,
        f"import: {len(numbers)} GitHub issues -> local store (one-time #60 migration)",
    )

    nodes = ctx_store.read_nodes(args.store)
    model = ctx_core.collate(nodes)
    print(f"wrote {len(nodes)} nodes; {len(model.tree_edges)} tree edges; "
          f"_next now {ctx_store._next_path(args.store).read_text().strip()}")
    if lint_warnings:
        print(f"{len(lint_warnings)} node(s) with body-lint findings:")
        for n, fs in lint_warnings:
            print(f"  #{n}: {fs}")
    else:
        print("no body-lint findings")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
