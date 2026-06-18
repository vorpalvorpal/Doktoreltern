"""ctx_core — pure parse / collate / invariant-check core.

No network, no subprocess, no I/O beyond this module.  Every public function is
a pure function of its arguments; same input → same output.

Public API
----------
Kind constants (str):
    PART_OF, ASPECT, BOUNDARY, BLOCKED_BY, DESIGN, EQ, CITES, DEAD_END,
    CONFIDENCE, FIDELITY, SEAL, QUESTION, VALIDATION, ALTERNATIVE, FUTURE, REFINE,
    OPT, ARTEFACT
    (FUTURE = expansion, prefix `fut`, optional [v<n>] tag; REFINE = correctness-bearing
     accuracy lever, prefix `fd`; OPT = speed lever, prefix `opt`.)

Dataclasses:
    Marker(kind, value, line)
    Finding(issue, key, detail, severity="finding", line=None)
    Node(number, body, state, state_reason, labels)
    Parsed(markers, findings)
    Platform(subissue_edges, labels, settable)

Functions:
    parse(text) -> Parsed
    render(marker) -> str
    collate(nodes) -> Model

Mapping:
    CHECKS: dict[str, Callable[[Model, Platform], list[Finding]]]  "I1".."I8"
"""

from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Callable

# ---------------------------------------------------------------------------
# Kind constants
# ---------------------------------------------------------------------------

PART_OF = "part_of"
ASPECT = "aspect"
BOUNDARY = "boundary"
BLOCKED_BY = "blocked_by"
DESIGN = "design"
EQ = "eq"
CITES = "cites"
DEAD_END = "dead_end"
CONFIDENCE = "confidence"
FIDELITY = "fidelity"
SEAL = "seal"
QUESTION = "question"
VALIDATION = "validation"
ALTERNATIVE = "alternative"
FUTURE = "future"
REFINE = "refine"
OPT = "opt"
ARTEFACT = "artefact"
PRO = "pro"
CON = "con"

# ---------------------------------------------------------------------------
# Glyph vocabulary
#
# Each entry: (normalised_glyph, keyword_pattern, kind, value_parser)
# Order matters for rendering; the table is the single source.
# ---------------------------------------------------------------------------

def _norm(glyph: str) -> str:
    """NFC-normalise and strip trailing U+FE0F variation selector."""
    s = unicodedata.normalize("NFC", glyph)
    if s.endswith("️"):
        s = s[:-1]
    return s


# Rendered glyphs (no trailing U+FE0F — normalised form).
_G_PART_OF   = _norm("🧩")
_G_ASPECT    = _norm("🏷️")   # may or may not have FE0F; _norm strips it
_G_BOUNDARY  = _norm("🧱")
_G_BLOCKED   = _norm("⛔")
_G_DESIGN    = _norm("📐")
_G_EQ        = _norm("🟰")
_G_CITES     = _norm("📚")
_G_DEAD_END  = _norm("🪦")
_G_CONFIDENCE = _norm("🧭")
_G_FIDELITY   = _norm("📊")
_G_SEAL       = _norm("🔒")
_G_QUESTION    = _norm("❓")
_G_VALIDATION  = _norm("✅")
_G_ALTERNATIVE = _norm("⚖️")
_G_FUTURE      = _norm("🔮")
_G_REFINE      = _norm("🎯")
_G_OPT         = _norm("⚡")
_G_ARTEFACT    = _norm("🗄️")
_G_PRO         = _norm("➕")
_G_CON         = _norm("➖")


def _parse_issue_list(raw: str, line: int) -> tuple[list[int] | None, Finding | None]:
    """Parse `#16, #17` → [16, 17].  Returns (value, None) or (None, finding)."""
    refs = re.findall(r"#(\d+)", raw)
    if not refs:
        return None, Finding(0, "parse", f"expected issue ref(s), got {raw!r}", line=line)
    return [int(r) for r in refs], None


def _parse_single_issue(raw: str, line: int) -> tuple[int | None, Finding | None]:
    """Parse `#17` → 17.  Returns (value, None) or (None, finding)."""
    m = re.fullmatch(r"#(\d+)", raw.strip())
    if not m:
        return None, Finding(0, "parse", f"expected single issue ref, got {raw!r}", line=line)
    return int(m.group(1)), None


def _parse_str(raw: str, line: int) -> tuple[str | None, Finding | None]:
    """Parse any non-empty string."""
    v = raw.strip()
    if not v:
        return None, Finding(0, "parse", "expected a non-empty string value", line=line)
    return v, None


def _parse_cite_list(raw: str, line: int) -> tuple[list[str] | None, Finding | None]:
    """Parse `smith2020, jones2021` → ["smith2020", "jones2021"]."""
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    if not parts:
        return None, Finding(0, "parse", f"expected citation key(s), got {raw!r}", line=line)
    return parts, None


_CONFIDENCE_SET = {"low", "tentative", "high"}
_FIDELITY_SET = {"stub", "interface", "mock", "correct"}
_SEAL_SET = {"sealed", "unsealed"}


