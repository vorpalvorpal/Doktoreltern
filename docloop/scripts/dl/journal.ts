import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Per-turn scratch journal stored at <ws>/.git/docloop/turn.json.
 * Tracks writes and thread activity during a single turn.
 */
export interface TurnScratch {
  writes: Record<string, string>;      // path (repo-relative) -> refOf(file bytes) at last dl write
  threads: {
    opened: string[];
    replied: string[];
    resolved: { id: string; note?: string }[];
  };
}

/**
 * Get the path to the turn journal file.
 */
function journalPath(ws: string): string {
  return join(ws, '.git', 'docloop', 'turn.json');
}

/**
 * Record a write to a file. Stores `refOf(file bytes)` — the hash of the
 * exact bytes written, never the raw content — so a later comparison against
 * disk is always a single `refOf` compare (no dual raw-or-hash fallback).
 * Auto-creates the journal directory if needed.
 */
export function recordWrite(ws: string, relPath: string, bytes: string): void {
  const path = journalPath(ws);
  const dir = join(ws, '.git', 'docloop');

  // Create directory if it doesn't exist
  mkdirSync(dir, { recursive: true });

  // Read existing scratch or create new
  let scratch = readScratch(ws);
  if (!scratch) {
    scratch = {
      writes: {},
      threads: {
        opened: [],
        replied: [],
        resolved: [],
      },
    };
  }

  // Update the write
  scratch.writes[relPath] = bytes;

  // Write back to file
  writeFileSync(path, JSON.stringify(scratch, null, 2), 'utf8');
}

/**
 * Record thread activity (opened, replied, or resolved).
 * Auto-creates the journal directory if needed.
 */
export function recordThread(
  ws: string,
  kind: 'opened' | 'replied' | 'resolved',
  id: string,
  note?: string,
): void {
  const path = journalPath(ws);
  const dir = join(ws, '.git', 'docloop');

  // Create directory if it doesn't exist
  mkdirSync(dir, { recursive: true });

  // Read existing scratch or create new
  let scratch = readScratch(ws);
  if (!scratch) {
    scratch = {
      writes: {},
      threads: {
        opened: [],
        replied: [],
        resolved: [],
      },
    };
  }

  // Update the appropriate thread array
  if (kind === 'resolved') {
    scratch.threads.resolved.push({ id, note });
  } else {
    scratch.threads[kind].push(id);
  }

  // Write back to file
  writeFileSync(path, JSON.stringify(scratch, null, 2), 'utf8');
}

/**
 * Read the turn journal. Returns null if the file doesn't exist yet.
 */
export function readScratch(ws: string): TurnScratch | null {
  const path = journalPath(ws);

  if (!existsSync(path)) {
    return null;
  }

  const content = readFileSync(path, 'utf8');
  return JSON.parse(content) as TurnScratch;
}

/**
 * Delete the turn journal (no-op if it doesn't exist).
 */
export function clearScratch(ws: string): void {
  const path = journalPath(ws);

  if (existsSync(path)) {
    unlinkSync(path);
  }
}
