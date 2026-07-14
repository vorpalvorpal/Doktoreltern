"""Local git-backed store — the imperative shell for node/comment I/O.

Replaces `ctx_fetch`'s GitHub calls with plain directory I/O plus real git
commits. See dev/CONTRACT.md ("ctx_store public API") and
dev/01-store-substrate.md (requirements R1-R10, R4b) for the pinned contract.

Layout (a store is its own git repo). The node tree is the directory nesting:
any non-dotted subdir is a CHILD node; a dot-prefixed subdir (.comments) is a
COMPONENT of the enclosing node. A node's parent is its nearest non-dotted
ancestor dir (None for a root directly under nodes/).

    <store>/
      _next                     # plain text: next id to allocate, e.g. "17\n"
      nodes/
        <id>/                   # a root node (parent = None)
          node.md               # YAML-ish frontmatter + Markdown body
          .comments/            # dot-prefixed → a component, not a child node
            0001.md
            0002.md
          <child-id>/           # a child node nests inside its parent's dir
            node.md
"""
from __future__ import annotations

import subprocess
from pathlib import Path

import ctx_core

_FRONTMATTER_KEYS = ("title", "state", "state_reason", "labels")

# v2 (CONTRACT-v2.md) — file components under a node dir, alongside node.md.
# FIXED ORDER, load-bearing: this is the order pieces are concatenated in.
_FILE_COMPONENTS = ("design.md", "spec.md", "log.md")


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------
class StoreError(Exception):
    """Base class for all store failures."""


class ValidationError(StoreError):
    """Text carries malformed markers; the write was refused before disk."""

    def __init__(self, findings):
        self.findings = list(findings)
        super().__init__("; ".join(str(f) for f in self.findings) or "invalid markers")


# ---------------------------------------------------------------------------
# R1 — layout helpers (no directory-creation side effects)
# ---------------------------------------------------------------------------
def _nodes_dir(store) -> Path:
    return Path(store) / "nodes"


def _iter_node_dirs(dir_path: Path, parent_id):
    """Recursively yield (path, node_id, parent_id) for every node dir under
    `dir_path`.

    Descends only through node dirs. A **component** dir is marked by a leading
    ``.`` (``.comments``, ``.records``); any other subdirectory is a **child
    node**. So the node/component split is the dot-prefix, not the name shape —
    node names carry no other requirement (ids happen to be integers, allocated
    by `_next`). `parent_id` is the nearest ancestor node's id (None at the top,
    directly under nodes/).
    """
    if not dir_path.is_dir():
        return
    for entry in sorted(dir_path.iterdir()):
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        node_id = int(entry.name)
        yield entry, node_id, parent_id
        yield from _iter_node_dirs(entry, node_id)


def _node_dir(store, node_id) -> Path:
    """Resolve a node id to its directory by walking the nested tree.

    A node dir may sit anywhere under nodes/ (roots directly under it, children
    nested inside their parent's dir). Returns the matching dir, or the flat
    ``nodes/<id>`` path when the id is not found — so missing-node callers
    (``_node_file(...).exists()`` guards) behave exactly as before. A fresh walk
    per call is fine at this scale.
    """
    target = str(node_id)
    for path, _nid, _pid in _iter_node_dirs(_nodes_dir(store), None):
        if path.name == target:
            return path
    return _nodes_dir(store) / target


def _next_path(store) -> Path:
    return Path(store) / "_next"


def _comments_dir(store, node_id) -> Path:
    # `.comments` — a component dir, dot-prefixed so it is never mistaken for a
    # child node (the node/component split is the leading dot; see _iter_node_dirs).
    return _node_dir(store, node_id) / ".comments"


def _node_file(store, node_id) -> Path:
    return _node_dir(store, node_id) / "node.md"


# ---------------------------------------------------------------------------
# R2 — node.md (de)serialization
# ---------------------------------------------------------------------------
def _fmt_scalar(value) -> str:
    if value is None:
        return ""
    return str(value)


