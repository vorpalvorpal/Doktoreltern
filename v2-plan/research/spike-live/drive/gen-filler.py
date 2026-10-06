#!/usr/bin/env python3
"""Writes fixtures/big: about 30k tokens of structured filler in checkpoint files (a spec and a plan that never change,
the procedure, and a small unit file that step.py rewrites each step)."""
import os, random, shutil
D = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
big, small = f'{D}/fixtures/big', f'{D}/fixtures/small'
shutil.rmtree(big, ignore_errors=True); shutil.copytree(small, big)
r = random.Random(7)
nouns = 'parser lexer token span arena cursor diagnostic recovery grammar rule node visitor table index buffer reader writer schema column batch pipeline stage sink source checkpoint ledger gate audit'.split()
verbs = 'must reject', 'must accept', 'must preserve', 'must report', 'must never allocate for', 'must round-trip', 'must order', 'must deduplicate', 'must bound', 'must log'
def sentence(): return f"The {r.choice(nouns)} {r.choice(verbs)} every {r.choice(nouns)} whose {r.choice(nouns)} {r.choice(['overlaps', 'precedes', 'follows', 'shadows', 'references'])} a {r.choice(nouns)} of the same {r.choice(nouns)}."
spec = ['# Specification (stable for the whole build)\n']
for sec in range(1, 41):
    spec.append(f'\n## {sec}. {r.choice(nouns).title()} {r.choice(nouns)}\n')
    for req in range(1, 9):
        spec.append(f"- **R{sec}.{req}** {sentence()} {sentence()}\n  - Example: `{r.choice(nouns)}_{r.choice(nouns)}({r.randint(1, 999)}) -> Result<{r.choice(nouns).title()}, {r.choice(nouns).title()}Error>`; boundary {r.randint(0, 65535)}.\n")
    spec.append('\n| case | input | expected |\n|---|---|---|\n' + ''.join(f"| {sec}.{c} | `{r.choice(nouns)}:{r.randint(0, 9999)}` | {r.choice(['ok', 'error E' + str(r.randint(100, 999)), 'empty', 'unchanged'])} |\n" for c in range(1, 6)))
open(f'{big}/checkpoints/a-spec.md', 'w').write(''.join(spec))
plan = ['# Plan for package P7 (stable for the package)\n']
for u in range(1, 13):
    plan.append(f'\n## Unit u{u}: {r.choice(nouns)} {r.choice(nouns)}\nFiles: `src/{r.choice(nouns)}/{r.choice(nouns)}.rs`, `tests/{r.choice(nouns)}_{u}.rs`\n')
    for st in range(1, 9): plan.append(f"{st}. {sentence()} Covers R{r.randint(1, 40)}.{r.randint(1, 8)}, R{r.randint(1, 40)}.{r.randint(1, 8)}.\n")
    plan.append('```rust\n' + ''.join(f"pub fn {r.choice(nouns)}_{r.choice(nouns)}(input: &{r.choice(nouns).title()}) -> Result<{r.choice(nouns).title()}, Error>;\n" for _ in range(6)) + '```\n')
open(f'{big}/checkpoints/b-plan.md', 'w').write(''.join(plan))
os.rename(f'{big}/checkpoints/package.md', f'{big}/checkpoints/c-package.md')
for f in sorted(os.listdir(f'{big}/checkpoints')): print(f, os.path.getsize(f'{big}/checkpoints/{f}'))
