"""RepoSource — adapts a fetched + collated repo into the MCP serving shape.

The pure serving functions in ``ctx_mcp/server.py`` expect a ``source`` exposing
``.nodes`` / ``.registry`` / ``.dead_ends`` in a plain-dict shape (see the tests'
``FakeSource``). This builds that from ``ctx_fetch.fetch_repo`` + ``ctx_core.collate``.
``fetch`` and ``collate`` are injectable so it can be tested without a network.

Title and the short "purpose" are derived from the node body (the stub opens with
``# <title>`` and a one-line purpose), so no extra fetch field is needed. Maps to
#41 (context MCP).
"""
from __future__ import annotations

import re
from collections import defaultdict

import ctx_core

_HEADING = re.compile(r"^#\s+(.*)$")


def _title(body: str, number: int) -> str:
    for line in body.splitlines():
        m = _HEADING.match(line.strip())
        if m:
            return m.group(1).strip()
    return f"#{number}"


def _purpose(body: str) -> str:
    """First prose line that isn't a heading, marker, blockquote, or facet header."""
    for line in body.splitlines():
        s = line.strip()
        if not s or s.startswith("#") or s.startswith(">") or s.startswith("**"):
            continue
        if ctx_core.parse(line + "\n").markers:   # skip marker lines
            continue
        return s if len(s) <= 200 else s[:197] + "..."
    return ""


class RepoSource:
    """Live serving source: fetch a repo, collate it, expose the dict shape."""

    def __init__(self, repo: str, *, fetch=None, collate=None) -> None:
        import ctx_fetch
        nodes = (fetch or ctx_fetch.fetch_repo)(repo)
        model = (collate or ctx_core.collate)(nodes)

        children: dict = defaultdict(list)
        parent: dict = {}
        for p, c in model.tree_edges:
            children[p].append(c)
            parent[c] = p

        self.nodes: dict = {}
        for n, node in model.nodes.items():
            self.nodes[n] = dict(
                title=_title(node.body, n),
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
