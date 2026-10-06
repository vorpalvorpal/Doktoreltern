import type { Register } from 'claude-code'

// Spike S0-a mod ("leit"): in-place context reset in an INTERACTIVE session.
//
// The model calls the tool mcp__leit__step_done; at the end of that turn the mod throws the conversation away,
// rebuilds it from checkpoints/*.md (plus every message the user typed since the last reset) and submits "continue".
//
// Environment (all optional):
//   LEIT_LOG        path of the JSONL log of what the mod observed            (default leit.log.jsonl)
//   LEIT_ROUTE      compact | sessioncompact | clear                           (default compact)
//                     compact         $.command.run({command:'compact'}) + session.compact hook answering {messages}
//                     sessioncompact  $.session.compact() + the same hook
//                     clear           $.command.run({command:'clear'}) then the hydrated text is submitted
//                     branch          a frozen base session holds the stable checkpoint files; each step is
//                                     $.command.run resume <base>, then branch, then the unit text is submitted
//                     none            the mod resets nothing; it only records step_done (for the /rewind wrapper)
//   LEIT_CLEARVIA   text | append | context   how route clear hands the hydrated text over (default text)
//   LEIT_MAX        stop auto-continuing after this many resets               (default 1000)
//   LEIT_HOLD       0 switches the hold rule off                              (default on)
//   LEIT_PIN        0 leaves the tool deferred (behind ToolSearch)            (default pinned in front)
//   LEIT_CARRY      1 copies the engine's first-message reminders forward     (default off)
//   LEIT_SLOW_MS    sleep this long inside the session.compact hook           (fault test)
//   LEIT_SLOW_AT    only on this reset number (0 = every reset)
//   LEIT_CATCH      1 registers a .catch handler on the compact hook that answers from memory
//   LEIT_ON_FAULT   stop | clear    what to do when the rebuild check fails   (default stop)
//   LEIT_LETAGENTS  1 resets even while a sub-agent runs                      (fault test)
//   LEIT_IDLE_AT    after this reset, wait LEIT_IDLE_MS before submitting "continue" (idle test)
//   LEIT_DUMP       directory: write the Messages-API form of the conversation there at each main turn end
//   LEIT_NONCES     file of step nonces (one per line); the mod scans the live window for stale ones
//   LEIT_BAND       1 also draws the status as a band above the prompt

type Cfg = {
  log: string; route: string; clearVia: string; max: number; hold: boolean; pin: boolean; carry: boolean
  slowMs: number; slowAt: number; useCatch: boolean; onFault: string; letAgents: boolean
  idleAt: number; idleMs: number; dump?: string; nonces?: string; band: boolean
}

const TOOL = 'mcp__leit__step_done'
const lines: string[] = []
let cfg: Cfg = { log: 'leit.log.jsonl', route: 'compact', clearVia: 'text', max: 1000, hold: true, pin: true, carry: false, slowMs: 0, slowAt: 0, useCatch: false, onFault: 'stop', letAgents: false, idleAt: -1, idleMs: 0, band: false }
let resets = 0
let turns = 0
let pending: string | undefined // a reset the model asked for (the level)
let hold: string | undefined // why the loop is held; undefined = running
let kept: { at: number; text: string }[] = [] // user-typed messages since the last reset
let busy = false
let turnRunning = false
let fault: string | undefined
let statusText = ''
let carried: string[] | undefined
let deferredFor: string[] = []
let ownSubmits = 0
let nudges = 0 // consecutive mod-started turns that ended without step_done
let lastTurnMine = false
let lastSubmitMine = false
// route branch: a frozen base session holding the stable checkpoint files; every step is a branch of it
let base: { id: string; key: string; count: number } | undefined
let building: { level: string; n: number } | undefined
let steps: { index: number; usage: any }[] = []
// what the session.compact hook needs; filled BEFORE the compaction is asked for, so the hook does no I/O
let prepared: { n: number; text: string; mark: string } | undefined
let armed = false // true only while OUR compaction is in flight; a /compact the user types is left to the engine
let hookSeen: { n: number; started?: number; finished?: number; remainingMs?: number; caught?: string } | undefined

