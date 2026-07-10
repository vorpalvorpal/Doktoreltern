/** `dl reply <thread>` (package C3, body on stdin). */
import { replyVerb } from './verbs';

export async function cmdReply(ws: string, positional: string[], stdin: string): Promise<string> {
  const [threadId] = positional;
  if (!threadId) throw new Error('usage: dl reply <thread>  (body on stdin)');
  const body = stdin.replace(/\n+$/, '');
  const { doc } = await replyVerb(ws, threadId, 'claude', body);
  return `${threadId} ← reply (${doc})`;
}