def _parse_enum(allowed: set, label: str) -> Callable:
    """Build a value parser that accepts only members of `allowed`."""
    def parser(raw: str, line: int):
        v = raw.strip()
        if v not in allowed:
            return None, Finding(0, "parse",
                                 f"{label} must be one of {sorted(allowed)}, got {v!r}",
                                 line=line)
        return v, None
    return parser


def _parse_seal(raw: str, line: int):
    """Parse `sealed|unsealed [who] [when]`; validate the leading state token."""
    v = raw.strip()
    if not v:
        return None, Finding(0, "parse", "expected a seal state", line=line)
    state = v.split()[0]
    if state not in _SEAL_SET:
        return None, Finding(0, "parse",
                             f"seal state must be sealed|unsealed, got {state!r}", line=line)
    return v, None


# keyed kinds: kind -> (prefix, default_status, status_set). The id namespace is
# #<issue>.<prefix><n>; a later comment bearing the same id supersedes it (fold).
KEYED: dict = {
    QUESTION:    ("q",   "open",     frozenset({"open", "answered"})),
    VALIDATION:  ("v",   "open",     frozenset({"open", "met", "unmet"})),
    ALTERNATIVE: ("alt", "proposed", frozenset({"proposed", "rejected", "viable", "chosen"})),
    # FUTURE = expansion (niceness / new child); carries an optional [v<n>] version tag.
    FUTURE:      ("fut", "declared", frozenset({"declared", "activated", "dropped"})),
    # REFINE = the correctness-bearing accuracy lever (contingent; "if our approximation
    # proves inadequate, here is a more-exact one"). Reviewed against the gestalt post-correct.
    REFINE:      ("fd",  "declared", frozenset({"declared", "activated", "dropped"})),
    OPT:         ("opt", "declared", frozenset({"declared", "done", "dropped"})),
    DEAD_END:    ("de",  "closed",   frozenset({"closed", "revived"})),
    ARTEFACT:    ("art", "live",     frozenset({"live", "stale"})),
    # Pro/Con are keyed *under an option* — their id has an extra segment
    # (#<issue>.<opt><n>.p<n>); the parser below uses a custom id pattern.
    PRO:         ("p",   "standing", frozenset({"standing", "refuted", "moot"})),
    CON:         ("c",   "standing", frozenset({"standing", "refuted", "moot"})),
}

_WS_SPLIT = re.compile(r"^(\S+)\s*(.*)$", re.DOTALL)

# A disciplined, optional version tag — only Future (expansion) markers may carry one.
# `_VER_CLEAN` is the accepted shape `[v<n>]`; `_VER_LOOSE` catches `[v…`-shaped tokens
# that aren't well-formed so they fail loudly rather than silently becoming text.
_VER_CLEAN = re.compile(r"\[(v\d+)\](?:\s+|$)")
_VER_LOOSE = re.compile(r"\[v\d")


def _make_keyed_parser(prefix: str, default_status: str, status_set: frozenset,
                       id_pattern: str | None = None, id_hint: str | None = None,
                       version: bool = False) -> Callable:
    """Build a parser for `<id> [<status>] [<version>] [<text>]`, id = #<issue>.<prefix><n>.

    The id's prefix must match this kind. An unrecognised second token is text,
    not status (the default status then applies). Returns a Keyed value.

    `id_pattern`/`id_hint` override the default id shape — used by Pro/Con, whose
    ids carry an extra option segment (#<issue>.<opt><n>.p<n>).

    `version=True` (Future markers only) permits an optional `[v<n>]` tag between the
    status and the text. A version tag on a non-version kind, or a malformed one, is a
    Finding — the tag is a query selector for the release gate, so it must be disciplined.
    """
    id_re = re.compile(id_pattern or rf"^#\d+\.{prefix}\d+$")
    hint = id_hint or f"#<issue>.{prefix}<n>"

    def parser(raw: str, line: int):
        v = raw.strip()
        if not v:
            return None, Finding(0, "parse", f"keyed marker needs an id like {hint}", line=line)
        mid = _WS_SPLIT.match(v)
        idtok, rest = mid.group(1), mid.group(2)
        if not id_re.match(idtok):
            return None, Finding(0, "parse",
                                 f"bad keyed id {idtok!r}; expected {hint}", line=line)
        status, text = default_status, rest
        mst = _WS_SPLIT.match(rest)
        if mst and mst.group(1) in status_set:
            status, text = mst.group(1), mst.group(2)

        ver = None
        mvc = _VER_CLEAN.match(text)
        if mvc:
            if not version:
                return None, Finding(0, "parse",
                                     f"version tag [{mvc.group(1)}] only allowed on Future markers",
                                     line=line)
            ver, text = mvc.group(1), text[mvc.end():]
        elif _VER_LOOSE.match(text):
            return None, Finding(0, "parse",
                                 f"malformed version tag in {text!r}; expected [v<n>]", line=line)

        return Keyed(idtok, status, text.strip(), ver), None

    return parser


