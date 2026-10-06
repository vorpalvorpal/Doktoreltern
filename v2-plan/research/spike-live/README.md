# Spike S0-a: in-place context reset in a live terminal session

Report: `REPORT.md`. Run 2026-10-06 on Claude Code 2.1.291, model haiku.

**Demo (about ten minutes, in your own terminal):** `drive/demo.sh` (route compact; `drive/demo.sh branch` or
`drive/demo.sh clear` for the others). Type the first prompt it prints, then `/go` when that turn ends. While it loops:
type a message mid-step, press Esc mid-step, `/hold`, `/go`. The loop itself ran under the pty driver in this spike;
`demo.sh` launches the same mod with the same flags but has not been run by a person at a terminal.

- `mod/` — the mod (`hooks/register.ts`); behaviour chosen by `LEIT_*` variables listed at the top of the file.
  Do not save the file while a session uses it: it hot-reloads and loses its state.
- `drive/ptyd.py`, `drive/ctl.py` — a small tmux stand-in (tmux is not installed): hold `claude` under a pty, type, read
  the screen. `start.sh`, `kick.sh`, `soak.sh` build on them. Needs `.venv` (`python3 -m venv .venv && .venv/bin/pip install pyte`).
- `drive/routec.py` — the `/rewind` keystroke wrapper (Route C). `drive/summary.py` — soak figures from the logs.
- `fixtures/small`, `fixtures/big` (about 36k tokens of checkpoint text; `drive/gen-filler.py` rebuilds it).
- `runs/<name>/` — evidence per run: `mod.jsonl` (what the mod saw), `tty.raw`, `screen*.txt`, `dumps/` (the messages
  the model received), `routec.jsonl`.
