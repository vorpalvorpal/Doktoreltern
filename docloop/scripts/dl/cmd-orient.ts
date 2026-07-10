/**
 * `dl orient` (package B6) — one screen: tracked docs with open-thread
 * counts, whose turn it is (HEAD's author: model ⇒ human's turn, otherwise
 * your turn), and the last few commit subjects with short shas + author tags.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractAnchors } from '../../src/threads';
import { listThreads } from '../../src/threads-store';
import { trackedDocs } from './docs';
import { git, MODEL_AUTHOR_EMAIL } from './gitio';

export async function cmdOrient(ws: string): Promise<string> {
  const docs = await trackedDocs(ws);
  const threads = await listThreads(join(ws, 'threads'));
  const resolvedIds = new Set(threads.filter((t) => t.resolved).map((t) => t.id));

  const lines: string[] = [];
  let totalOpen = 0;

  for (const doc of docs) {
    const text = readFileSync(join(ws, doc), 'utf8');
    const openCount = extractAnchors(text).filter((a) => !resolvedIds.has(a.id)).length;
    totalOpen += openCount;
    lines.push(`${doc} — ${openCount} open thread${openCount === 1 ? '' : 's'}`);
  }
  lines.push(`total: ${totalOpen} open thread${totalOpen === 1 ? '' : 's'} across the workspace`);

  let headAuthorEmail = '';
  try {
    headAuthorEmail = (await git(ws, ['show', '-s', '--format=%ae', 'HEAD'])).trim();
  } catch {
    /* no commits yet */
  }
  const whoseTurn = headAuthorEmail === MODEL_AUTHOR_EMAIL ? "human's turn" : 'your turn';
  lines.push(`turn: ${whoseTurn}`);

  lines.push('history:');
  try {
    const log = (await git(ws, ['log', '-n', '5', '--format=%h%x09%ae%x09%s'])).trim();
    for (const line of log.split('\n').filter(Boolean)) {
      const [sha, email, subject] = line.split('\t');
      const tag = email === MODEL_AUTHOR_EMAIL ? 'model' : 'human';
      lines.push(`  ${sha} (${tag}) ${subject}`);
    }
  } catch {
    /* no commits yet */
  }

  return lines.join('\n');
}