def _keyed_inline_is_id_only(inline: str, status_set: frozenset) -> bool:
    """True if `inline` is just an id (optionally + a status word), no further text.

    Used to decide whether an immediately-following blockquote is the keyed
    marker's body.
    """
    mid = _WS_SPLIT.match(inline)
    if not mid:
        return False
    rest = mid.group(2)
    if not rest:
        return True
    mst = _WS_SPLIT.match(rest)
    return bool(mst and mst.group(1) in status_set and not mst.group(2).strip())


# Table: (normalised_glyph, keyword_regex, kind, parser, is_block_only)
# keyword_regex is case-insensitive and matched after the glyph.
_VOCAB: list[tuple[str, str, str, Callable, bool]] = [
    (_G_PART_OF,  r"Part-of",   PART_OF,   _parse_issue_list,  False),
    (_G_ASPECT,   r"aspect",    ASPECT,    _parse_str,         False),
    (_G_BOUNDARY, r"Boundary",  BOUNDARY,  _parse_issue_list,  False),
    (_G_BLOCKED,  r"Blocked-by",BLOCKED_BY,_parse_issue_list,  False),
    (_G_DESIGN,   r"Design",    DESIGN,    _parse_single_issue,False),
    (_G_EQ,       r"Eq",        EQ,        _parse_str,         False),
    (_G_CITES,    r"Cites",     CITES,     _parse_cite_list,   False),
    (_G_DEAD_END, r"Dead-end",  DEAD_END,  _make_keyed_parser(*KEYED[DEAD_END]),       False),
    (_G_CONFIDENCE, r"Confidence", CONFIDENCE, _parse_enum(_CONFIDENCE_SET, "Confidence"), False),
    (_G_FIDELITY,   r"Fidelity",   FIDELITY,   _parse_enum(_FIDELITY_SET, "Fidelity"),     False),
    (_G_SEAL,       r"Seal",       SEAL,       _parse_seal,                                False),
    (_G_QUESTION,    r"Question",    QUESTION,    _make_keyed_parser(*KEYED[QUESTION]),    False),
    (_G_VALIDATION,  r"Validation",  VALIDATION,  _make_keyed_parser(*KEYED[VALIDATION]),  False),
    (_G_ALTERNATIVE, r"Alternative", ALTERNATIVE, _make_keyed_parser(*KEYED[ALTERNATIVE]), False),
    (_G_FUTURE,      r"Future",      FUTURE,      _make_keyed_parser(*KEYED[FUTURE], version=True), False),
    (_G_REFINE,      r"Refinement",  REFINE,      _make_keyed_parser(*KEYED[REFINE]),      False),
    (_G_OPT,         r"Optimisation",OPT,         _make_keyed_parser(*KEYED[OPT]),         False),
    (_G_ARTEFACT,    r"Artefact",    ARTEFACT,    _make_keyed_parser(*KEYED[ARTEFACT]),    False),
    (_G_PRO, r"Pro", PRO, _make_keyed_parser("p", "standing", KEYED[PRO][2],
        id_pattern=r"^#\d+\.[a-z]+\d+\.p\d+$", id_hint="#<issue>.<opt>.p<n>"), False),
    (_G_CON, r"Con", CON, _make_keyed_parser("c", "standing", KEYED[CON][2],
        id_pattern=r"^#\d+\.[a-z]+\d+\.c\d+$", id_hint="#<issue>.<opt>.c<n>"), False),
]

# Bare keyword patterns for I8 (sigil-less line detection)
_KEYWORD_PATTERNS = [(kw, kind) for _, kw, kind, _, _ in _VOCAB]

# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Keyed:
    """Value of a keyed marker: stable id, evolving status, free text.

    e.g. Keyed("#16.q4", "answered", "Yes — foo holds when bar").
    """
    id: str
    status: str
    text: str
    version: str | None = None   # Future markers only: e.g. "v1" (the release-gate selector)


@dataclass
class Marker:
    """A single extracted marker.

    Equality is by (kind, value) — line is metadata.
    """
    kind: str
    value: object  # list[int] | str | list[str] | int
    line: int

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Marker):
            return NotImplemented
        return self.kind == other.kind and self.value == other.value

    def __hash__(self) -> int:
        v = self.value
        if isinstance(v, list):
            v = tuple(v)
        return hash((self.kind, v))


@dataclass
class Finding:
    """A linter finding.

    str() renders as ``#<issue>:<key>:<detail>``.
    severity ∈ {"finding", "warning", "info"}.
    Only "finding" flips the CLI exit code to 1.
    """
    issue: int
    key: str
    detail: str
    severity: str = "finding"
    line: int | None = None

    def __str__(self) -> str:
        return f"#{self.issue}:{self.key}:{self.detail}"


@dataclass
class Comment:
    """One comment in a node's append-only stream (seq 0 is the body/stub)."""
    seq: int
    text: str


@dataclass
class Node:
    """A single GitHub issue as received from the fetch adapter.

    `comments` is the append-only stream after the body; collate folds
    [body @ seq 0] + comments latest-wins. Defaults empty for body-only nodes.
    """
    number: int
    body: str
    state: str            # "open" | "closed"
    state_reason: str | None  # "completed" | "not_planned" | None
    labels: set           # set[str]
    comments: list = field(default_factory=list)  # list[Comment]


