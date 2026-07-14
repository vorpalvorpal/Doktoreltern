"""ctx_run — drive the autonomous loop over a real store with real dispatches (MVP).

`ctx_driver.run` owns scheduling/routing over in-memory state; this module is the
missing outer shell for a real project:

- **init from the store**: open, non-dormant nodes become `NodeRun`s seeded from
  their declared gauges; tree edges / boundaries / aspects come from the collated
  model.
- **real dispatch**: each Decision becomes one headless `claude -p` run in the
  project repo (`--output-format json`), prompted to execute the move and to end
  with a machine-readable verdict. `--dispatch-cmd` swaps in any executable for
  tests.
- **telemetry from dispatch one** (#32): every dispatch appends a JSON line to
  `<store>/.telemetry/usage.jsonl` — move, duration, cost, token usage, the
  self-reported 0–10 difficulty, and the verdict. Ratings are collected, not
  consumed (MVP runs fixed-tier, no router).
- **run-state**: `<store>/.telemetry/run-state.json` persists cursor/gauge/fault
  state across runs (saved before every dispatch and at the end), so an
  interrupted run resumes instead of restarting. Writing gauges back onto the
  node bodies stays with the moves themselves (the prompt instructs them);
  proper store persistence is #42, not this shell.

Deliberately MVP: single model tier, tick budget only, verdicts trusted as
reported. The point is to run real moves and collect the usage data that a
better version will be fitted from.

Usage:
    python ctx_run.py <store> --project <dir> [--budget N] [--model NAME]
                      [--fault-cap N] [--max-turns N] [--timeout SECS]
                      [--skill-prefix r-data] [--dry-run] [--dispatch-cmd CMD]
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import time
from pathlib import Path

import ctx_core
import ctx_driver
import ctx_schedule
import ctx_store

_VERDICT = re.compile(
    r"^\s*VERDICT:\s*(ok|fail)\b(?:.*?fault=(design|plan|construct))?.*$",
    re.IGNORECASE | re.MULTILINE)
_DIFFICULTY = re.compile(r"^\s*DIFFICULTY:\s*(\d+)", re.IGNORECASE | re.MULTILINE)

_MOVE_BRIEFS = {
    ctx_driver.INTERFACE: (
        "INTERFACE (floor move): declare this node's interface only — "
        "signatures, contracts, boundaries. No implementation, no mocks. "
        "Raise the node body's `📊 Fidelity:` marker to `interface` on success."),
    ctx_driver.DESIGN: (
        "DESIGN: settle the node's direction — the approach, its boundary/contract "
        "at interface fidelity, the alternatives considered and why they were set "
        "aside. Record it in the node body."),
    ctx_driver.PLAN: (
        "PLAN: produce the behaviour spec at the meaning level — behaviours, edge "
        "cases, error conditions, the correctness basis for each — plus staged "
        "tasks. Record it on the node."),
    ctx_driver.TEST: (
        "TEST: encode the plan's behaviour spec into an executable suite in the "
        "project repo. Run it and confirm each new test fails for the right "
        "reason (the behaviour is absent, not the test malformed)."),
    ctx_driver.CONSTRUCT: (
        "CONSTRUCT: implement the plan until the node's suite passes, staying "
        "within this node's scope. Before building, sanity-check the plan you "
        "were handed; if it is wrong, fail with fault=plan instead of building "
        "around it."),
    ctx_driver.VALIDATE: (
        "VALIDATE: audit the work at this node — run the suite, check the "
        "artefact against the plan and the plan against the design. Verdict ok "
        "only on fresh evidence from this run. On failure, name the faulted "
        "layer (fault=construct|plan|design) per what the evidence indicts."),
}


# --- store → driver state ----------------------------------------------------
def load_world(store: str):
    """Collate the store; return (model, states, edges, boundaries, aspects)."""
    model = ctx_core.collate(ctx_store.read_nodes(store))
    active = ctx_schedule.frontier(model)
    states = {}
    for n in active:
        g = model.gauges.get(n, {})
        states[n] = ctx_driver.NodeRun(
            fidelity=g.get("fidelity", "stub"),
            confidence=g.get("confidence", "low"),
        )
    edges = {(p, c) for p, c in model.tree_edges if p in states and c in states}
    boundaries = {n: list(model.boundaries.get(n, [])) for n in states}
    aspects = {n: list(model.aspects.get(n, [])) for n in states}
    return model, states, edges, boundaries, aspects


def _telemetry_dir(store: str) -> Path:
    d = Path(store) / ".telemetry"
    d.mkdir(exist_ok=True)
    gi = d / ".gitignore"
    if not gi.exists():
        gi.write_text("*\n")   # never staged by the store's add -A write path
    return d


def load_run_state(store: str, states) -> None:
    """Overlay persisted cursor/gauge/fault state onto freshly-loaded states."""
    path = _telemetry_dir(store) / "run-state.json"
    if not path.exists():
        return
    saved = json.loads(path.read_text())
    for key, rec in saved.items():
        n = int(key)
        if n in states:
            states[n] = ctx_driver.NodeRun(**rec)


def save_run_state(store: str, states) -> None:
    path = _telemetry_dir(store) / "run-state.json"
    path.write_text(json.dumps(
        {str(n): vars(r) for n, r in states.items()}, indent=1))


# --- prompt assembly ---------------------------------------------------------
def _ancestor_line(source_nodes, n) -> str:
    chain, seen = [], set()
    cur = source_nodes.get(n, {}).get("parent")
    while cur is not None and cur not in seen:
        seen.add(cur)
        info = source_nodes.get(cur)
        if info is None:
            break
        chain.append(f"#{cur} {info['title']}")
        cur = info.get("parent")
    return " > ".join(reversed(chain)) if chain else "(root)"


def build_prompt(store: str, source_nodes, decision, *, skill_prefix="") -> str:
    n, move = decision.node, decision.move
    info = source_nodes.get(n, {"title": f"#{n}", "body": ""})
    skill_note = (
        f"Follow the `{skill_prefix}:{move}` skill if it is available. "
        if skill_prefix and move in ("plan", "test", "construct", "validate", "design")
        else "")
    return f"""You are running one move of the Doktoreltern loop.

