#!/usr/bin/env python3
"""Append a 🔒 Seal: marker comment to a node — the backend for /seal and /unseal.

Both the user (via the slash command) and agents (via Bash) invoke this same
script, so the seal/unseal action never depends on a particular tool being
available (see #40.q2). The seal is append-only: a later comment supersedes an
earlier one under the fold, and the effective seal inherits to descendants unless
a child re-sets it.

Usage:
    ctx_seal.py <issue> sealed   [--store PATH] [--who @name]
    ctx_seal.py <issue> unsealed [--store PATH] [--who @name]
"""
from __future__ import annotations

import argparse
import datetime
import os
import sys

import ctx_store


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


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="ctx_seal")
    ap.add_argument("issue", type=int)
    ap.add_argument("state", choices=["sealed", "unsealed"])
    ap.add_argument("--store", default=None)
    ap.add_argument("--who", default=None)
    args = ap.parse_args(argv)

    store = args.store or os.environ.get("CTX_STORE")
    if not store:
        print("ctx_seal: no store given (pass --store or set CTX_STORE)", file=sys.stderr)
        return 1

    who = args.who
    body = seal_comment(args.state, who)
    ctx_store.add_comment(store, args.issue, body)
    print(f"#{args.issue}: {args.state}" + (f" by {who}" if who else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
