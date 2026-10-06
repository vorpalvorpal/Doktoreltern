import type { Register } from 'claude-code'

// Spike F1 mod ("leitf"): resume a fork that a helper cut at an earlier message, inside the live session, and submit
// the next prompt. No keystroke: the mod polls the file $LEITF_CMD for {seq, forkId, prompt}; when a new seq appears
// and no turn is running it runs $.command.run({command:'resume', args: forkId}) and then $.prompt.submit.
//   LEITF_LOG   JSONL log of what the mod observed
//   LEITF_CMD   the command file the helper writes
//   LEITF_DUMP  directory for the Messages-API form of the conversation at each turn end

const lines: string[] = []
let logPath = 'leitf.log.jsonl'
let cmdPath = ''
let dump: string | undefined
let lastSeq = 0
let busy = false
let turnRunning = false
let turns = 0
let steps: { index: number; usage: any }[] = []

const log = async ($: any, what: string, data: unknown = {}) => {
  lines.push(JSON.stringify({ t: await $.clock.now(), what, data }))
  await $.fs.write(logPath, lines.join('\n') + '\n').catch(() => undefined)
}
const settle = (p: Promise<unknown>) => p.then((r: unknown) => ({ ok: r ?? null }), (err: Error) => ({ rejected: String(err) }))
const where = async ($: any) => ({ sessionId: await $.session.id(), cwd: await $.session.cwd().catch((e: Error) => String(e)), n: (await $.session.messages({ as: 'api' }).catch(() => [])).length })

const poll = async ($: any) => {
  if (busy || turnRunning || cmdPath === '') return
  const raw = await $.fs.read(cmdPath).catch(() => '')
  if (raw === '') return
  let cmd: any
  try { cmd = JSON.parse(raw) } catch { return }
  if (!(cmd.seq > lastSeq)) return
  busy = true
  lastSeq = cmd.seq
  try {
    const before = await where($)
    const t0 = await $.clock.now()
    const r = await settle($.command.run({ command: 'resume', args: cmd.forkId }))
    const t1 = await $.clock.now()
    const after = await where($)
    await log($, 'resume', { seq: cmd.seq, forkId: cmd.forkId, r, ms: t1 - t0, before, after, idOk: after.sessionId === cmd.forkId })
    if (after.sessionId !== cmd.forkId) { $.ui.toast(`leitf: resume did not land on ${cmd.forkId}; stopped`); return }
    const sub = await settle($.prompt.submit({ text: cmd.prompt, asUser: true }))
    await log($, 'prompt.submit', { seq: cmd.seq, head: String(cmd.prompt).slice(0, 80), ...sub })
  } finally { busy = false }
}

export const register: Register = on => {
  on('session.start', async ($: any, e: any, next: any) => {
    logPath = (await $.env.get('LEITF_LOG')) ?? logPath
    cmdPath = (await $.env.get('LEITF_CMD')) ?? ''
    dump = (await $.env.get('LEITF_DUMP')) ?? undefined
    if (lines.length === 0) { const old = await $.fs.read(logPath).catch(() => ''); if (old !== '') lines.push(...old.split('\n').filter((x: string) => x !== '')) }
    await log($, 'session.start', { e, version: await $.session.version(), ...(await where($)) })
    await log($, 'tool.register', await settle($.tool.register({
      name: 'ping',
      description: 'Spike tool. Call it when asked to "ping"; it answers with a fixed word.',
      inputSchema: { type: 'object', properties: {} },
    })))
    $.clock.every(1000, () => { void poll($) })
    return next(e)
  })

  on('tool.describe', { tool: 'mcp__leitf__ping' }, async ($: any, e: any, next: any) => ({ ...(await next(e)), isDeferred: false }))

  on('tool.call', { tool: 'mcp__leitf__ping' }, async ($: any) => {
    await log($, 'tool.call ping', await where($))
    return { result: 'PONG-FOXTROT' }
  })

  on('prompt.submit', async ($: any, e: any, next: any) => {
    turnRunning = true
    await log($, 'prompt.submit seen', { origin: e.origin, head: e.text.slice(0, 80), ...(await where($)) })
    return next(e)
  })

  on('turn.step', async function* ($: any, e: any, next: any) {
    const r = yield* next(e)
    if (e.agentId === undefined) steps.push({ index: e.index, usage: r?.usage ?? null })
    return r
  })

  on('session.end', async ($: any, e: any, next: any) => { await log($, 'session.end', e); return next(e) })

  on('turn.complete', async ($: any, e: any, next: any) => {
    const r = await next(e)
    if (e.agentId !== undefined) return r
    turns += 1
    const api = await $.session.messages({ as: 'api' }).catch(() => [])
    const live = JSON.stringify(api)
    const has = { env: live.includes('# Environment'), skills: live.includes('skills are available for use'), agentTypes: live.includes('Available agent types'), deferredTools: live.includes('deferred tools are now available'), mcpInstructions: live.includes('# MCP Server Instructions') }
    await log($, 'turn.complete', { turns, reason: e.reason, isAborted: e.isAborted, answer: e.answer.slice(0, 500), has, steps, ...(await where($)), liveChars: live.length })
    if (dump !== undefined) await $.fs.write(`${dump}/dump-turn-${String(turns).padStart(3, '0')}.json`, JSON.stringify(api, null, 1)).catch(() => undefined)
    steps = []
    turnRunning = false
    return r
  })
}
