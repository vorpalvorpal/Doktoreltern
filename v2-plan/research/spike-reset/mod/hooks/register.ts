import type { Register } from 'claude-code'

// Spike mod. Behaviour is chosen by SPIKE_MODE (comma-separated flags):
//   compact      after the first main turn completes, call $.session.compact(), then submit SPIKE_NEXT
//   own          the session.compact hook answers with messages built from checkpoint files (no summariser)
//   tool         register checkpoint_reset; a call marks a reset pending; done after turn.complete
//   threshold    reset at turn.complete when usage().context.percent >= SPIKE_PCT
//   watch        poll checkpoints/unit.md mtime; reset when it changes and the session is idle
//   slash        reset by submitting the prompt `/compact ...` (the headless route) instead of $.session.compact
//   cmd          reset by $.command.run({command:'compact'})
//   slashclear   after the first main turn, submit the prompt `/clear`
//   clear        after the first main turn, $.command.run({command:'clear'}) then submit SPIKE_NEXT
//   inline       do the reset inside the turn.complete hook instead of from a timer after it
//   dump         log the Messages-API form of the conversation at every main turn.complete
//   carry        with own: copy the first message's engine reminders into the rebuilt message
//   hybrid       with own: call core over a stub transcript first, then answer with own messages
//   slow         with own: sleep 12 s inside the session.compact hook (past the 10 s hook budget)
//   append       after reset, $.session.append the checkpoint text instead of relying on the hook
// Everything observed is appended to SPIKE_LOG as JSON lines.

const lines: string[] = []
let logPath = 'spike.log'
let flags: string[] = []
let resets = 0
let maxResets = 3
let pending: string | undefined
let busy = false
let turns = 0
let lastMtime = 0
let turnRunning = false
let carried: string[] | undefined

const log = async ($: any, what: string, data: unknown = {}) => {
  lines.push(JSON.stringify({ t: await $.clock.now(), what, data }))
  await $.fs.write(logPath, lines.join('\n') + '\n').catch(() => undefined)
}

const usage = async ($: any) => {
  const u = await $.session.usage().catch((err: Error) => ({ error: String(err) }))
  return { context: u.context, cost: u.cost, error: u.error }
}

const checkpointText = async ($: any, level: string) => {
  const names = level === 'package' ? ['package.md'] : ['package.md', 'unit.md']
  const parts: string[] = []
  for (const name of names) {
    const body = await $.fs.read(`checkpoints/${name}`).catch(() => '(missing)')
    parts.push(`<checkpoint file="checkpoints/${name}">\n${body}\n</checkpoint>`)
  }
  return parts.join('\n\n')
}

const doReset = async ($: any, level: string, why: string) => {
  if (busy) return
  busy = true
  try {
    resets += 1
    await log($, 'reset.begin', { n: resets, level, why, before: await usage($), messagesBefore: (await $.session.messages()).length })
    const settle = (p: Promise<unknown>) => p.then((r: unknown) => ({ ok: r }), (err: Error) => ({ rejected: String(err) }))
    const instructions = `spike-reset level=${level}`
    if (flags.includes('clear')) await log($, 'command.run clear', await settle($.command.run({ command: 'clear' })))
    else if (flags.includes('slashclear')) await log($, 'prompt.submit /clear', await settle($.prompt.submit({ text: '/clear', asUser: true })))
    else if (flags.includes('cmd')) await log($, 'command.run compact', await settle($.command.run({ command: 'compact', args: instructions })))
    else if (flags.includes('slash')) await log($, 'prompt.submit /compact', await settle($.prompt.submit({ text: `/compact ${instructions}`, asUser: true })))
    else {
      const started = await $.clock.now()
      const ran = await $.session.compact({ instructions }).then(
        (r: any) => ({ skip: r.skip, n: r.messages?.length, tokensBefore: r.tokensBefore, tokensAfter: r.tokensAfter, usage: r.usage, texts: r.messages?.map((m: any) => `${m.role}:${m.text.slice(0, 160)}`) }),
        (err: Error) => ({ rejected: String(err) }),
      )
      await log($, 'session.compact returned', { ms: (await $.clock.now()) - started, ...ran })
    }
    if (flags.includes('append')) {
      const text = await checkpointText($, level)
      const ap = await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } }).then((r: unknown) => ({ ok: r }), (err: Error) => ({ rejected: String(err) }))
      await log($, 'session.append', ap)
    }
    const msgs = await $.session.messages()
    await log($, 'reset.end', { after: await usage($), messagesAfter: msgs.length, texts: msgs.map((m: any) => `${m.role}:${m.text.slice(0, 200)}`) })
    const text = (await $.env.get('SPIKE_NEXT')) ?? `Continue from the checkpoint (reset ${resets}).`
    const sub = await $.prompt.submit({ text, asUser: true }).then((r: unknown) => ({ ok: r }), (err: Error) => ({ rejected: String(err) }))
    await log($, 'prompt.submit', { text, ...sub })
  } catch (err) {
    await log($, 'reset.error', String(err))
  } finally {
    busy = false
  }
}

