"""Context MCP — the altitude-relative serving contract (serving logic only).

The headline rule (#17/#41): `get_context` returns the **ancestor path, bodies
only**, and never volunteers comments, siblings, or children — detail is opt-in,
and registry / dead-end queries return **scoped** entries, never the whole index
(the token-frugality rule). These are pure functions over an injected `source`, so
they are tested with no network.

`source` provides:
    source.nodes: dict[int, dict(title, body, state, state_reason,
                                 parent, children, comments, purpose)]
    source.registry: dict[key, entry]
    source.dead_ends: dict[issue, list[str]]

NOTE (#41.q1, deferred): wiring these functions into an actual MCP-SDK transport
is *not* done here. This directory is named `mcp/`, which shadows the `mcp` SDK
package; because nothing here imports the SDK and the suite loads this file by
path, there is no clash today. Adding a real stdio server means either renaming
this directory or importing the SDK under an absolute path — a decision left to
#41.q1.
"""
class ContextError(Exception):
    """A structural fault while serving context (broken or cyclic edge)."""


class NodeView:
    """The slice of a node `get_context` is allowed to serve: body + state only.

    A plain class (not a dataclass) so it loads cleanly when the suite imports this
    file by path under a synthetic module name not registered in sys.modules.
    """

    __slots__ = ("number", "body", "state", "state_reason")

    def __init__(self, number, body, state, state_reason):
        self.number = number
        self.body = body
        self.state = state
        self.state_reason = state_reason

    def __repr__(self):
        return (f"NodeView(number={self.number!r}, body={self.body!r}, "
                f"state={self.state!r}, state_reason={self.state_reason!r})")


def _require(source, issue: int) -> dict:
    node = source.nodes.get(issue)
    if node is None:
        raise ContextError(f"missing node #{issue}")
    return node


def _ancestry(source, issue: int) -> list:
    """Root→issue chain, raising on a missing or cyclic parent edge."""
    chain: list = []
    seen: set = set()
    cur = issue
    while cur is not None:
        if cur in seen:
            raise ContextError(f"cycle while walking ancestry at #{cur}")
        seen.add(cur)
        node = source.nodes.get(cur)
        if node is None:
            raise ContextError(f"missing node #{cur}")
        chain.append(cur)
        cur = node.get("parent")
    chain.reverse()
    return chain


def get_context(source, issue: int) -> list:
    """Ordered root→issue NodeViews (bodies + state only); the altitude rule."""
    return [
        NodeView(n, d["body"], d["state"], d.get("state_reason"))
        for n in _ancestry(source, issue)
        for d in (source.nodes[n],)
    ]


def get_thread(source, issue: int) -> list:
    """Opt-in: the full comment list for one node."""
    return list(_require(source, issue).get("comments", []))


def _summaries(source, numbers) -> list:
    out = []
    for n in numbers:
        d = source.nodes.get(n)
        if d is None:
            continue
        out.append({"number": n, "title": d["title"], "purpose": d["purpose"]})
    return out


def get_siblings(source, issue: int) -> list:
    """Opt-in: sibling titles + one-line purposes (never their bodies)."""
    node = _require(source, issue)
    parent = node.get("parent")
    if parent is None:
        return []
    kids = source.nodes.get(parent, {}).get("children", [])
    return _summaries(source, [k for k in kids if k != issue])


def get_children(source, issue: int) -> list:
    """Opt-in: child titles + one-line purposes (never their bodies)."""
    node = _require(source, issue)
    return _summaries(source, node.get("children", []))


def query_registry(source, key: str):
    """Scoped: a single registry entry by key, never the whole index."""
    if key not in source.registry:
        raise ContextError(f"no registry entry for {key!r}")
    return source.registry[key]


def query_deadends(source, scope: int) -> list:
    """Scoped: only the dead-ends recorded against `scope`."""
    return list(source.dead_ends.get(scope, []))
