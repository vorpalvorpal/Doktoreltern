#!/usr/bin/env python3
"""summary.py <run>...: per-run soak figures from the mod log (and routec.jsonl when present)."""
import json, os, sys, statistics as st
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRICE = dict(i=1.0, o=5.0, cw=1.25, cr=0.10)  # haiku 4.5, USD per million tokens
def cost(u): return (u.get('input_tokens', 0) * PRICE['i'] + u.get('output_tokens', 0) * PRICE['o'] + u.get('cache_creation_input_tokens', 0) * PRICE['cw'] + u.get('cache_read_input_tokens', 0) * PRICE['cr']) / 1e6
for name in sys.argv[1:]:
    rows = [json.loads(l) for l in open(f'{ROOT}/runs/{name}/mod.jsonl')]
    turns = [r['data'] for r in rows if r['what'] == 'turn.complete' and r['data'].get('resets', 0) > 0]
    ends = [r['data'] for r in rows if r['what'] == 'reset.end']
    ms = [e['ms'] for e in ends if 'ms' in e]
    hyd = [r['data'].get('hydrateMs') for r in rows if r['what'] == 'reset.begin']
    hook = [r['data'].get('ms') for r in rows if r['what'] == 'hook session.compact answered']
    first = [t['steps'][0]['usage'] for t in turns if t.get('steps') and t['steps'][0].get('usage')]
    tok = [t['ctx'].get('tokens') for t in turns if t['ctx'].get('tokens')]
    stale = sum(1 for t in turns if t.get('staleNoncesInLiveWindow'))
    said = sum(1 for t in turns if 'PREV-NONCE: NONE' not in t.get('answer', '') and 'PREV-NONCE' in t.get('answer', ''))
    total = sum(cost(t['usage']) for t in turns if t.get('usage'))
    print(f"{name}: resets={len(ends)} post-reset turns={len(turns)}")
    if ms: print(f"  reset ms: median {st.median(ms):.0f} max {max(ms)};  hydrate ms max {max(h for h in hyd if h is not None)};  compact hook ms max {max(hook) if hook else 'n/a'}")
    if tok: print(f"  context tokens after the turn: first {tok[0]} last {tok[-1]} min {min(tok)} max {max(tok)}")
    if first: print(f"  first request after reset: cache read median {st.median(u['cache_read_input_tokens'] for u in first):.0f}, cache creation median {st.median(u['cache_creation_input_tokens'] for u in first):.0f}")
    print(f"  turns with a stale nonce in the live window: {stale};  turns where the model reported a previous nonce: {said}")
    print(f"  faults: {sum(1 for r in rows if r['what'] == 'reset.FAULT')};  turns without step_done (nudged): {sum(1 for r in rows if r['what'].startswith('no step_done'))}")
    print(f"  cost of the post-reset turns at haiku prices: ${total:.3f} (${total / max(len(turns), 1):.4f} per step)")
    dur = [t['durationMs'] for t in turns]
    if dur: print(f"  turn duration ms: median {st.median(dur):.0f} max {max(dur)} (long ones are usage-throttle parks)")
    p = f'{ROOT}/runs/{name}/routec.jsonl'
    if os.path.exists(p):
        rc = [json.loads(l) for l in open(p)]
        rw = [r['ms'] for r in rc if r['what'] == 'rewound']; steps = [r for r in rc if r['what'] == 'step']
        f = [s['steps'][0]['usage'] for s in steps if s.get('steps')]
        print(f"  wrapper: steps={len(steps)} rewinds={len(rw)} rewind ms median {st.median(rw) if rw else 0:.0f} max {max(rw) if rw else 0}; unexpected screens {sum(1 for r in rc if r['what'].startswith('UNEXPECTED'))}")
        if f: print(f"  wrapper first request: cache read median {st.median(u['cache_read_input_tokens'] for u in f):.0f}, creation median {st.median(u['cache_creation_input_tokens'] for u in f):.0f}; tokens {[s['tokens'] for s in steps]}; stale {[bool(s['stale']) for s in steps]}; api messages {[s['apiMessages'] for s in steps]}")
        print(f"  wrapper cost: ${sum(cost(s['usage']) for s in steps if s.get('usage')):.3f}")