const log = async ($: any, what: string, data: unknown = {}) => {
  lines.push(JSON.stringify({ t: await $.clock.now(), what, data }))
  await $.fs.write(cfg.log, lines.join('\n') + '\n').catch(() => undefined)
}

const settle = (p: Promise<unknown>) => p.then((r: unknown) => ({ ok: r ?? null }), (err: Error) => ({ rejected: String(err) }))

const usage = async ($: any) => {
  const u = await $.session.usage().catch((err: Error) => ({ error: String(err) }))
  return { tokens: u.context?.tokens ?? u.context?.usedTokens, percent: u.context?.percent, context: u.context, cost: u.cost?.usd, error: u.error }
}

const running = async ($: any) => {
  const list = await $.agent.list().catch(() => [])
  return list.filter((a: any) => a.status === 'running' || a.status === 'pending' || a.status === 'waiting')
}

const drawStatus = async ($: any) => {
  const st = await $.fs.read('state.json').then((s: string) => JSON.parse(s), () => ({}))
  const u = await usage($)
  const parts = [
    `LEIT ${st.package ?? '?'}`, `unit ${st.unit ?? '?'}`, `step ${st.step ?? '?'}`,
    `ctx ${u.percent ?? '?'}%`, `resets ${resets}`,
    fault !== undefined ? `FAULT: ${fault}` : hold !== undefined ? `HOLD (${hold}) - /go to resume` : pending !== undefined ? 'reset pending' : 'running',
  ]
  if (deferredFor.length > 0) parts.push(`waiting for ${deferredFor.length} sub-agent(s)`)
  if (kept.length > 0) parts.push(`${kept.length} msg kept`)
  const text = parts.join(' | ')
  if (text !== statusText) { statusText = text; $.ui.status(text); if (cfg.band) $.ui.invalidate('ui.render') }
}

const setHold = async ($: any, why: string) => {
  if (!cfg.hold) return
  if (hold === undefined) await log($, 'hold.set', { why })
  hold = why
  await drawStatus($)
}

// The hydrated text: every checkpoint file, the user's kept messages, a per-reset mark, and what to do next.
// All file work happens here, before the compaction is asked for.
// `stable` is every checkpoint file but unit.md (route branch keeps it in a frozen base session); `changing` is the rest.
const hydrate = async ($: any, n: number, level: string) => {
  const started = await $.clock.now()
  const names = (await $.fs.list('checkpoints')).map((e: any) => e.name ?? e).filter((x: string) => x.endsWith('.md')).sort()
  const block = async (name: string) => `<checkpoint file="checkpoints/${name}">\n${await $.fs.read(`checkpoints/${name}`)}\n</checkpoint>`
  const stableParts: string[] = []
  const changingParts: string[] = []
  for (const name of names) (name === 'unit.md' ? changingParts : stableParts).push(await block(name))
  const mark = `REBUILD-MARK-${n}-${Math.random().toString(36).slice(2, 10)}`
  const said = kept.length === 0 ? '' : `\n\n<user-messages-since-last-reset>\nThe owner typed these while the last step ran. They are not yet filed anywhere else. Act on them, and then carry on with the procedure.\n${kept.map((k, i) => `${i + 1}. ${k.text}`).join('\n')}\n</user-messages-since-last-reset>`
  const envBlock = `<environment>\nWorking directory (every Bash command starts here; do not cd): ${await $.session.cwd()}\n</environment>`
  const stable = `${envBlock}\n\n${stableParts.join('\n\n')}`
  const changing = `${changingParts.join('\n\n')}${said}\n\n<harness reset="${n}" level="${level}" mark="${mark}">\nYour earlier conversation was deliberately discarded. The checkpoint files above are the whole state.\nThe tool ${TOOL} is available to you directly (no ToolSearch needed).\n</harness>`
  let text = `${stable}\n\n${changing}`
  if (cfg.carry && carried !== undefined) text = `${carried.join('\n')}\n${text}`
  let hash = 0
  for (let i = 0; i < stable.length; i++) hash = (hash * 31 + stable.charCodeAt(i)) | 0
  return { text, stable, changing, key: `${stable.length}:${hash}`, mark, ms: (await $.clock.now()) - started, chars: text.length, files: names.length }
}