@dataclass
class Parsed:
    """Result of parse()."""
    markers: list
    findings: list


@dataclass
class Platform:
    """Platform-derived index the linter diffs against in-text markers."""
    subissue_edges: set   # set of (parent, child) int tuples
    labels: dict          # dict[int, set[str]]
    settable: bool        # whether the platform supports setting sub-issue edges


# ---------------------------------------------------------------------------
# Model (collation result)
# ---------------------------------------------------------------------------

class Model:
    """Collated indices built from a list of Nodes.

    Attributes
    ----------
    tree_edges : set of (parent, child) tuples
    aspects : dict[issue_number, list[str]]
    boundaries : dict[issue_number, list[int]]
    build_order : list[int]  (topological, roots first)
    design_links : dict[issue_number, int]
    registry : _Registry  (citation/eq keys → issue numbers; supports `in` / [key])
    dead_ends : dict[issue_number, list[str]]
    nodes : dict[int, Node]  (retained for I8 and state checks)
    """

    def __init__(self) -> None:
        self.tree_edges: set = set()
        self.aspects: dict = defaultdict(list)
        self.boundaries: dict = {}
        self.build_order: list = []
        self.design_links: dict = {}
        self.registry: _Registry = _Registry()
        self.dead_ends: dict = defaultdict(list)
        self.nodes: dict = {}  # int → Node
        # rev-6 fold outputs
        self.gauges: dict = defaultdict(dict)      # issue → {"confidence":.., "fidelity":..}
        self.seal_own: dict = {}                   # issue → "sealed"|"unsealed" (explicit only)
        self.seal: dict = {}                       # issue → effective seal (incl. inheritance)
        self.registries: dict = defaultdict(list)  # keyed kind → list[(issue, Keyed)]
        self.dormant: set = set()                  # issues closed + labelled "dormant"
        self.confidence_inputs: dict = {}          # issue → (resolved, total) from q/v


class _Registry:
    """Queryable registry for citation and equation keys.

    Supports ``key in registry`` and ``registry[key]`` → issue number(s).
    """

    def __init__(self) -> None:
        self._data: dict = {}

    def add(self, key: str, issue: int) -> None:
        if key not in self._data:
            self._data[key] = []
        self._data[key].append(issue)

    def __contains__(self, key: object) -> bool:
        return key in self._data

    def __getitem__(self, key: str) -> list:
        return self._data[key]

    def items(self):
        """(key, [issue, ...]) pairs — for adapters building a serving view."""
        return self._data.items()


# ---------------------------------------------------------------------------
# Normalisation helpers
# ---------------------------------------------------------------------------

def _normalise_text(text: str) -> str:
    """NFC-normalise input text (handles U+FE0F variation selectors)."""
    return unicodedata.normalize("NFC", text)


# ---------------------------------------------------------------------------
# parse()
# ---------------------------------------------------------------------------

# Pre-compile per-glyph patterns.
# Pattern: optional leading whitespace, glyph (with optional FE0F), optional
# whitespace, keyword (case-insensitive), colon, optional whitespace, value.
_MARKER_RE: dict[str, re.Pattern] = {}
for _entry in _VOCAB:
    _glyph, _kw, _kind, _parser, _block_only = _entry
    # Match glyph with or without trailing FE0F
    _glyph_pat = re.escape(_glyph) + r"️?"
    _pat = re.compile(
        r"^[ \t]*" + _glyph_pat + r"[ \t]*" + _kw + r":[ \t]*(?P<value>.*?)[ \t]*$",
        re.IGNORECASE,
    )
    _MARKER_RE[_kind] = _pat

# Bare keyword patterns for I8 — compiled once here for the linter.
# These match lines that START with the keyword (optionally indented) without
# the emoji.
_BARE_KW_RE: dict[str, re.Pattern] = {}
for _entry in _VOCAB:
    _glyph, _kw, _kind, _parser, _block_only = _entry
    _pat = re.compile(r"^[ \t]*" + re.escape(_kw) + r":[ \t]*", re.IGNORECASE)
    _BARE_KW_RE[_kind] = _pat



def _consume_blockquote(lines: list, i: int) -> tuple:
    """Collect consecutive `>` lines from index i (one space after `>` stripped).

    Returns (joined_text, new_index).
    """
    block_lines = []
    while i < len(lines):
        bl_stripped = lines[i].lstrip()
        if not bl_stripped.startswith(">"):
            break
        content = bl_stripped[1:]
        if content.startswith(" "):
            content = content[1:]
        block_lines.append(content)
        i += 1
    return "\n".join(block_lines), i


