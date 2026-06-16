"""Artefact cache — the third store. Content-addressed, disposable, LRU-GC'd.

Issues stay primary: a ``🗄️ Artefact:`` marker records *what · how · where*, so
anything here can be **recreated from its recipe** if the cache is gone. Losing
the cache is non-fatal — it only avoids redoing expensive work. GC is aggressive:
a size-bounded LRU, drop anything anytime (#43.q1).

The cache directory is ``$CTX_CACHE_DIR`` (default ``tmp/art``), gitignored.
Maps to #43 (substrate: artefact cache).
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path

_DEFAULT = "tmp/art"


def cache_dir() -> Path:
    return Path(os.environ.get("CTX_CACHE_DIR", _DEFAULT))


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def store(data, *, suffix: str = "") -> str:
    """Content-address `data` (bytes or str) into the cache; return its sha256.

    Idempotent: identical content maps to the same file, so re-storing is free.
    """
    if isinstance(data, str):
        data = data.encode()
    sha = _sha(data)
    d = cache_dir()
    d.mkdir(parents=True, exist_ok=True)
    p = d / f"{sha}{suffix}"
    if not p.exists():
        p.write_bytes(data)
    return sha


def path_for(sha: str, *, suffix: str = "") -> Path:
    return cache_dir() / f"{sha}{suffix}"


def exists(sha: str, *, suffix: str = "") -> bool:
    return path_for(sha, suffix=suffix).exists()


def _files() -> list:
    d = cache_dir()
    return [f for f in d.iterdir() if f.is_file()] if d.exists() else []


def total_bytes() -> int:
    return sum(f.stat().st_size for f in _files())


def gc(max_bytes: int) -> list:
    """Evict oldest-mtime files until total size ``<= max_bytes``.

    Returns the list of removed paths (as strings). A no-op (returns ``[]``) when
    already under the bound.
    """
    files = sorted(_files(), key=lambda f: f.stat().st_mtime)
    total = sum(f.stat().st_size for f in files)
    removed: list = []
    for f in files:
        if total <= max_bytes:
            break
        size = f.stat().st_size
        f.unlink()
        total -= size
        removed.append(str(f))
    return removed
