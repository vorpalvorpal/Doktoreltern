"""Scheduler analytical core (#32 / "D-core"): derive the axes, pick the next node.

Pure functions over a collated ``ctx_core.Model`` — no network, no move dispatch.
This is the decision of *which node to work on next*, not how to run the move on it
(dispatch + the change-routing ladder are the C-coupled layer and live elsewhere).

Priority = **centrality × (1 − confidence)** (#32; q1 settled there is no separate
fidelity-debt term — the walking-skeleton floor already gates on fidelity):

- **fidelity** folds min over non-dormant child nodes (#33.q1); leaves = own.
- **confidence** is a coarse ordinal: from resolved q/v when the node has any
  (``confidence_inputs``), else the declared ``🧭`` marker, else ``low``.
- **centrality** is graph-derived and never hand-set: subtree size (how much rests
  on the node — the belt→core axis) + Boundary in-degree + Blocked-by in-degree +
  aspect participation.
- the **scheduler** goes floor-first (walking skeleton to ``interface``) then
  best-first, honouring pins/skips.

The numeric mappings and the plain-sum centrality are deliberately simple defaults;
#32 flags them as tune-empirically.
"""
from __future__ import annotations

from collections import defaultdict

import ctx_core  # noqa: F401  (kept explicit: this module only reads a Model)

FIDELITY_RANK = {"stub": 0, "interface": 1, "mock": 2, "correct": 3}
_RANK_FIDELITY = {v: k for k, v in FIDELITY_RANK.items()}
_INTERFACE = FIDELITY_RANK["interface"]
CONFIDENCE_VALUE = {"low": 0.0, "tentative": 0.5, "high": 1.0}
_DEFAULT_FIDELITY = "stub"
_DEFAULT_CONFIDENCE = "low"


# --- tree helpers -----------------------------------------------------------
def _children(model):
    kids = defaultdict(list)
    for parent, child in model.tree_edges:
        kids[parent].append(child)
    return kids


def _parent_of(model):
    return {child: parent for parent, child in model.tree_edges}


def _active(model, n):
    """In the working set: present and not dormant (closed + `dormant` label)."""
    return n in model.nodes and n not in model.dormant


# --- fidelity ---------------------------------------------------------------
def declared_fidelity(model, n):
    return model.gauges.get(n, {}).get("fidelity", _DEFAULT_FIDELITY)


def effective_fidelity(model):
    """Folded fidelity label per node: min(own, non-dormant children). Leaves = own."""
    kids = _children(model)
    memo = {}

    def fold(n, seen):
        if n in memo:
            return memo[n]
        own = FIDELITY_RANK.get(declared_fidelity(model, n), 0)
        if n in seen:                       # cycle guard
            return own
        best = own
        for c in kids.get(n, []):
            if _active(model, c):
                best = min(best, fold(c, seen | {n}))
        memo[n] = best
        return best

    return {n: _RANK_FIDELITY[fold(n, frozenset())] for n in model.nodes}


# --- confidence -------------------------------------------------------------
def confidence_label(model, n):
    """Coarse ordinal: from resolved q/v when present, else the declared marker."""
    inp = model.confidence_inputs.get(n)
    if inp and inp[1] > 0:
        resolved, total = inp
        ratio = resolved / total
        if ratio >= 0.999:
            return "high"
        if ratio >= 0.5:
            return "tentative"
        return "low"
    return model.gauges.get(n, {}).get("confidence", _DEFAULT_CONFIDENCE)


def confidence_value(model, n):
    return CONFIDENCE_VALUE.get(confidence_label(model, n), 0.0)


# --- centrality / priority --------------------------------------------------
def _subtree_size(model):
    """Non-dormant descendant count per node."""
    kids = _children(model)
    memo = {}

    def count(n, seen):
        if n in memo:
            return memo[n]
        if n in seen:
            return 0
        total = 0
        for c in kids.get(n, []):
            if _active(model, c):
                total += 1 + count(c, seen | {n})
        memo[n] = total
        return total

    return {n: count(n, frozenset()) for n in model.nodes}


def _in_degree(edges, model):
    """Count active sources pointing at each target, over an {src: [targets]} map."""
    deg = defaultdict(int)
    for src, targets in edges.items():
        if not _active(model, src):
            continue
        for t in targets:
            deg[t] += 1
    return deg


def centrality(model):
    """Graph-derived hub-ness: subtree size + Boundary/Blocked-by in-degree + aspects."""
    desc = _subtree_size(model)
    boundary_in = _in_degree(model.boundaries, model)
    blocked_in = _in_degree(getattr(model, "blocked_by", {}), model)
    return {
        n: desc.get(n, 0) + boundary_in.get(n, 0) + blocked_in.get(n, 0)
        + len(model.aspects.get(n, []))
        for n in model.nodes
    }


def priority(model):
    """Priority per node = centrality × (1 − confidence) (#32)."""
    cen = centrality(model)
    return {n: cen.get(n, 0) * (1.0 - confidence_value(model, n)) for n in model.nodes}


# --- frontier / floor / selection -------------------------------------------
def frontier(model):
    """Open, non-dormant nodes — the scheduler's active working set."""
    return {n for n, node in model.nodes.items()
            if node.state == "open" and n not in model.dormant}


def _depth(model):
    """Distance from the root (root = 0); used to pick the *shallowest* unmet node."""
    par = _parent_of(model)
    memo = {}

    def d(n, seen):
        if n in memo:
            return memo[n]
        p = par.get(n)
        if p is None or p not in model.nodes or n in seen:
            return 0
        val = 1 + d(p, seen | {n})
        memo[n] = val
        return val

    return {n: d(n, frozenset()) for n in model.nodes}


def floor_met(model):
    """Walking-skeleton floor: every frontier node is at least `interface`."""
    return all(FIDELITY_RANK.get(declared_fidelity(model, n), 0) >= _INTERFACE
               for n in frontier(model))


def next_node(model, *, pins=(), skips=()):
    """Which node to work on next, or None if the frontier is empty.

    Floor-first (shallowest node still below `interface`), then best-first by
    priority. `skips` are excluded; `pins` (those on the frontier) restrict the
    candidate set. Ties break deterministically (lower issue number wins).
    """
    candidates = frontier(model) - set(skips)
    if not candidates:
        return None
    pinned = [p for p in pins if p in candidates]
    pool = pinned if pinned else list(candidates)
    prio = priority(model)
    if not floor_met(model):
        depth = _depth(model)
        unmet = [n for n in pool
                 if FIDELITY_RANK.get(declared_fidelity(model, n), 0) < _INTERFACE]
        if unmet:
            return min(unmet, key=lambda n: (depth[n], -prio.get(n, 0.0), n))
    return max(pool, key=lambda n: (prio.get(n, 0.0), -n))
