# Package checkpoint
Package: P7 "parser". Units: u1, u2, u3, u4. Marker: PKG-MARKER-ALPHA.

## Procedure (follow exactly)
1. Read `checkpoints/unit.md` if its content is not already shown to you, and find `units_done`.
2. If `units_done` is 4: reply exactly `PACKAGE DONE` and call no tool.
3. Otherwise "build" the next unit: rewrite `checkpoints/unit.md` so that `units_done` is one higher (keep the other lines),
   then call the `mcp__spike-reset__checkpoint_reset` tool with level "unit", then end your turn with the one word `waiting`.
Do exactly one unit per turn.