Node store: {store} (nodes/<id>/node.md; directory nesting is the tree)
NODE #{n}: {info["title"]}
Ancestors: {_ancestor_line(source_nodes, n)}
MOVE: {move.upper()}

{_MOVE_BRIEFS[move]}

Read the node's `node.md` (find it by id under the store's `nodes/` tree) and
ancestor bodies as needed before acting. {skill_note}House rules:
- Work only inside this project; commit artefact changes you make.
- Update the node's body (markers and prose) to reflect what you did, keeping
  the marker grammar intact.
- Do not touch other nodes' scopes.

End your final message with exactly these two lines:
DIFFICULTY: <0-10 per-decision hardness of this move>
VERDICT: ok | fail [fault=design|plan|construct] - <one-line reason>
"""


# --- dispatch ----------------------------------------------------------------
def parse_verdict(text: str):
    """(ok, fault, note) from the trailing VERDICT line; missing → failed retry."""
    matches = list(_VERDICT.finditer(text or ""))
    if not matches:
        return False, None, "no verdict line in output"
    m = matches[-1]
    ok = m.group(1).lower() == "ok"
    fault = m.group(2).lower() if m.group(2) else None
    return ok, (None if ok else fault), m.group(0).strip()


def parse_difficulty(text: str):
    m = list(_DIFFICULTY.finditer(text or ""))
    return int(m[-1].group(1)) if m else None


def make_dispatch(store: str, project: str, source_nodes, *, model_name="sonnet",
                  max_turns=40, timeout=1800, skill_prefix="", dispatch_cmd=None,
                  states=None, log=print):
    """Build the `dispatch(decision, model) -> Verdict` closure for ctx_driver.run."""
    usage_log = _telemetry_dir(store) / "usage.jsonl"

    def dispatch(decision, model):
        if states is not None:               # crash-safe: at most one move lost
            save_run_state(store, states)
        prompt = build_prompt(store, source_nodes, decision,
                              skill_prefix=skill_prefix)
        if dispatch_cmd:
            cmd = ["/bin/sh", "-c", dispatch_cmd]
        else:
            cmd = ["claude", "-p", "--output-format", "json",
                   "--model", model_name, "--max-turns", str(max_turns),
                   "--permission-mode", "acceptEdits"]
        started = time.time()
        try:
            proc = subprocess.run(cmd, input=prompt, capture_output=True,
                                  text=True, timeout=timeout, cwd=project)
            raw = proc.stdout
        except subprocess.TimeoutExpired:
            raw = ""
        meta = {}
        text = raw
        try:
            payload = json.loads(raw)
            text = payload.get("result", "") or ""
            meta = {k: payload.get(k) for k in
                    ("total_cost_usd", "duration_ms", "num_turns", "usage")}
        except (json.JSONDecodeError, AttributeError):
            pass                              # plain-text executor (tests)
        ok, fault, note = parse_verdict(text)
        record = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "tick": decision.tick, "node": decision.node, "move": decision.move,
            "model": model_name if not dispatch_cmd else "dispatch-cmd",
            "wall_secs": round(time.time() - started, 1),
            "difficulty": parse_difficulty(text),
            "ok": ok, "fault": fault, "note": note, **meta,
        }
        with usage_log.open("a") as fh:
            fh.write(json.dumps(record) + "\n")
        log(f"  tick {decision.tick}: {decision.move.upper()} on "
            f"#{decision.node} -> {'ok' if ok else 'fail'}"
            f"{f' (fault={fault})' if fault else ''}")
        return ctx_driver.Verdict(ok, fault, note)

    return dispatch


# --- CLI ---------------------------------------------------------------------
def main(argv=None) -> int:
    import argparse

    import ctx_source

    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("store")
    p.add_argument("--project", required=True,
                   help="repo the moves work in (cwd for dispatches)")
    p.add_argument("--budget", type=int, default=20, help="max dispatches")
    p.add_argument("--fault-cap", type=int, default=3)
    p.add_argument("--model", default="sonnet")
    p.add_argument("--max-turns", type=int, default=40)
    p.add_argument("--timeout", type=int, default=1800, help="secs per dispatch")
    p.add_argument("--skill-prefix", default="",
                   help="plugin whose move skills the prompt cites (e.g. r-data)")
    p.add_argument("--dry-run", action="store_true",
                   help="show the next decision + prompt, dispatch nothing")
    p.add_argument("--dispatch-cmd", default=None,
                   help="executor override: shell command fed the prompt on stdin")
    p.add_argument("--fresh", action="store_true",
                   help="ignore saved run-state, restart from the store's gauges")
    args = p.parse_args(argv)

    model, states, edges, boundaries, aspects = load_world(args.store)
    if not states:
        print("nothing to do: no open, non-dormant nodes")
        return 0
    if not args.fresh:
        load_run_state(args.store, states)
    source_nodes = ctx_source.RepoSource(args.store).nodes

    if args.dry_run:
        done = {n for n, r in states.items() if r.done or r.fidelity == "correct"}
        m = ctx_driver.build_model(states, edges, boundaries, aspects)
        n = ctx_driver.select(m, states, done)
        if n is None:
            print("frontier empty — nothing would run")
            return 0
        move = ctx_driver.next_move(states[n], m, n)
        decision = ctx_driver.Decision(0, n, move)
        print(f"next: {move.upper()} on #{n}\n")
        print(build_prompt(args.store, source_nodes, decision,
                           skill_prefix=args.skill_prefix))
        return 0

    dispatch = make_dispatch(
        args.store, args.project, source_nodes, model_name=args.model,
        max_turns=args.max_turns, timeout=args.timeout,
        skill_prefix=args.skill_prefix, dispatch_cmd=args.dispatch_cmd,
        states=states)
    result = ctx_driver.run(
        states, edges, dispatch, boundaries=boundaries, aspects=aspects,
        budget=args.budget, fault_cap=args.fault_cap)
    save_run_state(args.store, states)

    print(f"\noutcome: {result.outcome} after {result.ticks} dispatch(es)")
    if result.escalated is not None:
        print(f"escalated node: #{result.escalated} — needs a human")
    return 0 if result.outcome == "folded_correct" else 1


if __name__ == "__main__":
    sys.exit(main())
