/**
 * `dl commit -m "<subject>" [--allow-manual]` (package C2).
 */
import { commitTurn } from './commitcore';

export async function cmdCommit(ws: string, positional: string[]): Promise<string> {
  let subject: string | undefined;
  let allowManual = false;
  for (let i = 0; i < positional.length; i++) {
    if (positional[i] === '-m' || positional[i] === '--message') subject = positional[++i];
    else if (positional[i] === '--allow-manual') allowManual = true;
  }
  if (!subject) throw new Error('usage: dl commit -m "<subject>" [--allow-manual]');

  const { sha, docsCount, threadsCount } = await commitTurn(ws, { subject, allowManual });
  return `committed ${sha} (${docsCount} doc${docsCount === 1 ? '' : 's'}, ${threadsCount} thread${threadsCount === 1 ? '' : 's'})`;
}
