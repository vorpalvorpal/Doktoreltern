"""ctx_run — the store-backed runner shell around ctx_driver (MVP)."""
import json

import pytest

import ctx_run
import ctx_store


# --- verdict / difficulty parsing --------------------------------------------
class TestParseVerdict:
    def test_ok(self):
        ok, fault, note = ctx_run.parse_verdict("did things\nVERDICT: ok - built it")
        assert ok is True and fault is None

    def test_fail_with_fault(self):
        ok, fault, _ = ctx_run.parse_verdict("VERDICT: fail fault=plan - spec wrong")
        assert ok is False and fault == "plan"

    def test_fail_without_fault(self):
        ok, fault, _ = ctx_run.parse_verdict("VERDICT: fail - suite red")
        assert ok is False and fault is None

    def test_last_verdict_wins(self):
        text = "VERDICT: fail fault=design - draft\n...more work...\nVERDICT: ok"
        ok, fault, _ = ctx_run.parse_verdict(text)
        assert ok is True

    def test_missing_verdict_is_failed_retry(self):
        ok, fault, note = ctx_run.parse_verdict("I did some work and stopped.")
        assert ok is False and fault is None and "no verdict" in note

    def test_difficulty(self):
        assert ctx_run.parse_difficulty("DIFFICULTY: 7\nVERDICT: ok") == 7
        assert ctx_run.parse_difficulty("no rating") is None


# --- store → world -----------------------------------------------------------
@pytest.fixture
def store(tmp_path):
    s = tmp_path / "store"
    ctx_store.init_store(s)
    root = ctx_store.create_node(
        s, "root", "🧭 Confidence: low\n📊 Fidelity: stub\n\nRoot epic.\n")
    leaf = ctx_store.create_node(
        s, "leaf", "🧭 Confidence: low\n📊 Fidelity: stub\n\nA leaf.\n",
        parent=root)
    return s, root, leaf


@pytest.fixture
def unstamped_store(tmp_path):
    """Like `store`, but the parent carries no 📊 marker (#33: derived fidelity)."""
    s = tmp_path / "store"
    ctx_store.init_store(s)
    root = ctx_store.create_node(
        s, "root", "🧭 Confidence: low\n\nUnstamped epic.\n")
    leaf = ctx_store.create_node(
        s, "leaf", "🧭 Confidence: low\n📊 Fidelity: stub\n\nA leaf.\n",
        parent=root)
    return s, root, leaf


class TestLoadWorld:
    def test_states_and_edges_from_store(self, store):
        s, root, leaf = store
        _model, states, edges, _b, _a = ctx_run.load_world(str(s))
        assert set(states) == {root, leaf}
        assert states[leaf].fidelity == "stub"
        assert (root, leaf) in edges

    def test_closed_nodes_excluded(self, store):
        s, root, leaf = store
        ctx_store.set_state(s, leaf, "closed", state_reason="not_planned")
        _model, states, _e, _b, _a = ctx_run.load_world(str(s))
        assert leaf not in states and root in states

    def test_unstamped_parent_loads_as_derived_none(self, unstamped_store):
        s, root, leaf = unstamped_store
        _model, states, *_ = ctx_run.load_world(str(s))
        assert states[root].fidelity is None      # derived (#33), not stub-capped
        assert states[leaf].fidelity == "stub"

    def test_unstamped_leaf_still_defaults_stub(self, tmp_path):
        s = tmp_path / "store"
        ctx_store.init_store(s)
        n = ctx_store.create_node(s, "solo", "🧭 Confidence: low\n\nNo marker.\n")
        _model, states, *_ = ctx_run.load_world(str(s))
        assert states[n].fidelity == "stub"


class TestRunState:
    def test_roundtrip_overlay(self, store):
        s, root, leaf = store
        _m, states, *_ = ctx_run.load_world(str(s))
        states[leaf].cursor = "plan"
        states[leaf].fidelity = "interface"
        ctx_run.save_run_state(str(s), states)

        _m, fresh, *_ = ctx_run.load_world(str(s))
        assert fresh[leaf].cursor is None
        ctx_run.load_run_state(str(s), fresh)
        assert fresh[leaf].cursor == "plan"
        assert fresh[leaf].fidelity == "interface"

    def test_telemetry_dir_self_gitignores(self, store):
        s, *_ = store
        d = ctx_run._telemetry_dir(str(s))
        assert (d / ".gitignore").read_text() == "*\n"

    def test_none_fidelity_survives_run_state_roundtrip(self, unstamped_store):
        # fidelity=None serializes as JSON null; the overlay must restore it as
        # None (unstamped), not coerce it to a string.
        s, root, _leaf = unstamped_store
        _m, states, *_ = ctx_run.load_world(str(s))
        ctx_run.save_run_state(str(s), states)
        _m, fresh, *_ = ctx_run.load_world(str(s))
        ctx_run.load_run_state(str(s), fresh)
        assert fresh[root].fidelity is None


