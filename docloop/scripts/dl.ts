/**
 * `dl` — the single entrypoint for every verb (dl-00-overview "Principles",
 * "Where things live"). Routes to `scripts/dl/cmd-<verb>.ts`; this file only
 * routes — packages B and C implement their verbs by replacing their own
 * stub files, never this dispatcher.
 *
 *     npm run dl -- <verb> [args...]      (body, where a verb takes one, via stdin)
 *
 * Workspace root: `DOCLOOP_WORKSPACE` env var, default `<cwd>/workspace`.
 * Output discipline (dl-00-overview): one line to stdout on success (exit
 * 0); on failure, `dl <verb>: <reason>` to stderr (exit 1), nothing on
 * stdout, no partial writes.
 */
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { cmdRead } from './dl/cmd-read';
import { cmdEdit } from './dl/cmd-edit';
import { cmdAgenda } from './dl/cmd-agenda';
import { cmdOrient } from './dl/cmd-orient';
import { runCheck } from './dl/cmd-check';
import { cmdCommit } from './dl/cmd-commit';
import { cmdReply } from './dl/cmd-reply';
import { cmdComment } from './dl/cmd-comment';
import { cmdResolve } from './dl/cmd-resolve';

type CmdFn = (ws: string, positional: string[], stdin: string) => Promise<string>;

const VERBS: Record<string, { fn: CmdFn; usage: string; needsStdin: boolean }> = {
  read: { fn: cmdRead, usage: 'read <doc> [section]', needsStdin: false },
  edit: { fn: cmdEdit, usage: 'edit <doc>@<ref>            (ops on stdin)', needsStdin: true },
  agenda: { fn: cmdAgenda, usage: 'agenda', needsStdin: false },
  orient: { fn: cmdOrient, usage: 'orient', needsStdin: false },
  commit: { fn: cmdCommit, usage: 'commit -m "<subject>"', needsStdin: false },
  reply: { fn: cmdReply, usage: 'reply <thread>               (body on stdin)', needsStdin: true },
  comment: { fn: cmdComment, usage: 'comment "<span>" [--doc <doc>] [--block <doc>@<ref>:<n>]  (body on stdin)', needsStdin: true },
  resolve: { fn: cmdResolve, usage: 'resolve <thread> [--note "<text>"]', needsStdin: false },
};

// `check` has its own output contract (issues print to stdout even on
// failure; see cmd-check.ts) — special-cased below rather than forced into
// the shared CmdFn shape. Listed here only so --help still names it.
const CHECK_USAGE = 'check';

function printHelp(): void {
  console.log('usage: dl <verb> [args...]');
  console.log(`  dl ${CHECK_USAGE}`);
  for (const { usage } of Object.values(VERBS)) console.log(`  dl ${usage}`);
}

/** Blocking stdin read (fd 0) — see scripts/thread.ts for why synchronous matters here. */
function readStdin(): string {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

async function main(): Promise<void> {
  const [verb, ...rest] = process.argv.slice(2);
  const ws = process.env.DOCLOOP_WORKSPACE ?? join(process.cwd(), 'workspace');

  if (!verb || verb === '--help' || verb === '-h') {
    printHelp();
    process.exit(0);
  }

  if (verb === 'check') {
    const { stdout, code } = await runCheck(ws);
    console.log(stdout);
    process.exit(code);
  }

  const entry = VERBS[verb];
  if (!entry) {
    console.error(`dl: unknown verb "${verb}" — usage: dl <verb> [args...]`);
    process.exit(1);
  }

  try {
    const stdin = entry.needsStdin ? readStdin() : '';
    const out = await entry.fn(ws, rest, stdin);
    console.log(out);
  } catch (err) {
    console.error(`dl ${verb}: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

await main();
