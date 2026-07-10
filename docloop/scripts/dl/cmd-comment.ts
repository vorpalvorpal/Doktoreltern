/** `dl comment "<span>" [--doc <doc>] [--block <doc>@<ref>:<n>]` (package C3, body on stdin). */
import { commentVerb } from './verbs';

export async function cmdComment(ws: string, positional: string[], stdin: string): Promise<string> {
  const [span, ...rest] = positional;
  if (!span) throw new Error('usage: dl comment "<span>" [--doc <doc>] [--block <doc>@<ref>:<n>]  (body on stdin)');

  let doc: string | undefined;
  let block: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--doc') doc = rest[++i];
    else if (rest[i] === '--block') block = rest[++i];
  }

  const body = stdin.replace(/\n+$/, '');
  const { id, doc: targetDoc, newRef } = await commentVerb(ws, span, 'claude', body, { doc, block });
  return `${id} → ${targetDoc}@${newRef}`;
}
