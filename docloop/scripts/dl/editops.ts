/**
 * The pure op layer behind `dl edit` (package A6). Parses the stdin op
 * grammar and applies validated ops to a doc's block segments — no I/O, no
 * canonicalisation, no git; those live in the CLI wrapper (cmd-edit.ts).
 *
 * Stdin grammar (one or more ops):
 *
 *   @@ replace 4-5
 *   replacement markdown (any number of lines)
 *
 *   @@ insert-after 9
 *   new block(s)
 *
 *   @@ delete 12
 *
 * Op header: `^@@ (replace|insert-after|delete) <n>(-<m>)?$`. `insert-after 0`
 * means insert at the very top. `delete` takes no body; `replace` /
 * `insert-after` bodies are the lines up to the next op header / EOF, with
 * trailing blank lines trimmed. A body line itself matching the op-header
 * grammar is a hard error ("ambiguous body") raised before any work.
 */
import { splitBlocks } from './blocks';

export type EditOp =
  | { kind: 'replace'; n: number; m: number; body: string }
  | { kind: 'insert-after'; n: number; body: string }
  | { kind: 'delete'; n: number; m: number };

export interface ShiftEntry {
  from: number;
  delta: number;
}

export interface ApplyResult {
  text: string;
  shift: ShiftEntry[];
}

const OP_HEADER_RE = /^@@ (replace|insert-after|delete) (\d+)(?:-(\d+))?$/;

/** Trim trailing blank lines (but not interior ones) from a body's line list. */
function trimTrailingBlank(lines: string[]): string[] {
  const out = [...lines];
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out;
}

/**
 * Parse the stdin op grammar into an ordered list of {@link EditOp}. Throws
 * "ambiguous body" if a body line itself matches the op-header grammar
 * (before any op is applied). Ops are returned in the order given on stdin —
 * callers apply them bottom-up against the ORIGINAL block numbering.
 */
export function parseEditOps(stdin: string): EditOp[] {
  const lines = stdin.split('\n');
  // Drop a single trailing '' from the final split (stdin ending in \n).
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  interface RawOp {
    kind: EditOp['kind'];
    n: number;
    m?: number;
    bodyLines: string[];
  }
  const raw: RawOp[] = [];
  let current: RawOp | null = null;

  for (const line of lines) {
    const header = OP_HEADER_RE.exec(line);
    if (header) {
      // A header-shaped line is only unambiguous when the current op's body
      // region has ended (nothing captured, or the last captured line was
      // the blank separator) — otherwise it cannot be told apart from a body
      // line that merely happens to match the header grammar. Hard error in
      // EVERY such case, not just when the body is entirely empty: a real
      // body line matching `^@@ ...$` is never silently reinterpreted as the
      // start of a new op.
      if (current !== null && current.bodyLines.length > 0 && current.bodyLines[current.bodyLines.length - 1] !== '') {
        throw new Error(
          `dl edit: ambiguous body — line ${JSON.stringify(line)} matches an op header mid-body (@@ ${current.kind} ${current.n})`,
        );
      }
      current = {
        kind: header[1] as EditOp['kind'],
        n: Number(header[2]),
        m: header[3] !== undefined ? Number(header[3]) : undefined,
        bodyLines: [],
      };
      raw.push(current);
      continue;
    }
    if (current === null) {
      // Body content before any op header — not a valid op stream, but
      // nothing to attach it to; skip silently (blank leading lines etc.).
      if (line.trim() === '') continue;
      throw new Error(`dl edit: expected an op header, got: ${JSON.stringify(line)}`);
    }
    current.bodyLines.push(line);
  }

  if (raw.length === 0) throw new Error('dl edit: no ops given');

  const ops: EditOp[] = raw.map((r) => {
    if (r.kind === 'delete') {
      return { kind: 'delete', n: r.n, m: r.m ?? r.n };
    }
    // Because a header line always terminates the PRECEDING op's body region
    // (bodies run "up to the next op header / EOF"), a body-requiring op
    // (replace/insert-after) whose captured lines trim down to nothing —
    // whether zero lines were captured at all, or only blank ones — has no
    // real body. Refuse rather than silently accept an empty
    // replacement/insertion.
    const trimmed = trimTrailingBlank(r.bodyLines);
    if (trimmed.length === 0) {
      throw new Error(
        `dl edit: ambiguous body — @@ ${r.kind} ${r.n} has no body before the next op header / EOF`,
      );
    }
    const body = trimmed.join('\n');
    if (r.kind === 'replace') return { kind: 'replace', n: r.n, m: r.m ?? r.n, body };
    return { kind: 'insert-after', n: r.n, body };
  });

  return ops;
}

/** The [n, m] target range of an op, for overlap checking. insert-after n targets the gap after n (n, n). */
function targetRange(op: EditOp): { from: number; to: number } {
  if (op.kind === 'insert-after') return { from: op.n, to: op.n };
  return { from: op.n, to: op.m };
}