def _write_node_file(path, *, title, state, state_reason, labels, body) -> None:
    path = Path(path)
    labels = list(labels or [])
    lines = ["---"]
    lines.append(f"title: {title}")
    lines.append(f"state: {state}")
    lines.append(f"state_reason: {_fmt_scalar(state_reason)}")
    if labels:
        items = ", ".join(labels)
        lines.append(f"labels: [{items}]")
    else:
        lines.append("labels: []")
    lines.append("---")
    header = "\n".join(lines) + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(header + body)


def _parse_labels(raw: str) -> list:
    raw = raw.strip()
    if raw.startswith("[") and raw.endswith("]"):
        inner = raw[1:-1].strip()
        if not inner:
            return []
        return [item.strip() for item in inner.split(",")]
    return []


def _read_node_file(path):
    path = Path(path)
    text = path.read_text()
    if not text.startswith("---"):
        raise StoreError(f"malformed node file (no opening frontmatter fence): {path}")
    rest = text[3:]
    end = rest.find("\n---")
    if end == -1:
        raise StoreError(f"malformed node file (no closing frontmatter fence): {path}")
    fm_block = rest[:end]
    after = rest[end + 4:]
    # after the closing fence: normalise a single leading newline before body
    if after.startswith("\n"):
        after = after[1:]
    body = after

    frontmatter = {"title": "", "state": "open", "state_reason": None, "labels": []}
    for line in fm_block.splitlines():
        if not line.strip():
            continue
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()
        if key not in _FRONTMATTER_KEYS:
            continue
        if key == "state_reason":
            frontmatter[key] = value if value else None
        elif key == "labels":
            frontmatter[key] = _parse_labels(value)
        else:
            frontmatter[key] = value

    return frontmatter, body


# ---------------------------------------------------------------------------
# R3 — read_comments
# ---------------------------------------------------------------------------
def read_comments(store, node_id) -> list:
    comments_dir = _comments_dir(store, node_id)
    if not comments_dir.is_dir():
        return []
    out = []
    for path in comments_dir.iterdir():
        if not path.name.endswith(".md"):
            continue
        try:
            seq = int(path.stem)
        except ValueError:
            continue
        text = path.read_text()
        if text.endswith("\n"):
            text = text[:-1]
        out.append(ctx_core.Comment(seq, text))
    out.sort(key=lambda c: c.seq)
    return out


# ---------------------------------------------------------------------------
# v2 (CONTRACT-v2.md) — component concat
# ---------------------------------------------------------------------------
def _read_component(node_dir, name: str) -> str:
    """Text of node_dir/name, or "" when the file is absent."""
    path = Path(node_dir) / name
    if not path.exists():
        return ""
    return path.read_text()


def _concat_body(node_dir, node_body: str) -> str:
    """A node's Node.body = the present component pieces joined by a blank line.

    pieces = [node_body, design.md text, spec.md text, log.md text] in that fixed
    order; keep only non-empty pieces; join with exactly "\n\n" between adjacent
    present pieces. One present piece is returned verbatim (byte-identical) — this
    is what makes a v1 node's concat identical to its node.md body. Zero pieces → "".
    """
    pieces = [node_body] + [_read_component(node_dir, name) for name in _FILE_COMPONENTS]
    present = [p for p in pieces if p]
    return "\n\n".join(present)


# ---------------------------------------------------------------------------
# v2 (CONTRACT-v2.md Stage 2) — read_components, symmetric with read_comments
# ---------------------------------------------------------------------------
def read_components(store, node_id) -> dict:
    """The node's present file components as ``{filename: text}``, in
    ``_FILE_COMPONENTS`` order (absent files omitted).

    Resolves the node dir via ``_node_dir`` (handles nesting). A missing node
    dir, or a dir with none of the file components present, → ``{}`` — never
    raises, so it is safe to call for an injected-fetch RepoSource whose
    ``store`` is not a real path.
    """
    node_dir = _node_dir(store, node_id)
    if not node_dir.is_dir():
        return {}
    out = {}
    for name in _FILE_COMPONENTS:
        path = node_dir / name
        if path.exists():
            out[name] = path.read_text()
    return out