def parse(text: str) -> Parsed:
    """Parse issue body text into markers and findings.

    Rules
    -----
    - Markers inside fenced code blocks do not register.
    - Standalone blockquotes do not register (quoting ≠ asserting).
    - The emoji must be the first non-whitespace token on its line.
    - U+FE0F variation selectors are normalised before matching.
    - Empty inline value on a Dead-end line ⇒ block form: value is
      immediately-following ``>`` lines.
    - A glyph+keyword match with an unparseable value ⇒ Finding, no Marker.
    """
    text = _normalise_text(text)
    lines = text.splitlines(keepends=False)

    markers: list = []
    findings: list = []

    in_fence = False
    fence_pat = re.compile(r"^[ \t]*(```|~~~)")

    i = 0
    # Track whether we are inside a blockquote that is the value of a block marker.
    # We use a simple state: after emitting a block-form marker, we skip the consumed
    # blockquote lines.
    while i < len(lines):
        raw_line = lines[i]
        lineno = i + 1  # 1-based

        # --- fence toggle ---
        if fence_pat.match(raw_line):
            in_fence = not in_fence
            i += 1
            continue

        if in_fence:
            i += 1
            continue

        # --- standalone blockquote suppression ---
        # A line starting with ">" that was NOT consumed as a block-form value
        # is inert quoted text.  We skip the entire blockquote block.
        stripped = raw_line.lstrip()
        if stripped.startswith(">"):
            # Skip this blockquote block — it is standalone (not block-form value).
            while i < len(lines) and lines[i].lstrip().startswith(">"):
                i += 1
            continue

        # --- try each vocab entry ---
        matched = False
        for glyph, kw, kind, parser, block_only in _VOCAB:
            pat = _MARKER_RE[kind]
            m = pat.match(raw_line)
            if m is None:
                continue

            # The regex anchors to ^[ \t]*, so a match means the emoji is the
            # first non-whitespace token on the line.
            matched = True
            raw_value = m.group("value").strip()
            i += 1

            if kind in KEYED:
                # Keyed markers carry an id inline; block form triggers when the
                # inline value is just the id (+ optional status) and a blockquote
                # immediately follows — its body becomes the keyed text.
                _, _, status_set = KEYED[kind]
                if _keyed_inline_is_id_only(raw_value, status_set):
                    blocktext, i = _consume_blockquote(lines, i)
                    if blocktext:
                        raw_value = f"{raw_value}\n{blocktext}" if raw_value else blocktext
            elif not raw_value:
                # Non-keyed block form: empty inline value ⇒ value is the
                # immediately-following blockquote.
                raw_value, i = _consume_blockquote(lines, i)

            value, err = parser(raw_value, lineno)
            if err is not None:
                err.line = lineno
                findings.append(err)
                break

            markers.append(Marker(kind, value, lineno))
            break

        if not matched:
            i += 1

    return Parsed(markers=markers, findings=findings)


# ---------------------------------------------------------------------------
# render()
# ---------------------------------------------------------------------------

# Keyword display strings (matching the fixture text in tests).
_KIND_TO_KW: dict[str, str] = {
    PART_OF:   "Part-of",
    ASPECT:    "aspect",
    BOUNDARY:  "Boundary",
    BLOCKED_BY:"Blocked-by",
    DESIGN:    "Design",
    EQ:        "Eq",
    CITES:     "Cites",
    DEAD_END:  "Dead-end",
    CONFIDENCE:"Confidence",
    FIDELITY:  "Fidelity",
    SEAL:      "Seal",
    QUESTION:    "Question",
    VALIDATION:  "Validation",
    ALTERNATIVE: "Alternative",
    FUTURE:      "Future",
    REFINE:      "Refinement",
    OPT:         "Optimisation",
    ARTEFACT:    "Artefact",
    PRO:         "Pro",
    CON:         "Con",
}

# Glyph for rendering (normalised, no trailing FE0F).
_KIND_TO_GLYPH: dict[str, str] = {
    PART_OF:   _G_PART_OF,
    ASPECT:    _G_ASPECT,
    BOUNDARY:  _G_BOUNDARY,
    BLOCKED_BY:_G_BLOCKED,
    DESIGN:    _G_DESIGN,
    EQ:        _G_EQ,
    CITES:     _G_CITES,
    DEAD_END:  _G_DEAD_END,
    CONFIDENCE:_G_CONFIDENCE,
    FIDELITY:  _G_FIDELITY,
    SEAL:      _G_SEAL,
    QUESTION:    _G_QUESTION,
    VALIDATION:  _G_VALIDATION,
    ALTERNATIVE: _G_ALTERNATIVE,
    FUTURE:      _G_FUTURE,
    REFINE:      _G_REFINE,
    OPT:         _G_OPT,
    ARTEFACT:    _G_ARTEFACT,
    PRO:         _G_PRO,
    CON:         _G_CON,
}


def _render_value(kind: str, value: object) -> str:
    """Render a non-keyed marker value to its string representation."""
    if kind in (PART_OF, BOUNDARY, BLOCKED_BY):
        # list[int] → "#16, #17"
        assert isinstance(value, list)
        return ", ".join(f"#{n}" for n in value)
    elif kind == DESIGN:
        return f"#{value}"
    elif kind == ASPECT:
        return str(value)
    elif kind == EQ:
        return str(value)
    elif kind == CITES:
        assert isinstance(value, list)
        return ", ".join(value)
    elif kind == DEAD_END:
        # Block form: value is multi-line string.
        return str(value)
    return str(value)


