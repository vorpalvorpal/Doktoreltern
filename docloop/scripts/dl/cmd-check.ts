/**
 * `dl check` (package C1). Unlike the other verbs, issues print to STDOUT
 * (one `ERROR`/`WARN <doc>: …` line each, summary last) with exit 1 iff any
 * ERROR was found — this is a multi-issue reporter, not a single
 * success/failure line, so it does not go through the generic
 * throw-on-failure dispatcher contract. `runCheck` returns the exit code
 * directly; `dl.ts` special-cases this verb rather than the shared CmdFn shape.
 */
import { checkWorkspace } from './checkcore';

export interface CheckResult {
  stdout: string;
  code: number;
}

export async function runCheck(ws: string): Promise<CheckResult> {
  const issues = await checkWorkspace(ws);
  const lines: string[] = [];
  for (const issue of issues) {
    const doc = issue.doc ? `${issue.doc}: ` : '';
    lines.push(`${issue.level} ${doc}${issue.message}`);
  }
  const errorCount = issues.filter((i) => i.level === 'ERROR').length;
  const warnCount = issues.length - errorCount;
  if (errorCount > 0) {
    lines.push(
      `check: ${errorCount} error${errorCount === 1 ? '' : 's'}${warnCount ? `, ${warnCount} warning${warnCount === 1 ? '' : 's'}` : ''}`,
    );
    return { stdout: lines.join('\n'), code: 1 };
  }
  lines.push(issues.length === 0 ? 'check: clean' : `check: ${warnCount} warning${warnCount === 1 ? '' : 's'}, no errors`);
  return { stdout: lines.join('\n'), code: 0 };
}