# --- end-to-end with a stub executor -----------------------------------------
class TestEndToEnd:
    def test_all_ok_executor_folds_the_tree(self, store, capsys):
        s, root, leaf = store
        rc = ctx_run.main([
            str(s), "--project", str(s), "--dispatch-cmd",
            "printf 'DIFFICULTY: 2\\nVERDICT: ok - stub executor\\n'",
        ])
        assert rc == 0
        out = capsys.readouterr().out
        assert "folded_correct" in out

        # telemetry: one JSON line per dispatch, difficulty captured
        lines = [json.loads(x) for x in
                 (s / ".telemetry" / "usage.jsonl").read_text().splitlines()]
        assert len(lines) >= 2 * 6  # 2 nodes x (interface + 5 deepen moves)
        assert all(rec["difficulty"] == 2 for rec in lines)
        moves = {rec["move"] for rec in lines}
        assert "validate" in moves and "interface" in moves

        # run-state persisted: both nodes done
        state = json.loads((s / ".telemetry" / "run-state.json").read_text())
        assert state[str(root)]["done"] and state[str(leaf)]["done"]

    def test_unstamped_parent_folds_without_a_floor_move(self, unstamped_store,
                                                         capsys):
        # #33 end-to-end: the parent has no 📊 marker, yet the run converges —
        # and the parent is never dispatched an INTERFACE move (it has no stamp
        # to raise; the leaf carries the floor).
        s, root, leaf = unstamped_store
        rc = ctx_run.main([
            str(s), "--project", str(s), "--dispatch-cmd",
            "printf 'DIFFICULTY: 1\\nVERDICT: ok - stub executor\\n'",
        ])
        assert rc == 0
        assert "folded_correct" in capsys.readouterr().out

        lines = [json.loads(x) for x in
                 (s / ".telemetry" / "usage.jsonl").read_text().splitlines()]
        root_moves = [rec["move"] for rec in lines if rec["node"] == root]
        assert "interface" not in root_moves      # no floor move on the parent
        # stronger: no stamp = no glue of its own — the leaf's `correct` is the
        # parent's derived fidelity, so the parent needs no dispatches at all.
        assert root_moves == []
        leaf_moves = [rec["move"] for rec in lines if rec["node"] == leaf]
        assert "interface" in leaf_moves          # stamped stub leaf still floors

    def test_verdictless_executor_escalates(self, store, capsys):
        s, *_ = store
        rc = ctx_run.main([
            str(s), "--project", str(s), "--fresh",
            "--dispatch-cmd", "printf 'no verdict here\\n'",
        ])
        assert rc == 1
        assert "node_escalated" in capsys.readouterr().out

    def test_dry_run_dispatches_nothing(self, store, capsys):
        s, *_ = store
        rc = ctx_run.main([str(s), "--project", str(s), "--fresh", "--dry-run"])
        assert rc == 0
        out = capsys.readouterr().out
        assert "next: INTERFACE on #" in out
        assert "VERDICT" in out                       # the protocol is in the prompt
        assert not (s / ".telemetry" / "usage.jsonl").exists()

    def test_resume_skips_done_nodes(self, store):
        s, root, leaf = store
        ctx_run.main([str(s), "--project", str(s), "--dispatch-cmd",
                      "printf 'VERDICT: ok\\n'"])
        first = len((s / ".telemetry" / "usage.jsonl").read_text().splitlines())
        rc = ctx_run.main([str(s), "--project", str(s), "--dispatch-cmd",
                           "printf 'VERDICT: ok\\n'"])
        assert rc == 0
        second = len((s / ".telemetry" / "usage.jsonl").read_text().splitlines())
        assert second == first        # nothing re-dispatched on resume