def render(marker: Marker) -> str:
    """Render a Marker to a string that parse() will round-trip exactly.

    Keyed markers emit their id and status inline (status is always present, so
    the round-trip is unambiguous); multi-line text goes to a blockquote with the
    id kept inline. Non-keyed multi-line values use plain block form.
    """
    glyph = _KIND_TO_GLYPH[marker.kind]
    kw = _KIND_TO_KW[marker.kind]

    if marker.kind in KEYED:
        kv = marker.value
        head = f"{kv.id} {kv.status}"
        if getattr(kv, "version", None):
            head += f" [{kv.version}]"
        if "\n" in kv.text:
            block = "\n".join(f"> {line}" for line in kv.text.split("\n"))
            return f"{glyph} {kw}: {head}\n{block}\n"
        if kv.text:
            return f"{glyph} {kw}: {head} {kv.text}\n"
        return f"{glyph} {kw}: {head}\n"

    val_str = _render_value(marker.kind, marker.value)
    if "\n" in val_str:
        block = "\n".join(f"> {line}" for line in val_str.split("\n"))
        return f"{glyph} {kw}:\n{block}\n"
    return f"{glyph} {kw}: {val_str}\n"


# ---------------------------------------------------------------------------
# collate()
# ---------------------------------------------------------------------------

_GAUGE_KEY = {CONFIDENCE: "confidence", FIDELITY: "fidelity"}


def collate(nodes: list) -> Model:
    """Build a Model by folding each node's stream ([body @ seq 0] + comments).

    Keyed markers fold latest-wins per id (→ registries, dead_ends); gauges and
    seal fold latest-wins per node; relations/registry kinds union across the
    stream. Also derives effective seal (with ancestor inheritance), the dormant
    set, and confidence inputs. Body-only nodes behave exactly as before.
    """
    model = Model()

    for node in nodes:
        model.nodes[node.number] = node

        # The node's marker stream in seq order — the body is seq 0.
        stream = [(0, mk) for mk in parse(node.body).markers]
        for c in sorted(node.comments, key=lambda c: c.seq):
            stream.extend((c.seq, mk) for mk in parse(c.text).markers)

        keyed_latest: dict = {}   # id → (seq, kind, Keyed)
        gauge_seq: dict = {}      # kind → seq (latest tracking for gauges/seal)

        for seq, mk in stream:
            if mk.kind in KEYED:
                kid = mk.value.id
                if kid not in keyed_latest or seq >= keyed_latest[kid][0]:
                    keyed_latest[kid] = (seq, mk.kind, mk.value)
            elif mk.kind in (CONFIDENCE, FIDELITY):
                if mk.kind not in gauge_seq or seq >= gauge_seq[mk.kind]:
                    gauge_seq[mk.kind] = seq
                    model.gauges[node.number][_GAUGE_KEY[mk.kind]] = mk.value
            elif mk.kind == SEAL:
                if SEAL not in gauge_seq or seq >= gauge_seq[SEAL]:
                    gauge_seq[SEAL] = seq
                    model.seal_own[node.number] = mk.value.split()[0]
            elif mk.kind == PART_OF:
                for parent in mk.value:
                    model.tree_edges.add((parent, node.number))
            elif mk.kind == ASPECT:
                if mk.value not in model.aspects[node.number]:
                    model.aspects[node.number].append(mk.value)
            elif mk.kind == BOUNDARY:
                model.boundaries[node.number] = mk.value
            elif mk.kind == DESIGN:
                model.design_links[node.number] = mk.value
            elif mk.kind == EQ:
                model.registry.add(mk.value, node.number)
            elif mk.kind == CITES:
                for key in mk.value:
                    model.registry.add(key, node.number)

        # Apply folded keyed markers → registries, dead_ends, confidence inputs.
        q_done = q_total = 0
        for _, kind, kv in keyed_latest.values():
            model.registries[kind].append((node.number, kv))
            if kind == DEAD_END:
                model.dead_ends[node.number].append(kv)
            elif kind == QUESTION:
                q_total += 1
                q_done += (kv.status == "answered")
            elif kind == VALIDATION:
                q_total += 1
                q_done += (kv.status == "met")
        if q_total:
            model.confidence_inputs[node.number] = (q_done, q_total)

        if node.state == "closed" and "dormant" in node.labels:
            model.dormant.add(node.number)

    # Build topological order (roots first).
    children_of: dict = defaultdict(set)
    parents_of: dict = defaultdict(set)
    for parent, child in model.tree_edges:
        children_of[parent].add(child)
        parents_of[child].add(parent)

    all_numbers = set(model.nodes.keys())
    roots = [n for n in all_numbers if not parents_of[n]]
    visited: set = set()
    order: list = []

    def _dfs(n: int) -> None:
        if n in visited:
            return
        visited.add(n)
        order.append(n)
        for ch in sorted(children_of[n]):
            _dfs(ch)

    for r in sorted(roots):
        _dfs(r)

    # Any remaining nodes (in cycles or disconnected) — add them too.
    for n in sorted(all_numbers):
        if n not in visited:
            order.append(n)

    model.build_order = order

    # Effective seal: own explicit seal, else nearest ancestor's, else "sealed".
    for n in all_numbers:
        cur, seen, state = n, set(), "sealed"
        while cur is not None and cur not in seen:
            seen.add(cur)
            if cur in model.seal_own:
                state = model.seal_own[cur]
                break
            ps = parents_of.get(cur)
            cur = min(ps) if ps else None
        model.seal[n] = state

    return model