/**
 * Validate and apply ops against `source`'s current block segmentation.
 * Validation order (all before any mutation): ranges within 1..N and n<=m →
 * pairwise non-overlapping targets (two inserts at the same point also
 * counts) → (stale-ref checking is the CLI's job, not this pure layer).
 * Applies bottom-up on the block segments, then returns the spliced text plus
 * a cumulative shift map: `{from, delta}[]` meaning "old ordinals >= from map
 * to old + delta" (read left-to-right, last matching entry wins).
 */
export function applyEditOps(source: string, ops: EditOp[]): ApplyResult {
  const blocks = splitBlocks(source);
  const n = blocks.length;

  // Range validation.
  for (const op of ops) {
    const { from, to } = targetRange(op);
    if (op.kind === 'insert-after') {
      if (from < 0 || from > n) throw new Error(`dl edit: insert-after ${from} out of range (0..${n})`);
    } else {
      if (from < 1 || to > n || from > to) {
        throw new Error(`dl edit: ${op.kind} ${from}-${to} out of range (1..${n})`);
      }
    }
  }

  // Pairwise overlap validation. A replace/delete range [from,to] overlaps
  // another [from2,to2] if they intersect. An insert-after n's "point" is the
  // gap after block n; two inserts at the same point collide; an
  // insert-after n is NOT considered to overlap an adjacent replace/delete
  // range that merely touches n or n+1 (only literal same-point inserts, or
  // replace/delete range intersections, are rejected).
  for (let i = 0; i < ops.length; i++) {
    for (let j = i + 1; j < ops.length; j++) {
      const a = ops[i];
      const b = ops[j];
      if (a.kind === 'insert-after' && b.kind === 'insert-after') {
        if (a.n === b.n) throw new Error(`dl edit: two inserts at the same point (after ${a.n})`);
        continue;
      }
      if (a.kind === 'insert-after' || b.kind === 'insert-after') continue; // inserts vs ranges: no overlap by construction
      const ra = targetRange(a);
      const rb = targetRange(b);
      if (ra.from <= rb.to && rb.from <= ra.to) {
        throw new Error(`dl edit: overlapping ops (${a.kind} ${ra.from}-${ra.to} / ${b.kind} ${rb.from}-${rb.to})`);
      }
    }
  }

  // Apply bottom-up: sort by a "position" key descending so later splices
  // don't disturb earlier (lower-numbered) ones. insert-after n sits just
  // after block n's segment; replace/delete n-m spans blocks n..m.
  const order = [...ops].sort((x, y) => {
    const px = x.kind === 'insert-after' ? x.n + 0.5 : x.n;
    const py = y.kind === 'insert-after' ? y.n + 0.5 : y.n;
    return py - px; // descending
  });

  // Work on a mutable copy of block segments (1-indexed via index n-1).
  const segments = blocks.map((b) => b.segment);

  // shift deltas keyed by ordinal breakpoint, built as we go (in ORIGINAL
  // numbering, since ops target the original ref).
  const breakpoints = new Map<number, number>();
  const bump = (fromOrdinal: number, delta: number) => {
    breakpoints.set(fromOrdinal, (breakpoints.get(fromOrdinal) ?? 0) + delta);
  };

  for (const op of order) {
    if (op.kind === 'delete') {
      segments.splice(op.n - 1, op.m - op.n + 1);
      bump(op.m + 1, -(op.m - op.n + 1));
    } else if (op.kind === 'replace') {
      const sep = blocks[op.m - 1] ? trailingSeparator(blocks[op.m - 1].segment) : '\n\n';
      const newSegment = op.body + sep;
      segments.splice(op.n - 1, op.m - op.n + 1, newSegment);
      const removedCount = op.m - op.n + 1;
      bump(op.m + 1, 1 - removedCount); // replaced range collapses to 1 segment
    } else {
      // insert-after n: n=0 means prepend.
      const sep = blocks[op.n - 1] ? trailingSeparator(blocks[op.n - 1].segment) : '\n\n';
      const newSegment = op.body + sep;
      segments.splice(op.n, 0, newSegment);
      bump(op.n + 1, 1);
    }
  }

  const text = segments.join('');

  // Turn the breakpoint map into a cumulative, sorted shift list. A
  // breakpoint whose cumulative delta nets to 0 (e.g. an equal-block-count
  // replace) carries no information beyond "unchanged" — the same as no
  // entry at all — so it's dropped rather than reported as a no-op shift.
  const sortedFroms = [...breakpoints.keys()].sort((a, b) => a - b);
  const shift: ShiftEntry[] = [];
  let cum = 0;
  for (const from of sortedFroms) {
    cum += breakpoints.get(from)!;
    if (cum !== 0) shift.push({ from, delta: cum });
  }

  return { text, shift };
}

/** The trailing blank-line separator of a block segment (everything after its trimmed content). */
function trailingSeparator(segment: string): string {
  const trimmed = segment.replace(/\n+$/, '');
  const sep = segment.slice(trimmed.length);
  return sep || '\n';
}