# ---------------------------------------------------------------------------
# R4 — read_nodes
# ---------------------------------------------------------------------------
def read_nodes(store) -> list:
    nodes_dir = _nodes_dir(store)
    if not nodes_dir.is_dir():
        return []

    # Walk the nested tree; each non-dotted dir is a node whose parent is its
    # nearest non-dotted ancestor (None for a root). Ascending by id.
    entries = sorted(_iter_node_dirs(nodes_dir, None), key=lambda e: e[1])

    out = []
    for path, node_id, parent_id in entries:
        node_file = path / "node.md"
        if not node_file.exists():
            continue
        frontmatter, node_body = _read_node_file(node_file)
        body = _concat_body(path, node_body)
        comments = read_comments(store, node_id)
        out.append(ctx_core.Node(
            node_id,
            body,
            frontmatter.get("state", "open"),
            frontmatter.get("state_reason"),
            set(frontmatter.get("labels") or []),
            comments,
            title=frontmatter.get("title", ""),
            parent=parent_id,
        ))
    return out


# ---------------------------------------------------------------------------
# R4b — init_store
# ---------------------------------------------------------------------------
def _run_git(store, *args, check=True):
    return subprocess.run(
        ["git", "-C", str(store), *args],
        check=check, capture_output=True, text=True,
    )


def init_store(store) -> None:
    store_path = Path(store)
    if (store_path / ".git").exists():
        return  # idempotent no-op
    store_path.mkdir(parents=True, exist_ok=True)
    _run_git(store_path, "init")

    # Ensure a git identity exists so the initial commit succeeds in CI.
    id_check = _run_git(store_path, "config", "user.email", check=False)
    if id_check.returncode != 0 or not id_check.stdout.strip():
        _run_git(store_path, "config", "user.email", "ctx-store@local")
        _run_git(store_path, "config", "user.name", "ctx-store")

    _next_path(store_path).write_text("1\n")
    _run_git(store_path, "add", "-A")
    _run_git(store_path, "commit", "-m", "init store",
              "--author", "ctx-store <ctx-store@local>")


# ---------------------------------------------------------------------------
# R5 — id allocation
# ---------------------------------------------------------------------------
def _alloc_id(store) -> int:
    path = _next_path(store)
    if path.exists():
        current = int(path.read_text().strip() or "1")
    else:
        current = 1
    path.write_text(f"{current + 1}\n")
    return current


# ---------------------------------------------------------------------------
# R8 — lint-before-write
# ---------------------------------------------------------------------------
def _validate(body: str) -> None:
    findings = ctx_core.parse(body).findings
    if findings:
        raise ValidationError(findings)


# ---------------------------------------------------------------------------
# R9 — git-per-write
# ---------------------------------------------------------------------------
def _commit(store, msg: str) -> None:
    store_path = Path(store)
    if not (store_path / ".git").exists():
        raise StoreError(f"not a store (no .git found): {store_path}")
    _run_git(store_path, "add", "-A")
    status = _run_git(store_path, "status", "--porcelain")
    if not status.stdout.strip():
        raise StoreError(f"empty commit refused (no staged changes): {msg}")
    _run_git(store_path, "commit", "-m", msg,
              "--author", "ctx-store <ctx-store@local>")


