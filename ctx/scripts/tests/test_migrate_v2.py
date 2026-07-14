"""Behaviour spec for the Stage 4 migration tooling (ctx/dev/migrate_v2.py).

Maps to CONTRACT-v2.md "Pinned API — Stage 4 tooling" (apply_split,
verify_migration, criteria T4.1-T4.6). migrate_v2.py is dev-only tooling, not
part of the runtime substrate, so it lives outside scripts/ (ctx/dev/) and is
loaded here by file path — same importlib.util.spec_from_file_location idiom
used for the MCP server in test_ctx_source.py. It resolves `import
ctx_store, ctx_core, ctx_lint` at its own module top because conftest.py has
already put scripts/ on sys.path by the time this test module runs.

Do NOT mock git — apply_split's one-commit-per-call and empty-commit-refusal
behaviour are correctness criteria in their own right (T4.3, T4.6), so every
test that touches git runs the real binary against a tmp_path store, and
"writes nothing" is confirmed with an unfiltered `git status --porcelain`
(a raw subprocess.run([...]) call, never a shell — an rtk hook filters
interactive shell commands, not argv-list subprocess calls, so this is already
unfiltered by construction; [MEASURE TWICE]).

This module is skipped whole (not an import error) while ctx/dev/migrate_v2.py
does not exist yet — same "expected to fail at collection/import time, turned
into a clean skip" convention test_ctx_store.py documents for ctx_store.
"""
from __future__ import annotations

import importlib.util
import shutil
import subprocess
from pathlib import Path

import pytest

ctx_core = pytest.importorskip("ctx_core")
ctx_store = pytest.importorskip("ctx_store")
ctx_lint = pytest.importorskip("ctx_lint")

MIGRATE_V2_PATH = Path(__file__).resolve().parent.parent.parent / "dev" / "migrate_v2.py"

if not MIGRATE_V2_PATH.exists():
    pytest.skip(f"migrate_v2 not implemented yet: {MIGRATE_V2_PATH}", allow_module_level=True)


