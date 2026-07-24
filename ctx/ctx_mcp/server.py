"""Context MCP — the altitude-relative serving contract (serving logic only).

The headline rule (#17/#41): `get_context` returns the **ancestor path, bodies
only**, and never volunteers comments, siblings, or children — detail is opt-in,
and registry / dead-end queries return **scoped** entries, never the whole index
(the token-frugality rule). These are pure functions over an injected `source`, so
they are tested with no network.

`source` provides:
    source.nodes: dict[int, dict(title, body, state, state_reason,
                                 parent, children, comments, purpose,
                                 components)]
    source.registry: dict[key, entry]
    source.dead_ends: dict[issue, list[str]]

Stage 2 (CONTRACT-v2.md): `get_context`/`_context_payload`/the `context` tool
take an optional `component` naming one file component (design.md/spec.md/
log.md) to serve instead of the concatenated body — `source.nodes[n]` is read
defensively via `.get("components", {})` so a source with no components key
(FakeSource, a v1-only node) still works.

The MCP-SDK transport lives at the bottom of this file (``build_server``,
``build_live_server``, ``serve``). The SDK is imported lazily inside those, so the
pure serving functions above stay importable and testable without ``mcp`` installed.
The directory is ``ctx_mcp/`` (renamed from ``mcp/``) so it never shadows the ``mcp``
SDK package (#41.q1, resolved).
"""
class ContextError(Exception):
    """A structural fault while serving context (broken or cyclic edge)."""


# v2 (CONTRACT-v2.md Stage 2) — the file components `get_context`/`context`
# may be asked to serve instead of the concatenated whole body.
_ALLOWED_COMPONENTS = ("design.md", "spec.md", "log.md")


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


def get_context(source, issue: int, component: str | None = None) -> list:
    """Ordered root→issue NodeViews (bodies + state only); the altitude rule.

    `component` is None → today's behaviour exactly: each view's body is the
    whole (concatenated) body. An allowed component name (`_ALLOWED_COMPONENTS`)
    → each view's body becomes that node's stored component text instead, ""
    when the node lacks it (expected for a v1 ancestor mid-migration) — read
    defensively via `.get("components", {})` so a source with no components
    key still works. Any other non-None value raises `ContextError` before any
    node is touched.
    """
    if component is not None and component not in _ALLOWED_COMPONENTS:
        raise ContextError(f"unknown component {component!r}")
    views = []
    for n in _ancestry(source, issue):
        d = source.nodes[n]
        if component is None:
            body = d["body"]
        else:
            body = d.get("components", {}).get(component, "")
        views.append(NodeView(n, body, d["state"], d.get("state_reason")))
    return views


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


# ---------------------------------------------------------------------------
# MCP-SDK transport (lazy: the SDK is imported only when a server is built, so
# the pure functions above stay importable and testable without `mcp`).
# ---------------------------------------------------------------------------
def _context_payload(source, issue, component: str | None = None):
    return [
        {"number": v.number, "body": v.body,
         "state": v.state, "state_reason": v.state_reason}
        for v in get_context(source, issue, component)
    ]


def _register(app, get_source):
    """Register the six serving functions as MCP tools on ``app``.

    ``get_source`` is a zero-arg callable returning the source to read; it is
    invoked once per tool call. A snapshot server passes ``lambda: fixed_source``;
    the live server passes a factory that rebuilds (re-fetches) per call, which is
    what keeps the served view fresh as issues are edited.
    """

    @app.tool()
    def context(issue: int, component: str | None = None):
        """Ancestor path root→issue (bodies + state only; the altitude rule).

        `component`: optional file component name ("design.md"/"spec.md"/
        "log.md") to serve instead of the concatenated body.
        """
        return _context_payload(get_source(), issue, component)

    @app.tool()
    def thread(issue: int):
        """Full comment stream for one node (opt-in detail)."""
        return get_thread(get_source(), issue)

    @app.tool()
    def siblings(issue: int):
        """Sibling titles + one-line purposes (not bodies)."""
        return get_siblings(get_source(), issue)

    @app.tool()
    def children(issue: int):
        """Child titles + one-line purposes (not bodies)."""
        return get_children(get_source(), issue)

    @app.tool()
    def registry(key: str):
        """A single registry entry by key (scoped, never the whole index)."""
        return query_registry(get_source(), key)

    @app.tool()
    def deadends(scope: int):
        """Dead-ends scoped to one node's subtree."""
        return query_deadends(get_source(), scope)

    return app


def build_server(source, name: str = "ctx-context"):
    """Snapshot server over a fixed `source` (used by the tests). Returns a FastMCP app."""
    from mcp.server.fastmcp import FastMCP

    return _register(FastMCP(name), lambda: source)


def build_live_server(make_source, name: str = "ctx-context"):
    """Live server that rebuilds its source per tool call (always-fresh; re-fetch per call)."""
    from mcp.server.fastmcp import FastMCP

    return _register(FastMCP(name), make_source)


def serve(store: str | None = None, *, scripts_dir: str | None = None) -> None:  # pragma: no cover - I/O entry
    """Build a live server over `store` (or the `CTX_STORE` env var) and run it on stdio.

    The source is rebuilt per tool call, so the served view always reflects the
    latest node edits (re-read per call, the agreed freshness model).
    """
    import os
    import sys

    sd = scripts_dir or os.path.join(os.path.dirname(__file__), "..", "scripts")
    if sd not in sys.path:
        sys.path.insert(0, sd)
    import ctx_source

    target = store or os.environ.get("CTX_STORE")
    if target is None:
        raise SystemExit("no store: pass a path or set CTX_STORE")
    build_live_server(lambda: ctx_source.RepoSource(target)).run()


if __name__ == "__main__":  # pragma: no cover
    import sys

    serve(sys.argv[1] if len(sys.argv) > 1 else None)
