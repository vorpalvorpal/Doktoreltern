"""Shared pytest fixtures and the import shims for the context-layer suite.

These tests are the #24 plan made verbose. They describe behaviour; the
implementation does not exist yet, so each test module guards its import with
``pytest.importorskip`` (whole module skips until the code lands) and each spec
is individually ``@pytest.mark.skip(reason="pending — Stage N")`` so /implement
can burn them down one stage at a time.

Assumed public API (the *behaviour* is the contract; implement may rename — if
it does, update these shims, not the assertions):

    ctx_core
        Kind constants: PART_OF, ASPECT, BOUNDARY, BLOCKED_BY, DESIGN, EQ,
            CITES, DEAD_END  (str ids)
        Marker(kind, value, line)   dataclass; equal by (kind, value)
        Finding(issue, key, detail) dataclass; str() -> "#<issue>:<key>:<detail>"
        Node(number, body, state, state_reason, labels)
        parse(text) -> Parsed(markers: list[Marker], findings: list[Finding])
        render(marker) -> str               # parse(render(m)).markers == [m]
        collate(nodes) -> Model             # .tree_edges/.aspects/.boundaries/
                                            #  .build_order/.design_links/
                                            #  .registry/.dead_ends
        CHECKS: dict[str, Callable[[Model, Platform], list[Finding]]]  "I1".."I8"

    ctx_fetch
        fetch_repo(repo) -> list[Node];  update_comment(comment_id, body)
        AuthError, RateLimitError, OperationalError

    ctx_lint
        main(argv) -> int   # 0 clean, 1 findings, 2 operational

    server (MCP)
        get_context/get_thread/get_siblings/get_children/
        query_registry/query_deadends
"""

import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parent.parent          # .../context/scripts
CONTEXT_DIR = SCRIPTS_DIR.parent                              # .../context
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))


def load_from_path(name, path):
    """Import a module by file path, or return None if the file is absent.

    Used for the MCP server because its planned directory (``mcp/``) shadows the
    ``mcp`` SDK package — see #24 risk note. Loading by path sidesteps the name
    clash; implement should still rename the directory.
    """
    path = Path(path)
    if not path.exists():
        return None
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# --- sample marker text -----------------------------------------------------

@pytest.fixture
def inline_markers_text():
    """An issue body carrying one of every inline-form marker, line-anchored."""
    return (
        "Some prose introducing the node.\n"
        "\n"
        "🧩 Part-of: #16\n"
        "🏷️ aspect: numerics\n"
        "🧱 Boundary: #17, #18\n"
        "⛔ Blocked-by: #12\n"
        "📐 Design: #17\n"
        "🟰 Eq: smith2020_msPAF\n"
        "📚 Cites: smith2020\n"
        "\n"
        "Closing prose.\n"
    )


@pytest.fixture
def block_dead_end_text():
    """A block-form keyed Dead-end: id inline, body in the blockquote."""
    return (
        "🪦 Dead-end: #7.de1\n"
        "> Tried FFT-based convolution. Padding to next pow2 dominated\n"
        "> cost at n<512; the direct loop was 3x faster in that regime.\n"
        "\n"
        "Back to prose — not part of the marker.\n"
    )


# --- sample platform / model fixtures (for the linter) ----------------------

@pytest.fixture
def two_node_tree():
    """A minimal parent→child tree as (nodes, platform) the linter consumes.

    Built inside tests from the assumed ctx_core API; returned here as raw data
    so it can be constructed once the module exists. Keys mirror the planned
    Platform shape: sub-issue edges, per-issue labels, and whether edges are
    settable in this environment (drives I1's info-vs-finding rule).
    """
    return {
        "bodies": {
            16: "Epic root.\n🏷️ aspect: numerics\n🧱 Boundary: #17\n",
            17: "Child design node.\n🧩 Part-of: #16\n🏷️ aspect: numerics\n",
        },
        "states": {16: ("open", None), 17: ("open", None)},
        "subissue_edges": {(16, 17)},
        "labels": {16: {"aspect:numerics"}, 17: {"aspect:numerics"}},
        "settable": True,
    }
