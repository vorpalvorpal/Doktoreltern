#!/usr/bin/env python3
"""Append a 🔒 Seal: marker comment to a node — the backend for /seal and /unseal.

Both the user (via the slash command) and agents (via Bash) invoke this same
script, so the seal/unseal action never depends on a particular tool being
available (see #40.q2). The seal is append-only: a later comment supersedes an
earlier one under the fold, and the effective seal inherits to descendants unless
a child re-sets it.

Usage:
    ctx_seal.py <issue> sealed   [--repo owner/repo] [--who @name]
    ctx_seal.py <issue> unsealed [--repo owner/repo] [--who @name]
"""
from __future__ import annotations

import argparse
import datetime
import subprocess
import sys


def seal_comment(state: str, who: str | None = None, date: str | None = None) -> str:
    """Build the comment body carrying the 🔒 Seal: marker (pure, testable)."""
    date = date or datetime.date.today().isoformat()
    head = f"🔒 Seal: {state}"
    if who:
        head += f" {who}"
    head += f" {date}"
    verb = "Unsealed" if state == "unsealed" else "Sealed"
    return (f"{head}\n\n{verb} via ctx_seal; the effective seal inherits to "
            f"descendants unless a child re-sets it.")


def _gh(args: list, **kw):
    return subprocess.run(["gh", *args], text=True, check=True, **kw)


def _current_repo() -> str:
    out = _gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
              capture_output=True).stdout
    return out.strip()


def _current_user() -> str | None:
    try:
        out = _gh(["api", "user", "-q", ".login"], capture_output=True).stdout.strip()
        return f"@{out}" if out else None
    except subprocess.CalledProcessError:
        return None


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="ctx_seal")
    ap.add_argument("issue", type=int)
    ap.add_argument("state", choices=["sealed", "unsealed"])
    ap.add_argument("--repo", default=None)
    ap.add_argument("--who", default=None)
    args = ap.parse_args(argv)

    repo = args.repo or _current_repo()
    who = args.who or _current_user()
    body = seal_comment(args.state, who)
    _gh(["issue", "comment", str(args.issue), "--repo", repo, "--body", body])
    print(f"#{args.issue}: {args.state}" + (f" by {who}" if who else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
