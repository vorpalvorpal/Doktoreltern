"""RepoSource — adapts a read store + collated repo into the MCP serving shape.

The pure serving functions in ``ctx_mcp/server.py`` expect a ``source`` exposing
``.nodes`` / ``.registry`` / ``.dead_ends`` in a plain-dict shape (see the tests'
``FakeSource``). This builds that from ``ctx_store.read_nodes`` + ``ctx_core.collate``.
``fetch`` and ``collate`` are injectable so it can be tested without touching disk.

The title is the store's node title (``Node.title``), falling back to a ``# <title>``
heading in the body and then ``#<number>``; the short "purpose" is the first prose
line of the body. Maps to #41 (context MCP).
"""
from __future__ import annotations

import re
from collections import defaultdict

import ctx_core

_HEADING = re.compile(r"^#\s+(.*)$")
_LEAD_BOLD = re.compile(r"^\*\*[^*]{1,40}?\*\*[ \t]*")               # a "**Stub.**" style label
_LEAD_PARTOF = re.compile(r"^Part[- ]of\s+#\d+\.?[ \t]*", re.IGNORECASE)  # "Part of #16." connector
_EMPHASIS = re.compile(r"[*`]+")                                    # inline markdown to strip
_SENTENCE_BREAK = re.compile(r"(?<=[.!?])\s+")


def _title(body: str, number: int) -> str:
    for line in body.splitlines():
        m = _HEADING.match(line.strip())
        if m:
            return m.group(1).strip()
    return f"#{number}"


def _purpose(body: str) -> str:
    """One-line purpose: the first sentence of the first real prose paragraph.

    Skips headings, blockquotes and marker lines; drops a leading bold label (the
    ``**Stub.**`` stub convention) and a leading ``Part of #N.`` connector; strips
    inline emphasis so the menu line is clean plain text. Joining wrapped lines
    before extracting means a hard-wrapped opening sentence is never truncated
    mid-phrase (the old line-at-a-time version returned a garbled continuation).
    """
    para = []
    for line in body.splitlines():
        s = line.strip()
        if not s:
            if para:
                break                       # first prose paragraph ended
            continue
        if s.startswith("#") or s.startswith(">"):
            continue
        if ctx_core.parse(line + "\n").markers:   # skip marker lines
            continue
        para.append(s)
    if not para:
        return ""
    text = _LEAD_BOLD.sub("", " ".join(para), count=1)
    text = _LEAD_PARTOF.sub("", text, count=1)
    text = _EMPHASIS.sub("", text).strip()
    first = _SENTENCE_BREAK.split(text, 1)[0].strip() if text else ""
    out = first or text
    return out if len(out) <= 200 else out[:197].rstrip() + "..."


class RepoSource:
    """Live serving source: read the store, collate it, expose the dict shape."""

    def __init__(self, store: str, *, fetch=None, collate=None) -> None:
        import ctx_store
        nodes = (fetch or ctx_store.read_nodes)(store)
        model = (collate or ctx_core.collate)(nodes)

        children: dict = defaultdict(list)
        parent: dict = {}
        for p, c in model.tree_edges:
            children[p].append(c)
            parent[c] = p

        self.nodes: dict = {}
        for n, node in model.nodes.items():
            self.nodes[n] = dict(
                title=node.title or _title(node.body, n),
                body=node.body,
                state=node.state,
                state_reason=node.state_reason,
                parent=parent.get(n),
                children=sorted(children.get(n, [])),
                comments=[c.text for c in node.comments],
                purpose=_purpose(node.body),
            )

        # registry: key -> {key, issues}. Rich cite/eq metadata is future (Zotero, #21).
        self.registry: dict = {
            key: {"key": key, "issues": list(issues)}
            for key, issues in model.registry.items()
        }

        # dead-ends: issue -> [text, ...] (scoped query returns this list).
        self.dead_ends: dict = {
            issue: [kv.text for kv in keyeds]
            for issue, keyeds in model.dead_ends.items()
        }