# ---------------------------------------------------------------------------
# Invariant checks
# ---------------------------------------------------------------------------

def _children_of(model: Model) -> dict:
    """Return dict[parent -> set[child]] derived from model.tree_edges."""
    result: dict = defaultdict(set)
    for parent, child in model.tree_edges:
        result[parent].add(child)
    return result


def _parents_of(model: Model) -> dict:
    """Return dict[child -> set[parent]] derived from model.tree_edges."""
    result: dict = defaultdict(set)
    for parent, child in model.tree_edges:
        result[child].add(parent)
    return result


def _depth_of(node: int, parents: dict, memo: dict | None = None) -> int:
    """Compute depth of node in tree (root = depth 1).

    Returns -1 on cycle (to avoid infinite recursion).
    """
    if memo is None:
        memo = {}
    if node in memo:
        return memo[node]

    memo[node] = -1  # sentinel: currently computing (cycle guard)
    ps = parents.get(node, set())
    if not ps:
        memo[node] = 1
    else:
        max_parent_depth = max(_depth_of(p, parents, memo) for p in ps)
        if max_parent_depth == -1:
            memo[node] = -1
        else:
            memo[node] = max_parent_depth + 1
    return memo[node]


def _detect_cycles(model: Model) -> list:
    """Return list of issue numbers involved in cycles."""
    parents = _parents_of(model)
    in_cycle: list = []
    for node in model.nodes:
        d = _depth_of(node, parents)
        if d == -1:
            in_cycle.append(node)
    return in_cycle


def _check_i1(model: Model, platform: Platform) -> list:
    """I1: Part-of marker ↔ platform sub-issue edge.

    Missing edge when settable → finding; when not settable → info.
    """
    findings: list = []
    for parent, child in model.tree_edges:
        if (parent, child) not in platform.subissue_edges:
            sev = "finding" if platform.settable else "info"
            findings.append(Finding(
                child, "I1",
                f"Part-of: #{parent} has no matching platform sub-issue edge",
                severity=sev,
            ))
    # Reverse: platform edge with no corresponding Part-of marker.
    for parent, child in platform.subissue_edges:
        if (parent, child) not in model.tree_edges:
            sev = "finding" if platform.settable else "info"
            findings.append(Finding(
                child, "I1",
                f"platform sub-issue edge #{parent}→#{child} has no Part-of marker",
                severity=sev,
            ))
    return findings


def _check_i2(model: Model, platform: Platform) -> list:
    """I2: aspect marker ↔ aspect:* label, both directions."""
    findings: list = []
    for issue, node in model.nodes.items():
        text_aspects = set(model.aspects.get(issue, []))
        label_aspects = {
            lbl.split(":", 1)[1]
            for lbl in platform.labels.get(issue, set())
            if lbl.startswith("aspect:")
        }

        for asp in text_aspects - label_aspects:
            findings.append(Finding(
                issue, "I2",
                f"text has 'aspect: {asp}' but no label 'aspect:{asp}'",
            ))
        for asp in label_aspects - text_aspects:
            findings.append(Finding(
                issue, "I2",
                f"label 'aspect:{asp}' has no corresponding text marker",
            ))
    return findings


def _check_i3(model: Model, platform: Platform) -> list:
    """I3: exactly one parent; no cycles."""
    findings: list = []
    parents = _parents_of(model)

    # Multiple parents.
    for issue, ps in parents.items():
        if len(ps) > 1:
            findings.append(Finding(
                issue, "I3",
                f"node #{issue} has multiple parents: {sorted(ps)}",
            ))

    # Cycles.
    in_cycle = _detect_cycles(model)
    reported: set = set()
    for issue in in_cycle:
        if issue not in reported:
            findings.append(Finding(
                issue, "I3",
                f"node #{issue} is part of a cycle",
            ))
            reported.add(issue)

    return findings


def _check_i4(model: Model, platform: Platform) -> list:
    """I4: closed-completed parent ⇒ all children closed-completed."""
    findings: list = []
    children = _children_of(model)

    for parent, node in model.nodes.items():
        if node.state == "closed" and node.state_reason == "completed":
            for child in children.get(parent, set()):
                child_node = model.nodes.get(child)
                if child_node is None:
                    continue
                if not (child_node.state == "closed" and
                        child_node.state_reason == "completed"):
                    findings.append(Finding(
                        child, "I4",
                        f"parent #{parent} is closed/completed but #{child} is not",
                    ))
    return findings


def _check_i5(model: Model, platform: Platform) -> list:
    """I5: Boundary markers live only on parents, name only that parent's children."""
    findings: list = []
    children = _children_of(model)

    for issue, boundary_refs in model.boundaries.items():
        # Must be a parent.
        if not children.get(issue):
            findings.append(Finding(
                issue, "I5",
                f"#{issue} has a Boundary marker but is not a parent (no children)",
            ))
            continue

        # Each named ref must be a child of this issue.
        for ref in boundary_refs:
            if ref not in children[issue]:
                findings.append(Finding(
                    issue, "I5",
                    f"Boundary on #{issue} names #{ref} which is not its child",
                ))
    return findings


