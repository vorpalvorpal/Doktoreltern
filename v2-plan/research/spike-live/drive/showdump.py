#!/usr/bin/env python3
"""showdump.py <dump.json> [width]: one line per content block of a dumped Messages-API conversation."""
import json, sys
w = int(sys.argv[2]) if len(sys.argv) > 2 else 220
for m in json.load(open(sys.argv[1])):
    c = m['content']
    if isinstance(c, str): print(' ', m['role'], 'str', len(c), repr(c[:w])); continue
    for b in c:
        t = b.get('text') or json.dumps(b)
        print(' ', m['role'], b.get('type'), len(t), repr(t[:w]))
