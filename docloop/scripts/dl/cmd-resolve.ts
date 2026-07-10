/** `dl resolve <thread> [--note "<text>"]` (package C3). */
import { resolveVerb } from './verbs';

export async function cmdResolve(ws: string, positional: string[]): Promise<string> {
  const [threadId, ...rest] = positional;
  if (!threadId) throw new Error('usage: dl resolve <thread> [--note "<text>"]');

  let note: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--note') note = rest[++i];
  }

  const { doc, newRef } = await resolveVerb(ws, threadId, 'claude', note);
  if (doc === null) return `${threadId} resolved (no live anchor)`;
  return `${threadId} resolved (${doc}@${newRef})`;
}