# ---------------------------------------------------------------------------
# R6 — create_node
# ---------------------------------------------------------------------------
def create_node(store, title: str, body: str, *, parent=None, labels=None) -> int:
    """Create a node, allocating the next id from _next and committing once.

    The tree is the filesystem: with `parent` given, the new node dir nests
    inside that parent's dir (``<parent path>/<newid>/``); otherwise it is a root
    directly under ``nodes/``. There is no Part-of marker — the parent comes from
    this argument, never from the body.
    """
    store_path = Path(store)
    if not (store_path / ".git").exists():
        raise StoreError(f"not a store (no .git found): {store_path}")

    _validate(body)

    if parent is None:
        parent_dir = _nodes_dir(store_path)
    else:
        parent_dir = _node_dir(store_path, parent)
        if not (parent_dir / "node.md").exists():
            raise StoreError(f"no such parent node: {parent}")

    node_id = _alloc_id(store_path)
    node_file = parent_dir / str(node_id) / "node.md"
    _write_node_file(
        node_file, title=title, state="open", state_reason=None,
        labels=labels or [], body=body,
    )
    _commit(store_path, f"node #{node_id}: create")
    return node_id


# ---------------------------------------------------------------------------
# R7 — add_comment / update_comment / set_state
# ---------------------------------------------------------------------------
def add_comment(store, node_id: int, body: str) -> int:
    store_path = Path(store)
    if not _node_file(store_path, node_id).exists():
        raise StoreError(f"no such node: {node_id}")

    _validate(body)

    comments_dir = _comments_dir(store_path, node_id)
    comments_dir.mkdir(parents=True, exist_ok=True)
    existing_seqs = []
    for path in comments_dir.iterdir():
        if path.name.endswith(".md"):
            try:
                existing_seqs.append(int(path.stem))
            except ValueError:
                pass
    next_seq = (max(existing_seqs) + 1) if existing_seqs else 1

    comment_path = comments_dir / f"{next_seq:04d}.md"
    comment_path.write_text(body)
    _commit(store_path, f"node #{node_id}: comment {next_seq}")
    return next_seq


def update_comment(store, node_id: int, seq: int, body: str) -> None:
    store_path = Path(store)
    comment_path = _comments_dir(store_path, node_id) / f"{seq:04d}.md"
    if not comment_path.exists():
        raise StoreError(f"no such comment: node {node_id} seq {seq}")

    _validate(body)

    comment_path.write_text(body)
    _commit(store_path, f"node #{node_id}: update comment {seq}")


def set_state(store, node_id: int, state: str, *, state_reason=None, labels=None) -> None:
    store_path = Path(store)
    node_file = _node_file(store_path, node_id)
    if not node_file.exists():
        raise StoreError(f"no such node: {node_id}")
    if state not in ("open", "closed"):
        raise StoreError(f"invalid state: {state!r}")

    frontmatter, body = _read_node_file(node_file)
    new_labels = frontmatter.get("labels") or [] if labels is None else labels
    _write_node_file(
        node_file, title=frontmatter.get("title", ""), state=state,
        state_reason=state_reason, labels=new_labels, body=body,
    )
    _commit(store_path, f"node #{node_id}: state {state}")


if __name__ == "__main__":  # pragma: no cover - thin CLI over the library
    import argparse

    _p = argparse.ArgumentParser(
        description="ctx node store CLI (per-project bootstrap)")
    _sub = _p.add_subparsers(dest="cmd", required=True)
    _i = _sub.add_parser("init", help="create an empty store (idempotent)")
    _i.add_argument("store", help="path to the store directory")
    _r = _sub.add_parser(
        "create-root", help="create a root node in an existing store")
    _r.add_argument("store", help="path to the store directory")
    _r.add_argument("title", help="root node title")
    _r.add_argument("--body", default="**Stub.** Root epic.",
                    help="root node body (markdown)")
    _args = _p.parse_args()
    if _args.cmd == "init":
        init_store(_args.store)
        print(f"store ready: {_args.store}")
    elif _args.cmd == "create-root":
        _nid = create_node(_args.store, _args.title, _args.body)
        print(f"created root node #{_nid}")
