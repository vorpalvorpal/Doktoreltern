#!/usr/bin/env node
// Spike F1 helper: cut a fork of a Claude Code session at an earlier message. No model turn is run.
//   helper.mjs list <sessionId> <dir>                         rows: index, type, uuid, head of text
//   helper.mjs cut  <sessionId> <dir> <marker>                 uuid of the last message of the turn whose user prompt contains <marker>
//   helper.mjs fork <sessionId> <dir> <uuid> [title]           forkSession(sessionId, {dir, upToMessageId: uuid, title}); prints the new id
//   helper.mjs go   <sessionId> <dir> <marker> <cmdfile> <seq> <prompt> [title]
//                   cut + fork, then write {seq, forkId, prompt} to <cmdfile> for the mod; prints JSON
import { forkSession, getSessionMessages } from '@anthropic-ai/claude-agent-sdk'
import { writeFileSync } from 'node:fs'

const text = m => {
  const c = m.message?.content
  if (typeof c === 'string') return c
  if (!Array.isArray(c)) return ''
  return c.map(b => b.type === 'text' ? b.text : `<${b.type}${b.name ? ' ' + b.name : ''}>`).join(' ')
}
// a "prompt" is a user row that carries typed text, not a tool result
const isPrompt = m => m.type === 'user' && (typeof m.message?.content === 'string' || (Array.isArray(m.message?.content) && m.message.content.some(b => b.type === 'text') && !m.message.content.some(b => b.type === 'tool_result')))

const cutAt = (msgs, marker) => {
  const start = msgs.findIndex(m => isPrompt(m) && text(m).includes(marker))
  if (start < 0) throw new Error(`no user prompt contains ${marker}`)
  let end = msgs.length - 1
  for (let i = start + 1; i < msgs.length; i++) if (isPrompt(msgs[i])) { end = i - 1; break }
  if (msgs[end].type !== 'assistant') throw new Error(`turn of ${marker} does not end on an assistant row (index ${end}, ${msgs[end].type})`)
  return { index: end, uuid: msgs[end].uuid, of: msgs.length }
}

const [op, sessionId, dir, ...rest] = process.argv.slice(2)
const msgs = await getSessionMessages(sessionId, { dir })
if (op === 'list') {
  msgs.forEach((m, i) => console.log(i, m.type.padEnd(9), m.uuid, JSON.stringify(text(m).slice(0, 70))))
} else if (op === 'cut') {
  console.log(JSON.stringify(cutAt(msgs, rest[0])))
} else if (op === 'fork') {
  const t0 = Date.now()
  const r = await forkSession(sessionId, { dir, upToMessageId: rest[0], title: rest[1] })
  console.log(JSON.stringify({ ...r, ms: Date.now() - t0 }))
} else if (op === 'go') {
  const [marker, cmdfile, seq, prompt, title] = rest
  const cut = cutAt(msgs, marker)
  const t0 = Date.now()
  const r = await forkSession(sessionId, { dir, upToMessageId: cut.uuid, title })
  writeFileSync(cmdfile, JSON.stringify({ seq: Number(seq), forkId: r.sessionId, prompt }))
  console.log(JSON.stringify({ source: sessionId, cut, forkId: r.sessionId, forkMs: Date.now() - t0 }))
} else throw new Error('op?')