def _check_i6(model: Model, platform: Platform) -> list:
    """I6: tree depth ≤ 8; warn at 7 or 8 (finding beyond 8).

    _chain(N) in the tests builds root (depth 1) + N descendants, so _chain(7)
    reaches depth 8 and must produce a warning, _chain(9) reaches depth 10 and
    must produce a finding.  The rule is therefore: depth >= 7 and <= 8 →
    warning; depth > 8 → finding.
    """
    findings: list = []
    parents = _parents_of(model)
    memo: dict = {}

    for issue in model.nodes:
        d = _depth_of(issue, parents, memo)
        if d < 0:
            continue  # cycle — reported by I3
        if d > 8:
            findings.append(Finding(
                issue, "I6",
                f"#{issue} is at depth {d}, exceeds maximum of 8",
                severity="finding",
            ))
        elif d >= 7:
            findings.append(Finding(
                issue, "I6",
                f"#{issue} is at depth {d} (approaching maximum of 8)",
                severity="warning",
            ))
    return findings


def _check_i7(model: Model, platform: Platform) -> list:
    """I7: Design: #N points at an existing node."""
    findings: list = []
    for issue, design_ref in model.design_links.items():
        if design_ref not in model.nodes:
            findings.append(Finding(
                issue, "I7",
                f"Design: #{design_ref} not found in model",
            ))
    return findings


def _check_i8(model: Model, platform: Platform) -> list:
    """I8: line-leading bare keyword without its emoji → finding, no auto-insert."""
    findings: list = []

    for issue, node in model.nodes.items():
        lines = node.body.splitlines()
        for lineno, line in enumerate(lines, start=1):
            stripped = line.lstrip()
            for kw, kind in _KEYWORD_PATTERNS:
                pat = _BARE_KW_RE[kind]
                if pat.match(stripped):
                    # Make sure it's not an emoji-led line (which parse() would handle).
                    # The bare-keyword pattern matches lines WITHOUT the emoji.
                    # But we must be sure the emoji isn't present.
                    # The pat already doesn't require an emoji, so if it matches, no emoji.
                    # However, we need to ensure the emoji-form regex does NOT also match.
                    emoji_pat = _MARKER_RE[kind]
                    if not emoji_pat.match(line):
                        # Keyed kinds use common English keywords; only flag a
                        # missing sigil when an id actually follows (else it's
                        # ordinary prose, not a sigil-less marker).
                        bare_end = pat.match(stripped).end()
                        if kind in KEYED and not re.match(r"#\d+\.[a-z]+\d+", stripped[bare_end:]):
                            break
                        findings.append(Finding(
                            issue, "I8",
                            f"line {lineno}: bare keyword '{kw}:' without emoji sigil",
                            line=lineno,
                        ))
                    break  # only one keyword can match per line

    return findings


def _check_i9(model: Model, platform: Platform) -> list:
    """I9: a keyed marker's id issue-part must match the node that carries it."""
    findings: list = []
    for kind, items in model.registries.items():
        for issue, kv in items:
            m = re.match(r"#(\d+)\.", kv.id)
            if m and int(m.group(1)) != issue:
                findings.append(Finding(
                    issue, "I9",
                    f"keyed id {kv.id} is carried by #{issue} but names a different issue",
                ))
    return findings


def _check_i12(model: Model, platform: Platform) -> list:
    """I12: a node labelled 'dormant' must be closed."""
    findings: list = []
    for issue, node in model.nodes.items():
        if "dormant" in node.labels and node.state != "closed":
            findings.append(Finding(
                issue, "I12", "node is labelled 'dormant' but is not closed",
            ))
    return findings


def _check_i13(model: Model, platform: Platform) -> list:
    """I13: a 'correct' node's non-dormant children must also be 'correct'."""
    findings: list = []
    children = _children_of(model)
    for issue in model.nodes:
        if model.gauges.get(issue, {}).get("fidelity") != "correct":
            continue
        for child in children.get(issue, set()):
            if child in model.dormant:
                continue
            cfid = model.gauges.get(child, {}).get("fidelity")
            if cfid != "correct":
                findings.append(Finding(
                    child, "I13",
                    f"#{issue} is 'correct' but child #{child} is '{cfid or 'unset'}'",
                ))
    return findings


# I10 (cross-reference resolution) and I11 (value-set validity) are deferred:
# value validity is enforced at parse time, and prose cross-reference scanning is
# noisy — see context-spec.md §7.
CHECKS: dict = {
    "I1": _check_i1,
    "I2": _check_i2,
    "I3": _check_i3,
    "I4": _check_i4,
    "I5": _check_i5,
    "I6": _check_i6,
    "I7": _check_i7,
    "I8": _check_i8,
    "I9": _check_i9,
    "I12": _check_i12,
    "I13": _check_i13,
}