export const register: Register = on => {
  on('session.start', async ($: any, e: any, next: any) => {
    logPath = (await $.env.get('SPIKE_LOG')) ?? logPath
    flags = ((await $.env.get('SPIKE_MODE')) ?? '').split(',')
    maxResets = Number((await $.env.get('SPIKE_MAX')) ?? '3')
    await log($, 'session.start', { flags, version: await $.session.version(), usage: await usage($) })
    if (flags.includes('tool')) {
      const reg = await $.tool.register({
        name: 'checkpoint_reset',
        description: 'Call this when a unit or package is done and its checkpoint file is written. The harness then resets your context from the checkpoint files and tells you to continue. End your turn right after calling it.',
        inputSchema: { type: 'object', properties: { level: { type: 'string', enum: ['unit', 'package'] } }, required: ['level'] },
      })
      await log($, 'tool.register', reg)
    }
    if (flags.includes('watch')) {
      lastMtime = (await $.fs.stat('checkpoints/unit.md')).mtimeMs
      $.clock.every(500, () => {
        void (async () => {
          const m = (await $.fs.stat('checkpoints/unit.md')).mtimeMs
          if (m === lastMtime) return
          await log($, 'watch.changed', { turnRunning })
          if (turnRunning) return // retry on the next tick, once idle
          lastMtime = m
          if (resets < maxResets) await doReset($, 'unit', 'file change')
        })()
      })
    }
    return next(e)
  })

  on('tool.call', { tool: 'mcp__spike-reset__checkpoint_reset' }, async ($: any, e: any) => {
    pending = String(e.level ?? 'unit')
    await log($, 'tool.call checkpoint_reset', { level: pending })
    return { result: `Reset (${pending}) scheduled. End your turn now; you will be told to continue.` }
  })

  on('turn.start', async ($: any, e: any, next: any) => {
    if (e.agentId === undefined) turnRunning = true
    return next(e)
  })

  on('session.compact', async ($: any, e: any, next: any) => {
    await log($, 'hook session.compact in', { trigger: e.trigger, agentId: e.agentId, instructions: e.instructions, n: e.messages.length })
    if (!flags.includes('own')) {
      const r = await next(e)
      await log($, 'hook session.compact core', { n: r.messages?.length, skip: r.skip, tokensBefore: r.tokensBefore, tokensAfter: r.tokensAfter, usage: r.usage })
      return r
    }
    const level = /level=(\w+)/.exec(e.instructions ?? '')?.[1] ?? 'unit'
    let text = `${await checkpointText($, level)}\n\nYour earlier conversation was deliberately discarded. The checkpoint files above are the whole state. Continue from checkpoint level "${level}".`
    if (flags.includes('carry')) {
      // The engine's start-of-conversation reminders (environment, agent types, skills, deferred tools, MCP
      // instructions) are not put back after a hook-answered compaction, so carry them over by hand.
      // Captured once, before the first reset: afterwards the first message is the rebuilt one.
      if (carried === undefined) {
        const api = await $.session.messages({ as: 'api' })
        const first = api[0]?.content
        carried = (Array.isArray(first) ? first : []).map((b: any) => b.text ?? '').filter((t: string) => t.startsWith('<system-reminder>') && !/userEmail|Today's date|Attribution for git|total_tokens/.test(t))
      }
      await log($, 'carry', { n: carried.length, chars: carried.join('').length })
      text = `${carried.join('\n')}\n${text}`
    }
    if (flags.includes('hybrid')) {
      // Let core run over a one-line transcript (a real but tiny summariser call), then replace what it made.
      const r = await next({ ...e, messages: [{ role: 'user', text: 'Nothing to summarise.', toolUses: [] }] })
      await log($, 'hybrid core', { n: r.messages?.length, skip: r.skip, usage: r.usage })
    }
    if (flags.includes('slow')) await $.clock.sleep(12000)
    return { messages: [{ role: 'user', text, toolUses: [] }] }
  })

  on('session.append', async ($: any, e: any, next: any) => {
    if (e.door === 'compaction' || e.door === 'notice' || e.door === 'delivery') await log($, 'session.append row', { door: e.door, agentId: e.agentId, type: e.message?.type, subtype: e.message?.subtype, text: JSON.stringify(e.message?.content ?? '').slice(0, 300) })
    return next(e)
  })

  on('session.end', async ($: any, e: any, next: any) => {
    await log($, 'session.end', e)
    return next(e)
  })

  on('turn.complete', async ($: any, e: any, next: any) => {
    const r = await next(e)
    if (e.agentId !== undefined) {
      await log($, 'turn.complete agent', { agentId: e.agentId, answer: e.answer.slice(0, 120) })
      return r
    }
    turns += 1
    turnRunning = false
    await log($, 'turn.complete', { turns, answer: e.answer.slice(0, 300), usage: e.usage, ctx: await usage($), agents: await $.agent.list().catch(() => 'n/a') })
    if (flags.includes('dump')) {
      const api = await $.session.messages({ as: 'api' })
      await log($, 'dump api messages', api.map((m: any) => ({ role: m.role, content: typeof m.content === 'string' ? m.content.slice(0, 400) : m.content.map((b: any) => (b.text ?? b.type).slice(0, 400)) })))
    }
    let why: string | undefined
    let level = 'unit'
    if (pending !== undefined) { why = 'tool'; level = pending; pending = undefined }
    else if ((flags.includes('compact') || flags.includes('clear') || flags.includes('slashclear')) && turns === 1) why = 'first turn'
    else if (flags.includes('threshold')) {
      const pct = (await $.session.usage()).context.percent ?? 0
      const limit = Number((await $.env.get('SPIKE_PCT')) ?? '50')
      if (pct >= limit) why = `threshold ${pct}>=${limit}`
    }
    if (why !== undefined && resets < maxResets) {
      const reason = why
      // 'inline' does the reset inside the turn.complete hook itself (the only place a plain `claude -p` is still alive)
      if (flags.includes('inline')) await doReset($, level, reason)
      else $.clock.after(Number((await $.env.get('SPIKE_DELAY')) ?? '50'), () => { void doReset($, level, reason) })
    }
    return r
  })
}
