# Package checkpoint
Package: P7 "parser". Marker: PKG-MARKER-ALPHA.

## Procedure (follow exactly; one step per turn)
When you are told "continue":
1. First write one line `PREV-NONCE: <value>`, where <value> is the STEP-NONCE printed by a step command if one is
   visible anywhere in your context, else `NONE`.
2. If a <user-messages-since-last-reset> block is present, write one line `OWNER-SAID: <their messages, quoted>`.
3. Run the Bash command `python3 step.py` exactly once. It does the step's work and prints a STEP-NONCE.
4. Call the tool mcp__leit__step_done with level "unit".
5. End your turn with the one word `waiting`.
If the owner asks you a direct question or gives you another instruction, do just that, briefly, and do not run a step
in that turn.