const compactAnswer = () => ({ messages: [{ role: 'user', text: prepared?.text ?? '(nothing prepared)', toolUses: [] }] })

const submitContinue = async ($: any, text: string) => {
  ownSubmits += 1
  const sub = await settle($.prompt.submit({ text, asUser: true }))
  await log($, 'own prompt.submit', { chars: text.length, head: text.slice(0, 80), ...sub })
}

const doReset = async ($: any, why: string) => {
  if (busy || pending === undefined) return
  busy = true
  const level = pending
  try {
    // guard: no reset while a sub-agent runs
    const agents = await running($)
    if (agents.length > 0 && !cfg.letAgents) {
      const ids = agents.map((a: any) => `${a.type}:${a.id}:${a.status}`)
      if (deferredFor.join() !== ids.join()) await log($, 'reset.deferred', { why: 'sub-agent running', agents: ids })
      deferredFor = ids
      await drawStatus($)
      $.clock.after(2000, () => { void (async () => { if (!turnRunning && hold === undefined) await doReset($, 'agents done') })() })
      return
    }
    if (deferredFor.length > 0) { await log($, 'reset.undeferred', { was: deferredFor }); deferredFor = [] }
    const n = resets + 1
    const t0 = await $.clock.now()
    if (cfg.carry && carried === undefined) {
      const first = (await $.session.messages({ as: 'api' }))[0]?.content
      carried = (Array.isArray(first) ? first : []).map((b: any) => b.text ?? '').filter((t: string) => t.startsWith('<system-reminder>') && !/userEmail|Today's date|Attribution for git|total_tokens/.test(t))
    }
    const h = await hydrate($, n, level)
    prepared = { n, text: h.text, mark: h.mark }
    hookSeen = undefined
    const before = await usage($)
    const idBefore = await $.session.id()
    await log($, 'reset.begin', { n, why, level, route: cfg.route, hydrateMs: h.ms, chars: h.chars, files: h.files, mark: h.mark, before: { tokens: before.tokens, percent: before.percent, cost: before.cost }, sessionId: idBefore, keptMessages: kept.length, agentsRunning: agents.length })

    let next = 'continue'
    if (cfg.route === 'branch') {
      if (base === undefined || base.key !== h.key) {
        // (Re)build the frozen base: a cleared conversation holding only the stable files. Its turn end branches (below).
        await log($, 'base.build', { why: base === undefined ? 'no base yet' : 'stable checkpoint files changed', key: h.key, chars: h.stable.length })
        await log($, 'command.run clear', await settle($.command.run({ command: 'clear' })))
        building = { level, n }
        resets = n; pending = undefined
        await submitContinue($, `${h.stable}\n\n<harness>This is the stable part of the build state. The unit state follows in the next message. Reply with just: ok</harness>`)
        return
      }
      await log($, 'command.run resume', await settle($.command.run({ command: 'resume', args: base.id })))
      const backId = await $.session.id()
      const backCount = (await $.session.messages({ as: 'api' })).length
      await log($, 'command.run branch', await settle($.command.run({ command: 'branch', args: `step-${n}` })))
      const newId = await $.session.id()
      const live = JSON.stringify(await $.session.messages({ as: 'api' }))
      const checks = { resumedBase: backId === base.id, baseCount: base.count, countAfterResume: backCount, branchedAway: newId !== base.id, liveChars: live.length }
      const bad = !checks.resumedBase ? 'resume did not land on the base session' : backCount !== base.count ? 'the base session is not the size it was frozen at' : !checks.branchedAway ? 'branch did not leave the base session' : undefined
      await log($, bad === undefined ? 'reset.verified' : 'reset.FAULT', { n, ...checks, bad })
      if (bad !== undefined) { fault = bad; hold = 'fault'; $.ui.toast(`leit: RESET FAULT at reset ${n}: ${bad}. The loop is stopped.`); await drawStatus($); return }
      next = `${h.changing}\n\ncontinue`
    } else if (cfg.route === 'clear') {
      await log($, 'command.run clear', await settle($.command.run({ command: 'clear' })))
      if (cfg.clearVia === 'append') await log($, 'session.append', await settle($.session.append({ message: { type: 'user', content: [{ type: 'text', text: h.text }] } })))
      else if (cfg.clearVia === 'text') next = `${h.text}\n\ncontinue`
      // 'context': the prompt.submit hook attaches prepared.text to our own "continue"
    } else {
      armed = true
      const ask = cfg.route === 'sessioncompact'
        ? $.session.compact({ instructions: `leit reset ${n}` }).then((r: any) => ({ skip: r?.skip, n: r?.messages?.length, tokensBefore: r?.tokensBefore, tokensAfter: r?.tokensAfter, usage: r?.usage }))
        : $.command.run({ command: 'compact', args: `leit reset ${n}` })
      await log($, cfg.route === 'sessioncompact' ? '$.session.compact' : 'command.run compact', await settle(ask))
      armed = false
      // The rebuild check. command.run resolves before the compaction is installed, so poll the live window.
      let live = ''
      let waited = 0
      for (;;) {
        live = JSON.stringify(await $.session.messages({ as: 'api' }))
        if (live.includes(h.mark) || waited >= 5000) break
        await $.clock.sleep(100); waited += 100
      }
      const after = await usage($)
      const hookMs = hookSeen?.started !== undefined && hookSeen?.finished !== undefined ? hookSeen.finished - hookSeen.started : undefined
      const checks = {
        hookRan: hookSeen?.n === n && hookSeen?.finished !== undefined,
        hookMs,
        hookInBudget: hookMs !== undefined && hookMs < 9000,
        caught: hookSeen?.caught,
        markInLiveWindow: live.includes(h.mark),
        liveChars: live.length,
        liveCloseToHydrated: live.length < h.chars * 1.3 + 30000,
        costDelta: typeof after.cost === 'number' && typeof before.cost === 'number' ? after.cost - before.cost : null,
        waitedMs: waited,
      }
      const bad = !checks.markInLiveWindow ? 'rebuild mark missing from the live window (the engine summarised instead)'
        : !checks.liveCloseToHydrated ? 'live window larger than the hydrated text'
        : undefined
      await log($, bad === undefined ? 'reset.verified' : 'reset.FAULT', { n, ...checks, bad })
      if (bad !== undefined) {
        if (cfg.onFault === 'clear') {
          await log($, 'fault.fallback clear', await settle($.command.run({ command: 'clear' })))
          next = `${h.text}\n\ncontinue`
        } else {
          fault = bad
          hold = 'fault'
          $.ui.toast(`leit: RESET FAULT at reset ${n}: ${bad}. The loop is stopped.`)
          await drawStatus($)
          return
        }
      }
    }
    resets = n
    pending = undefined
    kept = []
    const end = await $.clock.now()
    await log($, 'reset.end', { n, ms: end - t0, sessionId: await $.session.id(), after: await usage($) })
    await drawStatus($)
    if (resets >= cfg.max) { await log($, 'max resets reached; not continuing'); return }
    if (n === cfg.idleAt) {
      await log($, 'idle.begin', { ms: cfg.idleMs })
      $.clock.after(cfg.idleMs, () => { void (async () => { await log($, 'idle.end'); if (hold === undefined) await submitContinue($, next) })() })
      return
    }
    await submitContinue($, next)
  } catch (err) {
    await log($, 'reset.error', String(err))
  } finally {
    busy = false
  }
}

const compactHook = async ($: any, e: any, next: any) => {
  const started = await $.clock.now()
  const n = prepared?.n ?? -1
  hookSeen = { n, started, remainingMs: next.budget?.remainingMs }
  if (e.agentId !== undefined || !armed || prepared === undefined || e.trigger === 'auto' || e.trigger === 'precompute') {
    // not ours: a sub-agent's own compaction, or the engine's automatic one. Let the engine do it, and say so.
    await log($, 'hook session.compact passed through', { trigger: e.trigger, agentId: e.agentId })
    return next(e)
  }
  if (cfg.slowMs > 0 && (cfg.slowAt === 0 || cfg.slowAt === n)) await $.clock.sleep(cfg.slowMs)
  hookSeen = { ...hookSeen, finished: await $.clock.now() }
  void log($, 'hook session.compact answered', { n, trigger: e.trigger, instructions: e.instructions, inMessages: e.messages.length, ms: hookSeen.finished! - started, budget: next.budget })
  return compactAnswer()
}

const compactCatch = async ($: any, e: any, next: any) => {
  // Reached when the hook above threw or overran its 10 s budget. Answer from memory (1 s grace) so the engine's
  // summariser never runs over the old conversation. Only when LEIT_CATCH=1, so the unguarded fault can be shown too.
  const err = next.error
  if (!cfg.useCatch) { void log($, 'hook session.compact FAILED, no catch answer (engine summariser runs)', { err }); return next(e) }
  hookSeen = { ...(hookSeen ?? { n: prepared?.n ?? -1 }), caught: err?.kind ?? 'unknown', finished: await $.clock.now() }
  void log($, 'hook session.compact CAUGHT, answered from memory', { err })
  return compactAnswer()
}

export const register: Register = on => {
  on('session.start', async ($: any, e: any, next: any) => {
    cfg = {
      log: (await $.env.get('LEIT_LOG')) ?? cfg.log,
      route: (await $.env.get('LEIT_ROUTE')) ?? 'compact',
      clearVia: (await $.env.get('LEIT_CLEARVIA')) ?? 'text',
      max: Number((await $.env.get('LEIT_MAX')) ?? '1000'),
      hold: (await $.env.get('LEIT_HOLD')) !== '0',
      pin: (await $.env.get('LEIT_PIN')) !== '0',
      carry: (await $.env.get('LEIT_CARRY')) === '1',
      slowMs: Number((await $.env.get('LEIT_SLOW_MS')) ?? '0'),
      slowAt: Number((await $.env.get('LEIT_SLOW_AT')) ?? '0'),
      useCatch: (await $.env.get('LEIT_CATCH')) === '1',
      onFault: (await $.env.get('LEIT_ON_FAULT')) ?? 'stop',
      letAgents: (await $.env.get('LEIT_LETAGENTS')) === '1',
      idleAt: Number((await $.env.get('LEIT_IDLE_AT')) ?? '-1'),
      idleMs: Number((await $.env.get('LEIT_IDLE_MS')) ?? '0'),
      dump: (await $.env.get('LEIT_DUMP')) ?? undefined,
      nonces: (await $.env.get('LEIT_NONCES')) ?? undefined,
      band: (await $.env.get('LEIT_BAND')) === '1',
    }
    if (lines.length === 0) { const old = await $.fs.read(cfg.log).catch(() => ''); if (old !== '') lines.push(...old.split('\n').filter((x: string) => x !== ''), JSON.stringify({ t: await $.clock.now(), what: 'MODULE RELOADED (module variables were lost: hold, pending, kept, resets)', data: {} })) }
    await log($, 'session.start', { cfg, e, version: await $.session.version(), sessionId: await $.session.id(), surface: await $.session.surface().catch(() => 'n/a') })
    await log($, 'tool.register', await settle($.tool.register({
      name: 'step_done',
      description: 'Call this when the current step is done and its state is written to the checkpoint files. The harness then discards your conversation, rebuilds it from the checkpoint files and tells you to continue. End your turn right after calling it.',
      inputSchema: { type: 'object', properties: { level: { type: 'string', enum: ['unit', 'package'] } }, required: ['level'] },
    })))
    await log($, 'command.register go', await settle($.command.register({ name: 'go', description: 'leit: release the hold and let the build loop continue' })))
    await log($, 'command.register hold', await settle($.command.register({ name: 'hold', description: 'leit: hold the build loop at the end of this turn (no auto-continue until /go)', immediate: true })))
    await log($, 'command.register x', await settle($.command.register({ name: 'x', description: 'leit spike: run a host command from the mod: /x <command> [args]', argumentHint: '<command> [args]' })))
    await log($, 'command.list (selected)', (await $.command.list()).filter((c: any) => /^(rewind|checkpoint|branch|fork|resume|clear|compact|go|hold|x)$/.test(c.name)))
    $.clock.every(2000, () => { void drawStatus($) })
    await drawStatus($)
    return next(e)
  })

  on('tool.describe', { tool: TOOL }, async ($: any, e: any, next: any) => {
    const r = await next(e)
    await log($, 'tool.describe', { isDeferred: r.isDeferred, pin: cfg.pin })
    return cfg.pin ? { ...r, isDeferred: false } : r
  })

  on('tool.call', { tool: TOOL }, async ($: any, e: any) => {
    pending = String(e.level ?? 'unit')
    await log($, 'tool.call step_done', { level: pending })
    await drawStatus($)
    return { result: `Step recorded (${pending}). End your turn now with the one word: waiting` }
  })

  on('command.run', { command: 'go' }, async ($: any, e: any) => {
    const was = hold
    await log($, 'command /go', { origin: e.origin, hold: was, pending, fault })
    if (fault !== undefined) return { text: `leit: cannot go, the loop stopped on a fault: ${fault}` }
    hold = undefined
    await drawStatus($)
    // leave this command's own dispatch before touching the conversation
    $.clock.after(100, () => { void (async () => { if (pending !== undefined) await doReset($, '/go'); else await submitContinue($, 'continue') })() })
    return { text: `leit: hold released (was: ${was ?? 'not held'}); ${pending !== undefined ? 'resetting, then continuing' : 'continuing'}.` }
  })

  on('command.run', { command: 'x' }, async ($: any, e: any) => {
    const [command, ...rest] = e.args.trim().split(' ')
    const args = rest.join(' ')
    $.clock.after(150, () => { void (async () => {
      const before = { sessionId: await $.session.id(), n: (await $.session.messages({ as: 'api' })).length }
      const r = await settle($.command.run({ command, args }))
      await $.clock.sleep(500)
      const after = { sessionId: await $.session.id(), n: (await $.session.messages({ as: 'api' })).length }
      await log($, 'x command.run', { command, args, r, before, after })
      $.ui.toast(`leit /x ${command}: ${JSON.stringify(r).slice(0, 200)}`)
    })() })
    return { text: `leit: running $.command.run({ command: '${command}', args: '${args}' })` }
  })

  on('command.run', { command: 'hold' }, async ($: any, e: any) => {
    await log($, 'command /hold', { origin: e.origin, turnRunning })
    await setHold($, '/hold')
    return { text: 'leit: held. The loop will not continue by itself until you type /go.' }
  })

  on('prompt.submit', async ($: any, e: any, next: any) => {
    const mine = e.origin?.kind === 'plugin'
    if (e.turnId === undefined) lastSubmitMine = mine
    await log($, 'prompt.submit seen', { origin: e.origin, turnId: e.turnId, wait: e.wait, turnRunning, chars: e.text.length, head: e.text.slice(0, 120) })
    if (e.origin?.kind === 'composer' || e.origin?.kind === 'bridge') {
      kept.push({ at: await $.clock.now(), text: e.text })
      await setHold($, 'you typed')
    }
    if (mine && cfg.route === 'clear' && cfg.clearVia === 'context' && prepared !== undefined) {
      const text = prepared.text
      const half = Math.ceil(text.length / 2)
      const blocks = text.length > 90000 ? [text.slice(0, half), text.slice(half)] : [text]
      return next({ ...e, context: [...(e.context ?? []), ...blocks] })
    }
    return next(e)
  })

  on('turn.start', async ($: any, e: any, next: any) => {
    turnRunning = true
    lastTurnMine = lastSubmitMine
    await log($, 'turn.start', { turnId: e.turnId, head: e.text.slice(0, 80) })
    return next(e)
  })

  on('turn.step', async function* ($: any, e: any, next: any) {
    const r = yield* next(e)
    if (e.agentId === undefined) steps.push({ index: e.index, usage: r?.usage ?? null })
    return r
  })

  on('session.compact', compactHook).catch(compactCatch)

  on('session.append', async ($: any, e: any, next: any) => {
    const body = JSON.stringify(e.message?.content ?? '')
    // Esc at a permission dialog ends the turn with reason 'answer' and isAborted false, so the interrupt row is the signal.
    const interrupted = e.agentId === undefined && e.message?.type === 'user' && body.includes('[Request interrupted by user')
    if (interrupted || e.door !== 'response' && e.door !== 'tool-result' && e.door !== 'attachment') await log($, 'session.append row', { door: e.door, origin: e.origin, agentId: e.agentId, type: e.message?.type, name: e.message?.name, isMeta: e.message?.isMeta, chars: body.length, text: body.slice(0, 160) })
    if (interrupted) await setHold($, 'you interrupted')
    return next(e)
  })

  on('session.end', async ($: any, e: any, next: any) => {
    await log($, 'session.end', e)
    return next(e)
  })

  on('turn.complete', async ($: any, e: any, next: any) => {
    const r = await next(e)
    if (e.agentId !== undefined) {
      await log($, 'turn.complete agent', { agentId: e.agentId, reason: e.reason, answer: e.answer.slice(0, 200) })
      return r
    }
    turns += 1
    turnRunning = false
    const api = await $.session.messages({ as: 'api' }).catch(() => [])
    const live = JSON.stringify(api)
    let stale: string[] = []
    if (cfg.nonces !== undefined) {
      // every nonce but the newest was planted in an earlier step's conversation; none may be in the live window
      const all = (await $.fs.read(cfg.nonces).catch(() => '')).split('\n').filter((x: string) => x !== '')
      stale = all.slice(0, -1).filter((x: string) => live.includes(x))
    }
    const has = { env: live.includes('# Environment'), skills: live.includes('skills are available for use'), agentTypes: live.includes('Available agent types'), deferredTools: live.includes('deferred tools are now available'), mcpInstructions: live.includes('# MCP Server Instructions') }
    await log($, 'turn.complete', {
      has, steps,
      turns, resets, reason: e.reason, isAborted: e.isAborted, durationMs: e.durationMs, answer: e.answer.slice(0, 600), usage: e.usage,
      ctx: await usage($), sessionId: await $.session.id(), agents: (await $.agent.list().catch(() => [])).map((a: any) => `${a.type}:${a.status}`),
      apiMessages: api.length, liveChars: live.length, staleNoncesInLiveWindow: stale, hold, pending,
    })
    if (cfg.dump !== undefined) await $.fs.write(`${cfg.dump}/dump-turn-${String(turns).padStart(3, '0')}.json`, JSON.stringify(api, null, 1)).catch(() => undefined)
    steps = []
    if (e.isAborted || e.reason === 'aborted') await setHold($, 'you interrupted')
    await drawStatus($)
    if (building !== undefined) {
      // the base-building turn just ended: freeze this session as the base and start the step in a branch of it
      const b = building
      building = undefined
      const h = await hydrate($, b.n, b.level)
      base = { id: await $.session.id(), key: h.key, count: api.length }
      await log($, 'base.frozen', base)
      await log($, 'command.run branch', await settle($.command.run({ command: 'branch', args: `step-${b.n}` })))
      kept = []
      await log($, 'reset.end', { n: b.n, sessionId: await $.session.id(), builtBase: true })
      if (hold === undefined) await submitContinue($, `${h.changing}\n\ncontinue`)
      return r
    }
    // a mod-started turn that ended without step_done and without the user stepping in: nudge twice, then stop
    if (pending === undefined && hold === undefined && lastTurnMine && resets > 0 && resets < cfg.max) {
      nudges += 1
      await log($, 'no step_done in a mod-started turn', { nudges })
      if (nudges <= 2) await submitContinue($, 'continue (the last turn ended without a step; follow the procedure: run the step, then call step_done)')
      else { fault = 'three turns without step_done'; hold = 'fault'; $.ui.toast('leit: the loop made no progress in three turns; stopped.'); await drawStatus($) }
      return r
    }
    if (pending !== undefined) nudges = 0
    if (cfg.route === 'none') { if (pending !== undefined) { await log($, 'reset.wanted (route none: left to the wrapper)', { pending }); pending = undefined } return r }
    if (pending !== undefined) {
      if (hold !== undefined) await log($, 'reset.held', { hold, pending })
      else await doReset($, 'step_done')
    }
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($: any, e: any, next: any) => {
    if (!cfg.band || statusText === '') return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return h(Box, null, h(Text, { dimColor: true }, statusText))
  })
}

declare const h: any