def _load_migrate_v2():
    spec = importlib.util.spec_from_file_location("migrate_v2", MIGRATE_V2_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


migrate_v2 = _load_migrate_v2()


# ---------------------------------------------------------------------------
# helpers (self-sufficient — duplicated from test_ctx_store.py's conventions
# rather than imported, matching this suite's per-file convention)
# ---------------------------------------------------------------------------

def _git(store, *args):
    return subprocess.run(
        ["git", "-C", str(store), *args],
        check=True, capture_output=True, text=True,
    )


def _commit_subjects(store):
    out = _git(store, "log", "--reverse", "--format=%s").stdout
    return [line for line in out.splitlines() if line]


def _malformed_body():
    return "📊 Fidelity: banana\n"


def _next_id(store: Path) -> int:
    """Peek the next id `create_node` will allocate, without allocating it.

    Lets a test author a marker referencing a node's own id (e.g. a keyed
    Question `#<self>.q1`) before that node exists — ids come from a flat
    `_next` counter independent of tree nesting, so this is deterministic.
    """
    return int((store / "_next").read_text().strip())


@pytest.fixture
def store(tmp_path):
    store_dir = tmp_path / "store"
    ctx_store.init_store(str(store_dir))
    return store_dir


# ---------------------------------------------------------------------------
# T4.1 / T4.2 — apply_split round-trips a v1 node with mixed markers
# ---------------------------------------------------------------------------

class TestApplySplitRoundTrip:
    def test_t4_1_round_trip_clean_verify_migration_empty(self, store, tmp_path):
        parent_id = _next_id(store)
        child_id = parent_id + 1
        body = (
            "Some prose about the parent.\n"
            "🧭 Confidence: high\n"
            f"❓ Question: #{parent_id}.q1 open Does X hold?\n"
            f"🧱 Boundary: #{child_id}\n"
        )
        parent = ctx_store.create_node(str(store), "Parent", body)
        assert parent == parent_id
        child = ctx_store.create_node(str(store), "Child", "Child prose.\n", parent=parent)
        assert child == child_id

        before_copy = tmp_path / "before"
        shutil.copytree(store, before_copy)

        migrate_v2.apply_split(
            str(store), parent,
            design="🧭 Confidence: high\n",
            spec=(
                f"❓ Question: #{parent_id}.q1 open Does X hold?\n"
                f"🧱 Boundary: #{child_id}\n"
            ),
        )

        discrepancies = migrate_v2.verify_migration(str(before_copy), str(store))
        assert discrepancies == []

    def test_t4_2_thin_index_and_readback_preserves_markers(self, store):
        node_id = ctx_store.create_node(
            str(store), "T", "Prose.\n🧭 Confidence: high\n",
        )
        migrate_v2.apply_split(
            str(store), node_id,
            design="🧭 Confidence: high\n",
            spec="Spec prose, no markers.\n",
        )

        node_dir = store / "nodes" / str(node_id)
        frontmatter, body = ctx_store._read_node_file(node_dir / "node.md")
        assert body == ""
        assert frontmatter["title"] == "T"
        assert frontmatter["state"] == "open"
        assert (node_dir / "design.md").exists()
        assert (node_dir / "spec.md").exists()
        assert not (node_dir / "log.md").exists()  # log="" (default) — not written

        nodes = ctx_store.read_nodes(str(store))
        model = ctx_core.collate(nodes)
        assert model.gauges[node_id]["confidence"] == "high"


# ---------------------------------------------------------------------------
# T4.3 — atomicity: malformed component body writes nothing
# ---------------------------------------------------------------------------

class TestApplySplitAtomicity:
    def test_t4_3_malformed_component_raises_and_writes_nothing(self, store):
        node_id = ctx_store.create_node(str(store), "T", "Prose.\n")
        before_log = _commit_subjects(store)

        with pytest.raises(ctx_store.ValidationError):
            migrate_v2.apply_split(str(store), node_id, design=_malformed_body())

        assert _commit_subjects(store) == before_log
        assert not (store / "nodes" / str(node_id) / "design.md").exists()
        # [MEASURE TWICE]: unfiltered `git status --porcelain` via subprocess
        # (no shell in the middle) — the store is byte-unchanged.
        status = _git(store, "status", "--porcelain").stdout
        assert status.strip() == ""

    def test_t4_3_missing_node_raises_storeerror(self, store):
        with pytest.raises(ctx_store.StoreError):
            migrate_v2.apply_split(str(store), 9999, design="Design.\n")


# ---------------------------------------------------------------------------
# T4.4 / T4.5 — verify_migration catches loss
# ---------------------------------------------------------------------------

class TestVerifyMigrationCatchesLoss:
    def test_t4_4_catches_dropped_keyed_marker(self, store, tmp_path):
        node_id = _next_id(store)
        body = f"Prose.\n❓ Question: #{node_id}.q1 open Does X hold?\n"
        created = ctx_store.create_node(str(store), "N", body)
        assert created == node_id

        before_copy = tmp_path / "before"
        shutil.copytree(store, before_copy)

        # Lossy split: the question marker is simply dropped (an LLM mistake
        # during the real migration), leaving only unrelated design prose.
        migrate_v2.apply_split(str(store), node_id, design="Some design prose.\n")

        discrepancies = migrate_v2.verify_migration(str(before_copy), str(store))
        assert discrepancies
        assert any(
            f"#{node_id}" in d and f"{node_id}.q1" in d for d in discrepancies
        ), discrepancies

    def test_t4_5_catches_gauge_change_and_dropped_tree_edge(self, store, tmp_path):
        parent = ctx_store.create_node(
            str(store), "Parent", "Prose.\n🧭 Confidence: high\n",
        )
        child = ctx_store.create_node(str(store), "Child", "Child prose.\n", parent=parent)

        before_copy = tmp_path / "before"
        shutil.copytree(store, before_copy)

        # Gauge change: the split records a DIFFERENT confidence value than the
        # original body carried (a mistranscription bug).
        migrate_v2.apply_split(str(store), parent, design="🧭 Confidence: tentative\n")

        # Dropped tree edge: physically relocate the child out from under its
        # parent, simulating a botched migration step that loses the nesting
        # (child node id itself is untouched, only its position in the tree).
        nested_child_dir = store / "nodes" / str(parent) / str(child)
        root_child_dir = store / "nodes" / str(child)
        shutil.move(str(nested_child_dir), str(root_child_dir))

        discrepancies = migrate_v2.verify_migration(str(before_copy), str(store))
        assert any("gauge" in d and "confidence" in d for d in discrepancies), discrepancies
        assert any("tree_edges" in d for d in discrepancies), discrepancies


# ---------------------------------------------------------------------------
# T4.6 — one commit per apply_split
# ---------------------------------------------------------------------------

class TestApplySplitOneCommit:
    def test_t4_6_one_commit_with_expected_subject(self, store):
        node_id = ctx_store.create_node(str(store), "T", "Prose.\n")
        before_log = _commit_subjects(store)

        migrate_v2.apply_split(str(store), node_id, design="Design prose.\n")

        after_log = _commit_subjects(store)
        assert len(after_log) == len(before_log) + 1
        assert after_log[-1] == f"node #{node_id}: v2 component split"
