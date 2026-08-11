# Durable-Execution Engines & Agent-Graph Frameworks — Prior Art

**Date:** 2026-08-08
**STATUS: COMPLETE**
**Provenance:** External web research (GitHub API repo metadata, PyPI metadata, vendor docs sites) conducted by a research agent for the Doktoreltern orchestration-substrate decision. Sibling agents cover build tools (Make/just/doit/luigi/DVC/targets/Snakemake/Nextflow), issue-tracker/spec tooling (beads, Backlog.md, Task Master, Spec Kit, OpenSpec, Kiro), and the coding-agent harness landscape (Claude Code SDK, OpenHands, Aider, Goose, Codex, ACP/MCP/A2A). Those are **not** re-surveyed here.

**Question being answered:** Doktoreltern is an orchestration + deterministic-verification layer over AI coding agents. Executor = Claude Code driven headless (`claude -p`). Model = tree/DAG of hypothesis nodes carrying confidence + fidelity gauges; a scheduler picks the next node worth working on; a per-node inner loop (plan → execute → verify) stays pluggable; gates between nodes are as deterministic as possible. Today: ~3,400 lines of hand-rolled Python (git-backed node store, scheduler with `priority = centrality × (1 − confidence)`, move state machine with fault routing, headless dispatch shell with telemetry/run-state, MCP context server). **Solo developer.** What can be deleted in favour of existing components?

---

## 0. Verified metadata table (GitHub API + PyPI, fetched 2026-08-08)

| Project | Repo | Licence (SPDX) | Stars | Last push | Python pkg / version |
|---|---|---|---|---|---|
| DBOS Transact (Py) | `dbos-inc/dbos-transact-py` | **MIT** | 1,519 | 2026-08-06 | `dbos` **2.29.0** (2026-07-30) |
| DBOS Transact (TS) | `dbos-inc/dbos-transact-ts` | MIT | 1,310 | 2026-08-06 | — |
| Restate (server) | `restatedev/restate` | **BUSL-1.1** (see §1.2) | 4,263 | 2026-08-07 | — (Rust) |
| Restate Python SDK | `restatedev/sdk-python` | MIT | 78 | 2026-07-24 | `restate-sdk` **1.0.3** (2026-07-24) |
| Inngest (server) | `inngest/inngest` | NOASSERTION (see §1.3) | 5,701 | 2026-08-07 | — (Go) |
| Inngest Python SDK | `inngest/inngest-py` | Apache-2.0 | 212 | 2026-08-07 | `inngest` **0.5.19** (2026-06-23) |
| Temporal (server) | `temporalio/temporal` | MIT | 22,171 | 2026-08-07 | — (Go) |
| Temporal Python SDK | `temporalio/sdk-python` | MIT | 1,158 | 2026-08-08 | `temporalio` **1.31.0** (2026-07-29) |
| Hatchet | `hatchet-dev/hatchet` | **MIT** | 7,684 | 2026-08-07 | `hatchet-sdk` **1.37.1** (2026-08-03) |
| Windmill | `windmill-labs/windmill` | NOASSERTION (AGPL core + EE) | 17,473 | 2026-08-07 | — (Rust) |
| Prefect | `PrefectHQ/prefect` | Apache-2.0 | 23,572 | 2026-08-07 | `prefect` **3.8.2** (2026-08-07) |
| Dagster | `dagster-io/dagster` | Apache-2.0 | 15,944 | 2026-08-07 | — |
| LangGraph | `langchain-ai/langgraph` | MIT | 39,150 | 2026-08-07 | `langgraph` **1.2.10** (2026-07-28) |
| Burr | `DAGWorks-Inc/burr` → **redirects to `apache/burr`** | Apache-2.0 | 2,504 | 2026-08-05 | `burr` **0.42.0** → shim for `apache-burr` |
| PocketFlow | `The-Pocket/PocketFlow` | MIT | 11,084 | 2026-07-26 | `pocketflow` **0.0.3** (2025-07-28, stale) |
| Pydantic AI | `pydantic/pydantic-ai` | MIT | 19,131 | 2026-08-08 | `pydantic-graph` **2.26.0** (2026-08-07) |
| OpenAI Agents SDK | `openai/openai-agents-python` | MIT | 28,476 | 2026-08-08 | — |
| Mastra | `mastra-ai/mastra` | NOASSERTION | 27,032 | 2026-08-08 | — (TypeScript) |
| Google ADK | `google/adk-python` | Apache-2.0 | 21,038 | 2026-08-07 | — |
| AG2 (AutoGen fork) | `ag2ai/ag2` | Apache-2.0 | 4,839 | 2026-08-07 | — |
| AutoGen (Microsoft) | `microsoft/autogen` | CC-BY-4.0 | 60,299 | **2026-04-15 (stale ~4mo)** | — |
| CrewAI | `crewAIInc/crewAI` | MIT | 56,757 | 2026-08-08 | — |
| transitions | `pytransitions/transitions` | MIT | 6,577 | 2025-09-11 | — |
| APScheduler | `agronholm/apscheduler` | MIT | 7,596 | 2026-08-01 | `apscheduler` 3.11.3 |
| huey | `coleifer/huey` | MIT | 5,999 | 2026-08-05 | — |
| Celery | `celery/celery` | NOASSERTION (BSD-3) | 28,774 | 2026-08-07 | — |
| Procrastinate | `procrastinate-org/procrastinate` | MIT | 1,360 | 2026-07-31 | `procrastinate` 3.9.0 |

Two metadata facts worth flagging up front:

1. **Burr has moved to the Apache Software Foundation.** `DAGWorks-Inc/burr` now 301-redirects to `apache/burr`, homepage `https://burr.apache.org/`. The PyPI `burr` package is now a thin shim that depends on `apache-burr==0.42.0`. Any code or docs referencing DAGWorks Burr is describing a project that changed governance.
2. **`hatchet-sdk` ships a `claude` extra** whose dependencies are `claude-agent-sdk` and `mcp`. Hatchet has explicitly targeted the Claude-Code-as-executor use case. This is the only engine in this survey with a first-class Claude Agent SDK integration declared in its package metadata.

---

## 1. Durable execution engines — operational footprint

### 1.1 DBOS Transact (Python) — **the standout for a solo dev**

- Repo: https://github.com/dbos-inc/dbos-transact-py — **MIT**, 1,519 stars, active (pushed 2026-08-06).
- PyPI: `dbos` 2.29.0. Hard deps are small: `pyyaml`, `python-dateutil`, `psycopg[binary]`, `websockets`, `click`, `sqlalchemy[asyncio]`. Optional extras: `otel`, `validation` (pydantic), **`aiosqlite`**.
- **Footprint — verified: embedded library, no server, and SQLite works.**
  - From https://docs.dbos.dev/architecture : *"There's no separate orchestration server and no infrastructure required besides Postgres."* You "install the open-source library into your application and annotate workflows and steps." All state lives in the *system database* which "stores all workflow checkpoints, step outputs, and schedule and queue state."
  - From https://docs.dbos.dev/python/reference/configuration : the system database "may be either Postgres or SQLite, though Postgres is recommended for production", and — critically — **"If no connection string is provided, DBOS uses a SQLite database: `sqlite:///[application_name].sqlite`"**. Config key is `system_database_url` (also `application_database_url` for legacy `@DBOS.transaction`). Constructor is `DBOS(config=config)` taking a `DBOSConfig`.
  - **Net: `pip install dbos`, no Docker, no daemon, no cloud account, one SQLite file.** This is the only engine in the survey that is genuinely a library in your own process with zero external infrastructure.
  - DBOS **Conductor** (hosted observability/recovery console) is optional: *"If your application's connection to Conductor is interrupted, it will continue to operate normally."* Single-node deployments work without it.
- **Programming model (verified, https://docs.dbos.dev/python/tutorials/workflow-tutorial):** two decorators.

  ```python
  @DBOS.step()
  def step_one(): ...

  @DBOS.workflow()
  def workflow():
      step_one()
  ```

  Workflow bodies must be **deterministic** — all I/O, randomness, clock reads and subprocess calls must live inside `@DBOS.step()`. "Steps are tried *at least once* but are never re-executed after they complete." After a crash the workflow resumes from the last completed step. Idempotency keys via a context manager:

  ```python
  with SetWorkflowID("very-unique-id"):
      example_workflow()
  ```

- **HITL / durable wait (verified, https://docs.dbos.dev/python/reference/contexts):**

  ```python
  DBOS.send(destination_id: str, message: Any, topic: Optional[str] = None, *,
            idempotency_key: Optional[str] = None,
            serialization_type: Optional[WorkflowSerializationFormat] = ...,
            send_to_forks: bool = False) -> None

  DBOS.recv(topic: Optional[str] = None, timeout_seconds: float = 60) -> Any

  DBOS.set_event(key: str, value: Any, *, serialization_type=...) -> None
  DBOS.get_event(workflow_id: str, key: str, timeout_seconds: float = 60) -> Any

  DBOS.sleep(seconds: float) -> None
  DBOS.start_workflow(func, *args, **kwargs) -> WorkflowHandle[R]
  DBOS.retrieve_workflow(workflow_id: str, existing_workflow: bool = True) -> WorkflowHandle[R]
  DBOS.workflow_id: str
  ```

  `DBOS.sleep` is explicitly durable: *"it records its intended wake-up time in the database so if it is interrupted and recovers, it still wakes up at the intended time."* `DBOS.recv` blocks the workflow on a topic queue with a timeout (**default only 60 s** — you must pass a large `timeout_seconds`, or loop, for a multi-day human seal). ⚠️ **Partially verified:** the docs page I fetched asserted `recv` durability by architectural inference rather than an explicit sentence. The mechanism (messages are rows in the system database, workflow resumes from checkpoint) makes days-long waits plausible, but *treat "recv survives a restart mid-wait for days" as UNCONFIRMED until tested.* This is the single most important thing to prototype before committing.

- What we would reuse: crash-safe checkpointing of long-running steps (a `claude -p` invocation wrapped in `@DBOS.step()` that already succeeded is never re-run on resume — directly valuable, LLM steps are the expensive ones), automatic workflow recovery on process restart, retries with backoff, durable queues with concurrency limits, durable sleep, `send`/`recv` for seal gates.
- *Still unverified:* whether SQLite mode supports the full queue/recovery feature set or is degraded relative to Postgres; behaviour of concurrent processes against one SQLite file (SQLite has no `LISTEN/NOTIFY` and single-writer locking — likely fine for a solo dev's single-process tool, likely bad for multiple workers).

### 1.2 Restate — single binary, BUSL, awakeables

- Server repo: https://github.com/restatedev/restate — **Business Source License 1.1** (verified from LICENSE): Change Date = "4 years after release", Change License = **Apache 2.0**. Additional Use Grant permits production use for your own services and internal deployments; forbids operating a "Public Restate Platform Service" (a managed service letting third parties register their own deployments against Restate's APIs). **For a solo dev running it locally, BUSL is a non-issue.**
- Python SDK: https://github.com/restatedev/sdk-python — MIT, `restate-sdk` 1.0.3. Notably its extras include `langchain`/`langgraph`, `openai` (openai-agents), `pydantic-ai`, and `adk` — Restate is positioning hard as the durability layer *under* agent frameworks.
- **Footprint (verified, https://docs.restate.dev/quickstart):** install via `brew install restatedev/tap/restate-server restatedev/tap/restate`, prebuilt binary, `npm install -g @restatedev/restate-server`, or Docker. Run `restate-server` (API on :8080, UI on :9070). **"No external database required — Restate is a single self-contained binary."** Then register your app: `restate deployments register http://localhost:9080`.
- **The real cost is the inversion of control**, not the DB. Your code must be a long-running HTTP service (`hypercorn` serving `restate.app([...])`) that Restate *calls into*; Restate drives you, you don't drive it. For a git-native CLI tool whose natural shape is "run a command, do a thing, exit", that is a structural mismatch — you end up running two daemons (restate-server + your service) to orchestrate a laptop. *(The Python quickstart page itself was not fetchable — the quickstart covers only TypeScript and Java; Python setup details inferred from the SDK. The two-daemon shape is confirmed by the register step; the exact hypercorn invocation is **unverified**.)*
- Notable: `restate-sdk` extras are `langchain`/`langgraph`, `openai` (openai-agents), `pydantic-ai`, `adk`, plus a `harness` extra using `testcontainers` — Restate is explicitly positioning as *the durability layer under agent frameworks*, which is exactly the layer we're shopping for.
- **HITL primitive: awakeables — verified** (https://docs.restate.dev/develop/python/awakeables). This is the cleanest human-seal primitive in the entire survey:

  ```python
  id, promise = ctx.awakeable(type_hint=str)
  await ctx.run_typed("trigger task", request_human_review, name=name, id=id)
  review = await promise          # durable; survives restarts; no timeout required
  ```

  Resolved/rejected from another handler:

  ```python
  ctx.resolve_awakeable(name, review)
  ctx.reject_awakeable(name, "Cannot be reviewed")
  ```

  Or, decisively for our use case, **from a plain shell command with no SDK at all**:

  ```shell
  curl localhost:8080/restate/awakeables/sign_1PePOqp/resolve --json '"Looks good!"'
  curl localhost:8080/restate/awakeables/sign_1PePOqp/reject \
    -H 'content-type: text/plain' -d 'Review rejected: insufficient documentation'
  ```

  A human seal becomes: emit the awakeable id into the node's markdown, and the human (or a script, or a git hook) curls one URL to release the gate. Unlike Inngest's `wait_for_event`, there is no "signal sent before the wait started is lost" race — the id is created *before* the external party is told about it.

### 1.3 Inngest — server-side state, good HITL, but a service

- Server: https://github.com/inngest/inngest (Go). **Licence verified from `LICENSE.md`: Server Side Public License (SSPL) v1.0, with an "Apache 2.0 Future License"** — i.e. source-available copyleft, not OSI open source. Practically irrelevant for a solo dev running it locally, but it is not MIT/Apache today. Python SDK `inngest/inngest-py` is **Apache-2.0**, `inngest` 0.5.19 (last release 2026-06-23 — lagging the Go server).
- HITL primitive: **`ctx.step.wait_for_event()`** (Python; `step.waitForEvent` in TS). Takes `event` name, `timeout` as a `datetime.timedelta` or duration string (`"3d"`), and an optional `if` matching condition. On timeout the step yields `None` (Python/TS) / `step.ErrEventNotReceived` (Go). Docs confirm waits and sleeps survive restarts: *"Sleep for a second, minute, hour, week across server restarts."* **Caveat from the docs: the wait only matches events sent *after* the step executes — no lookback (a lookback feature is "forthcoming").** That matters for us: if a human approves before the node reaches the wait, the signal is lost.
- Footprint: state is held **server-side**. Local dev is `npx inngest-cli dev` (single binary, in-memory). Self-hosting for durable production needs Postgres + Redis. Your app must expose an HTTP endpoint that Inngest invokes (same inversion of control as Restate), *or* use the newer `connect` transport (extras: `protobuf`, `psutil`, `websockets`) which dials out over WebSocket. **Verdict leaning: infrastructure for a web backend, awkward for a local git-native CLI tool.**

### 1.4 Hatchet — MIT, Postgres-backed, and it knows about Claude Code

- Repo: https://github.com/hatchet-dev/hatchet — **MIT**, 7,684 stars, very active. `hatchet-sdk` 1.37.1.
- Footprint (verified from https://docs.hatchet.run/self-hosting/docker-compose): full compose stack = **PostgreSQL, RabbitMQ (optional — can use Postgres instead), a migration container, a setup-config container, the Hatchet Engine, and the Hatchet Dashboard**. Lighter options exist: the `hatchet-lite` single image, and `hatchet server start --disable-auth` running an all-in-one `hatchet-lite-dev` image for a single-container local instance.
- Durable features (from https://docs.hatchet.run/home/durable-execution): durable sleep, durable event waits, checkpoints in a durable event log giving "closer to exactly-once semantics than you'd get from traditional task queues", and replay that **skips re-running human-in-the-loop portions such as approvals**. Docs explicitly name "agentic workflows that require human-in-the-loop steps" as the target use case.
- **`hatchet-sdk[claude]` depends on `claude-agent-sdk` and `mcp`** — direct evidence Hatchet is chasing exactly our executor.
- **HITL API (verified, https://docs.hatchet.run/v1/durable-event-waits):**

  ```python
  @hatchet.durable_task(name="DurableEventTask")
  async def durable_event_task(input: EmptyModel, ctx: DurableContext) -> None:
      res = await ctx.aio_wait_for_event("user:update")
      print("got event", res)
  ```

  Full signature: `await ctx.aio_wait_for_event(key, expression=None, scope=None, lookback_window=None, payload_validator=None)` — where `expression` is a CEL filter over the payload (`"input.user_id == '1234'"`), `scope` narrows lookup, `payload_validator` is a pydantic model, and — importantly — **`lookback_window` is a `timedelta` that searches recent historical events, which fixes the early-signal race that Inngest documents as a known gap.** Docs: *"even if the task is interrupted and requeued while waiting, the event will still be processed."*
- Cost: even at its lightest this is a Docker container plus Postgres running permanently on a solo dev's laptop, and gRPC workers dialling an engine. That is a real daemon to babysit for a tool whose whole aesthetic is "files in git". Also note `hatchet-sdk` pulls `grpcio`, `grpcio-tools`, `protobuf` — a heavy dependency tree for a Python CLI.

---

### 1.5 Temporal — the gold standard, and enterprise infrastructure masquerading as a fit

- Server: https://github.com/temporalio/temporal — MIT, 22k stars. Python SDK `temporalio` 1.31.0, MIT.
- **Footprint (verified, https://docs.temporal.io/cli/server):** `temporal server start-dev` runs a self-contained dev server (gRPC service + Web UI) with **no Docker and no external database**. By default state is in-memory — *"Workflow Executions are lost when the server process dies"* — but `--db-filename` persists to a local SQLite store. **However** the docs are explicit: *"The development server is not intended for production use. It skips certain HTTP security checks to make local use simpler."* Real deployments mean Cassandra/MySQL/Postgres + history/matching/frontend/worker services, or Temporal Cloud.
- HITL: Temporal's model is the most mature — `@workflow.signal` handler methods, `workflow.wait_condition(lambda: self.approved)`, `workflow.upsert_search_attributes`, durable `workflow.sleep()`, and `handle.signal(...)` / `tctl`/`temporal workflow signal` from the CLI. Signals are durable indefinitely and a paused workflow costs nothing while waiting.
- **Blunt verdict: overkill and architecturally hostile to us.** Temporal demands (a) a running cluster, (b) worker processes that poll task queues, (c) strict workflow determinism enforced by a replay engine that will *fail your workflow* if you change the code between a pause and a resume without versioning (`workflow.patched()` / `GetVersion`). For a solo dev on a file-first tool whose orchestration code changes weekly, mandatory determinism-versioning is a serious, ongoing tax. Temporal is the right answer for a payments company; it is the wrong answer for one person and a laptop.

### 1.6 Windmill — a platform, not a library

- https://github.com/windmill-labs/windmill — Rust, 17.5k stars. **Licence verified from the repo's `LICENSE` file:** files under `backend/` and `frontend/` are **AGPLv3**, except code behind the `enterprise` compile flag / licence check which is **proprietary and commercial**; the language clients (`python-client/`, `deno-client/`, `go-client/`) and the OpenAPI/OpenFlow spec are **Apache-2.0**. The binary built without the `enterprise` feature flag is AGPLv3. Note the explicit clause: *"Private and public forks MUST not include any of the above proprietary and commercial code."*
- **Footprint (verified, https://www.windmill.dev/docs/advanced/self_host):** three mandatory services — **PostgreSQL** (stores all state including the job queue), a **Windmill server container** (frontend + API), and **Windmill worker containers**. Optional LSP, Multiplayer, reverse proxy. Enterprise features (SAML/SCIM, dedicated workers, advanced monitoring) need a licence key.
- Windmill does have "approval steps"/suspended flows for HITL, but the self-host page did not name the mechanism (**unverified**).
- **Blunt verdict: irrelevant.** Windmill's value proposition is a web UI where non-engineers compose scripts into flows with auto-generated forms. We have no non-engineers and no browser. Adopting it means running a Postgres + two containers to get a scheduler we'd then have to fight to make git-native.

### 1.7 Prefect — closer to usable, but the good parts need the server

- https://github.com/PrefectHQ/prefect — Apache-2.0, 23.5k stars, `prefect` 3.8.2. Pure Python, and its dependency list includes `aiosqlite` + `alembic` + `asyncpg`, i.e. the server's own DB layer ships in the same wheel.
- **HITL API (verified, https://docs.prefect.io/v3/advanced/interactive):** `pause_flow_run(wait_for_input=...)`, `suspend_flow_run(wait_for_input=...)`, `resume_flow_run(flow_run_id, run_input=...)`, plus non-pausing `receive_input(run_type, ...)` / `send_input(run_input, flow_run_id=...)` and a `RunInput` pydantic base class for typed approval payloads.
- ⚠️ **Key limitation, and the docs would not confirm the reassuring answer:** the interactive-workflow examples "reference a Prefect Cloud account or a self-hosted Prefect server instance, indicating these features require a Prefect deployment backend rather than standalone operation." The pause-vs-suspend distinction (suspend is supposed to tear down infrastructure and allow resumption after process exit; pause keeps the process alive) was **not confirmed on the page fetched**. Treat "Prefect can durably suspend for days with no server" as **UNVERIFIED and probably false** — Prefect 3 removed the "ephemeral server" convenience for most flows and expects `prefect server start` (which itself is a uvicorn app over SQLite by default, so the footprint is "one background Python process + a SQLite file", which is *not* terrible).
- **Verdict: middling.** Prefect gives us retries, a UI, and scheduling, but its unit of durability is the *task run* with cached results, not a replayable workflow — crash-resume semantics are weaker than DBOS/Temporal/Restate. And its centre of gravity is data pipelines. If we wanted a data pipeline we'd use the tools the sibling agent surveyed.

### 1.8 Dagster — wrong shape entirely

- https://github.com/dagster-io/dagster — Apache-2.0, 15.9k stars, 2,617 open issues.
- Dagster's core abstraction is the **software-defined asset** (a declarative graph of *materialised data artifacts* with freshness policies), driven by a daemon plus a webserver, with a code-location gRPC server per project. It is genuinely excellent at "which assets are stale and need rematerialising" — which is superficially near our "which node is worth working on" — but it has no durable-execution replay, no first-class human-approval wait, and it assumes a long-lived daemon.
- **Blunt verdict: enterprise data infrastructure. Do not adopt.** Its one conceptually interesting idea for us (declarative staleness/freshness driving automatic run selection) is worth *stealing as a concept*, not as a dependency — and the sibling agent's `targets`/DVC survey covers that idea better and lighter.

---

## 2. Human-in-the-loop: durable "wait for approval" — the comparison that matters

Our design has **human seal gates**: a node must pause until a human signs off, possibly days later, and survive a restart of everything.

| System | Primitive | Exact API | Survives restart? | Footprint to get it | Race if signal arrives early? |
|---|---|---|---|---|---|
| **Restate** | **Awakeable** | `id, promise = ctx.awakeable(type_hint=str)`; `await promise`; resolve via `ctx.resolve_awakeable(id, val)` **or plain `curl .../restate/awakeables/<id>/resolve`** | Yes, indefinitely | `restate-server` binary (embedded RocksDB, no external DB) + your app as an HTTP endpoint | **No race** — id is minted before anyone is told about it |
| **DBOS** | **Durable messaging** | `DBOS.recv(topic=None, timeout_seconds=60)` ← `DBOS.send(destination_id, message, topic=...)`; also `set_event`/`get_event`; `DBOS.sleep()` explicitly durable | Yes (⚠️ *inferred, not explicitly stated for `recv`* — **prototype this**) | **None. Library + one SQLite file.** | No — `send` to a known workflow id is buffered in the DB |
| **Temporal** | **Signal + wait_condition** | `@workflow.signal` handler; `await workflow.wait_condition(lambda: self.approved)`; external `handle.signal(...)` or `temporal workflow signal` CLI | Yes, indefinitely; the gold standard | Cluster (dev server persists only with `--db-filename`, explicitly not for production) | No — signals are buffered by the server |
| **Inngest** | `step.waitForEvent` | `ctx.step.wait_for_event(event=..., timeout=timedelta(days=3), if_=...)`; returns `None` on timeout | Yes — *"sleep for a second, minute, hour, week across server restarts"* | Inngest server (dev: single binary; prod: Postgres + Redis, or Cloud) + your app as HTTP endpoint or `connect` WebSocket | ⚠️ **YES — documented race.** The wait "begins listening for new events from when the code is executed"; earlier events are missed. Lookback is "forthcoming". Bad for a human who approves early. |
| **Hatchet** | Durable event wait | `@hatchet.durable_task(...)` + `await ctx.aio_wait_for_event(key, expression=<CEL>, scope=..., lookback_window=timedelta(...), payload_validator=...)` on a `DurableContext` | Yes — *"even if the task is interrupted and requeued while waiting, the event will still be processed"* | Postgres + engine (+ RabbitMQ optional); lightest is `hatchet-lite` single container or `hatchet server start --disable-auth` | **No — `lookback_window` explicitly searches recent historical events.** Better than Inngest here. |
| **Prefect** | Suspend / pause | `suspend_flow_run(wait_for_input=RunInput)`, `pause_flow_run(...)`, `resume_flow_run(id, run_input=...)`, `receive_input`/`send_input` | ⚠️ Requires a Prefect server or Cloud backend; multi-day resume after process exit **unverified** | `prefect server start` (uvicorn + SQLite) or Cloud | Unverified |
| **Windmill** | Approval / suspended flow steps | Mechanism not named on the page fetched — **unverified** | Presumably (state in Postgres) | Postgres + server container + worker container | Unverified |
| **LangGraph** | `interrupt()` | `interrupt("Do you approve?")` inside a node; resume with `Command(resume=True)` on the same `thread_id` | Yes, "waits indefinitely" — **iff** a durable checkpointer (`SqliteSaver`, not `InMemorySaver`) | `pip install` + SQLite file, **no server** — but drags in `langchain-core` | No race, **but a worse hazard: the node re-runs from its start on resume**, so any dispatch before the `interrupt()` is repeated |
| **Apache Burr** | *No signal primitive* — pause = "the process exits" | `initialize_from(..., resume_at_next_action=True)` in a later process, keyed on `app_id` | Yes — state persisted after each completed action | `pip install apache-burr` + SQLite file. **Zero core dependencies, no server.** | N/A — approval is out-of-band (a file, a git commit); we supply the gate ourselves |

**Ranking for our seal gate specifically:** Restate awakeables (cleanest semantics, `curl`-releasable, no early-signal race) > DBOS `send`/`recv` (zero infrastructure, but verify the days-long wait) > Temporal signals (best engineered, worst footprint) > Hatchet > Inngest (the no-lookback race is a genuine correctness hazard for human approval) > Prefect > Windmill.

---

## 3. Lightweight / embeddable alternatives worth knowing

These are *components*, not orchestrators — relevant only if the answer is "keep the hand-rolled scheduler and borrow a part".

| Library | Repo | Licence | Fit |
|---|---|---|---|
| **transitions** | `pytransitions/transitions` | MIT, 6.6k★, last push **2025-09-11** (quiet but stable/mature) | A genuinely good, tiny FSM library: declarative states/transitions, guards/conditions, callbacks, `HierarchicalMachine`, and `GraphMachine` for diagram output. Could replace the *declaration* of our move state machine (states + legal transitions + fault routing edges) with data, and give free state-diagram rendering for docs. **It has no persistence and no durability** — you serialise the state yourself, which we already do into git. Cheap, honest win; ~zero lock-in. |
| **APScheduler** | `agronholm/apscheduler` | MIT, 7.6k★, active | Cron/interval/date triggers with pluggable job stores (`SQLAlchemyJobStore` → SQLite). Relevant only if we want *time-based* triggering. Our scheduler is **value-based**, not time-based. Mostly irrelevant. |
| **huey** | `coleifer/huey` | MIT, 6k★, active | Small task queue; SQLite storage exists (`SqliteHuey`) — a genuine "job queue with no server". But it gives at-most/at-least-once task dispatch, **not** durable multi-step workflow replay. Would replace a small part of the dispatch shell, not the orchestration. |
| **Procrastinate** | `procrastinate-org/procrastinate` | MIT, 1.4k★, active | Postgres-only (`psycopg[pool]`, uses `LISTEN/NOTIFY`). Elegant, but requires Postgres — kills the "solo dev, no infra" property. |
| **Celery** | `celery/celery` | BSD-3, 28.8k★ | Requires a broker (Redis/RabbitMQ). **Irrelevant** — no durable workflow semantics, heavyweight, and we have no distributed workers. |

**None of these is a durable-execution engine.** The only credible "durable execution as an embeddable library, not a server" in the entire Python ecosystem as of 2026-08 is **DBOS Transact** (and, at a stretch, LangGraph's checkpointer and Apache Burr's state persister, which are graph-replay mechanisms rather than general durable execution — see §4). Note that `pydantic-graph`, often cited as the third option here, **deleted its persistence layer in v2** — see §4.4.

---

## 4. Agent-graph frameworks

**Framing that survived contact with the evidence:** we do *not* need an LLM-calling abstraction — our executor is a CLI coding agent. So for each framework the only question is: *does its persistence/pause/resume layer work standalone, without the LLM baggage?* For most, the answer is no, and for one the feature was **deleted upstream between the time it was recommended and now.**

### 4.1 LangGraph — partial: steal the schema, not the runtime

- https://github.com/langchain-ai/langgraph — MIT, 39.2k★, pushed 2026-08-07. `langgraph` **1.2.10**; `langgraph-checkpoint` **4.2.0**; `langgraph-checkpoint-sqlite` **3.1.1**; `langgraph-checkpoint-postgres` 3.1.2. All MIT.
- **(a) Checkpointer is genuinely embedded — verified.** `SqliteSaver` takes a raw `sqlite3.Connection`; no server. From the source docstring (`libs/checkpoint-sqlite/.../__init__.py`):

  ```python
  conn = sqlite3.connect("checkpoints.sqlite", check_same_thread=False)
  memory = SqliteSaver(conn)
  graph = builder.compile(checkpointer=memory)
  config = {"configurable": {"thread_id": "1"}}
  result = graph.invoke(3, config)
  ```

  The source carries its own warning: SqliteSaver *"is meant for lightweight, synchronous use cases (demos and small projects) and does not scale to multiple threads."* Async variant `langgraph.checkpoint.sqlite.aio.AsyncSqliteSaver`.

  `BaseCheckpointSaver` surface: `get`, `get_tuple`, `list`, `put`, `put_writes`, `delete_thread` (+ async). A custom saver needs five: `aput`, `aput_writes`, `aget_tuple`, `alist`, `adelete_thread`. Hard constraint from the docs: *"`get_tuple` with a specific `checkpoint_id` must be O(1)"* or delta channels corrupt silently; PK must be `(thread_id, checkpoint_ns, checkpoint_id)`.

  LangGraph 1.x adds explicit **durability modes**: `graph.stream({...}, durability="sync")` — `"exit"` (no mid-run recovery), `"async"` (small crash window), `"sync"` (write before next step). Only `"sync"` is honest for expensive steps.

- **(b) HITL is real but has a sharp edge.**

  ```python
  from langgraph.types import interrupt, Command
  def approval_node(state: State):
      approved = interrupt("Do you approve this action?")
      return {"approved": approved}
  # later, in a different process, days later:
  graph.stream_events(Command(resume=True),
                      config={"configurable": {"thread_id": "thread-1"}}, version="v3")
  ```

  Docs: *"LangGraph saves the graph state using its persistence layer and waits indefinitely until you resume execution."* Cross-restart resume works **iff** the checkpointer is durable (`SqliteSaver`, not `InMemorySaver`). `interrupt_before`/`interrupt_after` are described as **debugging breakpoints**, not the HITL mechanism.

  ⚠️ **The trap, verbatim from the docs:** *"the node restarts from the beginning of the node where the `interrupt` was called when resumed, so any code before the `interrupt` runs again."* Interrupt matching is *"strictly index-based"*, so call order must be stable, and `interrupt()` is an exception so it must not be caught. **A `claude -p` dispatch placed before an interrupt would be re-run on resume.** That is exactly the failure mode our move state machine exists to prevent, and it makes the HITL win far from free.
- **(c) Usable with no LLM — verified.** The official `SqliteSaver` docstring itself uses `builder.add_node("add_one", lambda x: x + 1)` over `StateGraph(int)`. Nodes are plain `state -> dict` callables; `subprocess`/`claude -p` inside a node is fine.
- **(d) Coupling — the dealbreaker.** `langgraph-checkpoint` **requires `langchain-core`** even though it is "just" persistence. There is no LangChain-free install path. `langgraph` additionally pins `langgraph-prebuilt` and `langgraph-sdk`.
- **Verdict: PARTIAL — design import only.** Take the `BaseCheckpointSaver` method set as an interface shape and the `durability="sync"` framing. Do not adopt the runtime: it means re-expressing a git-backed, human-readable node tree as reducer-based channel state serialised to `ormsgpack` blobs, and accepting node-replay-on-resume around a subprocess that costs real money.
- *Unverified:* the `SqliteSaver.from_conn_string` signature; whether `sqlite-vec` (a **compiled** hard dependency of the SQLite checkpointer) ships prebuilt wheels for all target platforms.

### 4.2 Apache Burr (incubating) — the best structural fit of the graph frameworks

- https://github.com/DAGWorks-Inc/burr → **redirects to `apache/burr`**, https://burr.apache.org/. Apache-2.0, 2,504★, pushed 2026-08-05. **PyPI `apache-burr` 0.42.0 (uploaded 2026-05-10)**; the `burr` package is now a no-source shim pinning `apache-burr`.
- **Donated to the Apache Software Foundation, currently in incubation.** Mixed signal: better governance and licence stability; ASF incubation also often means slower velocity, and incubating projects can be retired.
- **The headline fact:**

  ```toml
  [project]
  name = "apache-burr"
  version = "0.42.0"
  dependencies = []          # zero core dependencies
  requires-python = ">=3.9"
  ```

  Everything (tracking UI, streamlit, postgres, redis, opentelemetry, ray, pydantic) is an extra. Against LangGraph — which cannot be installed without `langchain-core` — this is dramatically lighter, and it is the single strongest argument for Burr in our context.
- **Persistence / pause-resume model.** Apps keyed by **`app_id`** (auto UUID) + optional **`partition_key`** via `ApplicationBuilder.with_identifiers()`. `with_state_persister(...)` *"writes state to the database after each action"*. `initialize_from(...)` reloads, with `resume_at_next_action=True` to *"start where you left off"*, a `default_state`, and **`fork_from_app_id`** to *"fork state from a previous application"*. Example:

  ```python
  state_persister = SQLLitePersister.from_values(db_path=".sqllite.db", table_name="burr_state")
  ```

  Custom backends subclass `BaseStatePersister` / `AsyncBaseStatePersister`.
- **Why this beats LangGraph's `interrupt()` for a CLI executor:** Burr's pause is not an in-node exception you resume *into* — the process simply ends after a completed action, and a later process rebuilds the app from `app_id` and continues at the *next* action. **The unit of persistence is the completed action, so there is no node-replay hazard.** That maps exactly onto our move state machine, where each move is one `claude -p` dispatch that must run exactly once. `fork_from_app_id` is the "re-run a move from a known state" primitive we would otherwise hand-roll on git.
- **Verdict: PARTIAL → the only agent-graph framework worth spiking.** It does not replace the git-backed node store (Burr persists flat state rows, not a node tree), and the tracking UI needs a local server (opt-in extra, unnecessary headless).
- *Unverified:* a verbatim full `ApplicationBuilder` save/load round-trip; post-incubation release cadence (commits run to Aug 2026 but the last release is May 2026 — **check before committing**); it is still classified Beta at 0.42.0.

### 4.3 PocketFlow — IGNORE

- https://github.com/The-Pocket/PocketFlow — MIT, 11.1k★, pushed 2026-07-26. PyPI `pocketflow` **0.0.3, last uploaded 2025-07-28** (a year stale).
- The whole of `pocketflow/__init__.py` was read. Classes: `BaseNode`, `Node`, `BatchNode`, `Flow`, `BatchFlow`, and async/parallel variants. Lifecycle is `prep`/`exec`/`post` with action-string routing. **There is no persistence, no checkpointing, no resume, no file I/O and no state serialisation anywhere in the file.** Orchestration is purely in-memory and dies with the process.
- **Verdict: IGNORE.** It solves the 5% of our problem that is easy (graph traversal) and none of the 95% that is hard. Pure dependency for zero deletion.

### 4.4 `pydantic-graph` — IGNORE. **The persistence layer was deleted upstream.**

This is the most important single finding in the agent-graph half of the survey, and it inverts the prior expectation that `pydantic-graph` was "the durable graph without LLM baggage".

- Current release: **`pydantic-graph` 2.26.0**, MIT, `requires-python >=3.10`, deps `anyio`, `httpx`, `logfire-api`, `pydantic>=2.12`, `typing-inspection`. Separately installable with no LLM library — *that* part of the premise holds.
- **But `pydantic_graph.persistence` no longer exists.** The package tree on `main` has no `persistence/` directory. `__init__.py` exports `GraphBuilder`, `Graph`, `GraphRun`, `Step`, `Decision`, `Join`, `Fork`, reducers, `BaseNode`, `End` — **no `SimpleStatePersistence`, no `FullStatePersistence`, no `BaseStatePersistence`, no `FileStatePersistence`.**
- Confirmed by the official V2 migration table (`docs/migration.md`), verbatim:

  > | `pydantic_graph.persistence` | No `pydantic_graph` equivalent — **the builder API doesn't snapshot graph state**. To save, resume, and fork **agent run** state, Pydantic AI Harness ships `StepPersistence` |

- Tag archaeology confirms the timeline: `v1.0.0` and `v1.107.1` both contain `pydantic_graph/persistence/{__init__,_utils,file,in_mem}.py`; `v2.0.0` onward do not. Pydantic AI V2 shipped a "harness-first" redesign that moved durability **up into the LLM-coupled agent layer** — precisely the baggage we were trying to avoid.
- **The deleted v1 API was, ironically, the best-designed thing in this survey for our problem.** `BaseStatePersistence` abstract methods: `snapshot_node`, `snapshot_node_if_new`, `snapshot_end`, `record_run`, `load_next`, `load_all`, plus `set_graph_types`/`set_types`/`should_set_types`. Snapshot status is `Literal['created', 'pending', 'running', 'success', 'error']` — essentially our move state machine. The v1 cross-process example is exactly the shape we want:

  ```python
  async def run_node(run_id: str) -> bool:
      persistence = FileStatePersistence(Path(f'count_down_{run_id}.json'))
      async with count_down_graph.iter_from_persistence(persistence) as run:
          node_or_end = await run.next()
      return isinstance(node_or_end, End)
  ```

  with the v1 docs noting *"`run_node` requires no external application state (apart from state persistence) to be run, meaning graphs can easily be executed by distributed execution and queueing systems."* The v1 HITL example ran **one CLI process per turn**, picking up via `if snapshot := await persistence.load_next():`.
- **Verdict: IGNORE as a dependency** — pinning `pydantic-graph<2` means adopting an API upstream has explicitly deleted, which is worse than hand-rolling. **But read the v1 source as a design reference.** In particular `record_run` — an async context manager that raises `GraphNodeRunningError` if the node is already running — is a concurrency guard worth copying verbatim into our move state machine.

### 4.5 The rest — brief

| Framework | Metadata | Durable pause surviving restart? | Verdict |
|---|---|---|---|
| **OpenAI Agents SDK** | MIT, 28.5k★, pushed 2026-08-08 | Yes-ish: `SQLiteSession`, `SQLAlchemySession`, `AdvancedSQLiteSession`, encrypted sessions, and a serialisable `RunState` (`runstate-schema.md` in-repo). **But sessions persist *conversation history*, not arbitrary workflow state**, scoped to an agent run over the OpenAI API. | **IGNORE** — we'd persist nothing we care about while inheriting an OpenAI-shaped agent loop. |
| **Mastra** | licence **NOASSERTION** (GitHub cannot classify it — verify manually), 27k★, pushed 2026-08-08 | **Best-articulated suspend/resume of the group**: `suspend()` inside a step, `resume({ step, resumeData })` from anywhere; docs state *"When a workflow is suspended, its current execution state is saved as a snapshot… Snapshots are stored in your configured storage provider and persist across deployments and application restarts."* | **IGNORE for reuse — it is TypeScript**, a non-starter against a 3,400-line Python codebase. **Worth reading for design.** (Storage backends and server requirement unverified.) |
| **Google ADK** | Apache-2.0, 21k★, pushed 2026-08-07 | `DatabaseSessionService` (SQLAlchemy + schema migrations) and `long_running_functions` (tool returns a pending ticket; agent resumes when the result arrives). Durable in principle. | **IGNORE** — again *session* state for an LLM agent, bound to ADK's `Runner`/`Agent`/`Event` model and oriented at Vertex deployment. Heavy, Google-shaped, buys nothing for subprocess dispatch. |
| **AutoGen (Microsoft)** | **CC-BY-4.0** (a *documentation* licence on a code repo — red flag), 60.3k★, **last push 2026-04-15 — ~4 months stale, the only stalled repo in this survey** | No | **IGNORE** |
| **AG2** (maintained AutoGen fork) | Apache-2.0, 4.8k★, pushed 2026-08-07 | No — conversational multi-agent; state lives in chat transcripts; HITL is a `human_input_mode` stdin prompt **during a live run**. Nothing survives a restart. | **IGNORE** |
| **CrewAI** | MIT, 56.8k★, pushed 2026-08-08 | Weak — a `@persist` decorator over Flow state backed by SQLite. | **IGNORE** — "agents with roles and goals collaborating" is the opposite of one deterministic executor with verified outputs; high churn. |

### 4.6 The one-line answer to "do agent-graph frameworks add value over driving Claude Code subagents directly?"

**Almost entirely no.** Four of nine are conversational/LLM-loop frameworks whose persisted artifact is chat history — irrelevant when the executor is a subprocess. One (PocketFlow) has no persistence at all. One (`pydantic-graph`) deleted the relevant feature. One (Mastra) is the wrong language. **Two are worth anything: LangGraph as a schema/interface design import, and Apache Burr as an actual candidate** — and Burr only because it has zero core dependencies and persists at completed-action granularity, which is the one property that matters when each action forks an expensive `claude -p`.

---

## 5. SYNTHESIS — ranked options for the orchestration substrate

### 5.0 What we actually have (measured, `ctx/`, 2026-08-08)

| Module | LOC | What it does | Replaceable by anything in this survey? |
|---|---|---|---|
| `scripts/ctx_core.py` | 1,172 | Marker grammar, collation into a `Model` | **No.** Domain language. Nothing external touches this. |
| `scripts/ctx_store.py` | 542 | Git-backed node store | **No.** Covered by the sibling git-store survey, not here. |
| `scripts/ctx_run.py` | 395 | Real-store outer shell: headless `claude -p` dispatch, telemetry JSONL, **`run-state.json` persisted before every dispatch so an interrupted run resumes**, per-tick world reload | **YES — this is the durable-execution reimplementation.** |
| `scripts/ctx_schedule.py` | 275 | `priority = centrality × (1 − confidence)`, fidelity fold over children, floor-first then best-first among deepen-ready nodes | **No. Nothing in this survey does this.** |
| `scripts/ctx_driver.py` | 249 | Move state machine INTERFACE→DESIGN→PLAN→TEST→CONSTRUCT→VALIDATE, verdict fault-routing, fault caps, focus/WIP-lock, injected `dispatch` | **Partly** — the graph/state-machine shape is expressible elsewhere; the routing *policy* is ours. |
| `ctx_mcp/server.py` | 244 | MCP context server | No. |
| `scripts/ctx_lint.py`, `ctx_source.py`, `ctx_artefact.py`, `ctx_seal.py` | 426 | Linting, sources, artefacts, seals | No. |

**The honest read: only ~395 lines (`ctx_run.py`) plus a slice of `ctx_driver.py` is machinery these engines are actually in the business of replacing.** The docstring of `ctx_run.py` is a confession — *"run-state.json persists cursor/gauge/fault state across runs (saved before every dispatch and at the end), so an interrupted run resumes instead of restarting"* — that is a hand-rolled, coarse-grained, single-file checkpointer. It is exactly what durable execution does properly.

### 5.1 The decisive architectural fact

**Every one of these engines separates "which work to run" from "run it durably", and only supplies the second half.** Their scheduling is FIFO/priority-queue over an *externally supplied* work item, or cron, or "an event arrived". Not one of them selects work by a derived value function over a graph. Temporal, Restate, Inngest, Hatchet, DBOS, Prefect, Dagster, LangGraph: you tell them what to run; they make sure it finishes.

Doktoreltern's `ctx_schedule.next_node` is the opposite: it *derives* what is worth doing from graph structure (centrality) and epistemic state (confidence, fidelity fold), with a walking-skeleton floor and a bottom-up readiness gate. Dagster's asset-staleness is the nearest cousin in the whole landscape and it is still "run the stale closure", not "run the highest-expected-value node". **This is genuinely novel and there is nothing to buy.**

So the real question is never "replace our scheduler with X". It is: **do we keep hand-rolling the durability underneath it, or borrow that?**

---

### Option A — Keep the hand-rolled scheduler, adopt **DBOS Transact** for durability underneath it. ★ Recommended

**Shape.** `ctx_schedule.next_node` stays exactly as-is (275 lines, ours). `ctx_driver.run` becomes a `@DBOS.workflow()`. Each dispatched move — one headless `claude -p` invocation — becomes a `@DBOS.step()`. The store re-collation becomes a step. The `SetWorkflowID(node_id + move + attempt)` idempotency key means a crashed run never re-pays for a Claude call that already completed.

**What it buys over hand-rolled:**
- Deletes `run-state.json` and its save-before-every-dispatch dance (a chunk of `ctx_run.py`) in favour of per-step checkpointing that is strictly finer-grained and crash-correct. Today a crash *during* a dispatch loses that dispatch's money; with DBOS the step either checkpointed or didn't, and a completed step is never re-executed.
- Free retries with backoff on flaky `claude -p` invocations, declaratively.
- Free durable seal gates: `DBOS.recv(topic="seal", timeout_seconds=...)` in the workflow, released by a `DBOS.send(workflow_id, approval, topic="seal")` from a tiny CLI subcommand or a git hook.
- Free durable timers (`DBOS.sleep`) for cool-offs / rate limits.
- Workflow listing, status, cancel, resume, and fork out of the box — replacing bespoke run-state introspection.

**What it costs:**
- `pip install dbos` — adds `sqlalchemy`, `psycopg[binary]`, `websockets`, `click`, `pyyaml`. `psycopg[binary]` is a hard dependency even in SQLite mode, which is ugly for a pure-Python-feeling tool (a compiled wheel we never use).
- **The determinism constraint bites.** Workflow bodies must invoke the same steps with the same inputs in the same order on replay. Our driver's decisions depend on a freshly re-collated `Model` read off disk — that read must be a step, and its checkpointed result replayed, meaning a resumed run replays the *old* world view rather than seeing what changed on disk. That directly conflicts with `ctx_run.py`'s deliberate "per-tick world reload so nodes created mid-run join the frontier". **This is the sharpest design tension and must be prototyped before committing.** Likely resolution: one DBOS workflow *per move*, not per run — the outer tick loop stays plain Python and only the individual node-move is durable. That is a smaller, safer, and probably better win anyway.
- State now lives in a SQLite file *and* in git. Two sources of truth for run state, with git remaining the source of truth for node state. Needs a clear rule about which is authoritative.
- Unverified: SQLite feature parity, and whether `DBOS.recv` genuinely survives a multi-day restart.

**Verdict: the only option in this survey where the cost is a `pip install` rather than a daemon.** Prototype the per-move workflow first.

### Option B — Keep everything hand-rolled. ★ The strong default, and defensible

**The argument for.** The scheduler is 275 lines and does something nothing on the market does. The driver is 249 lines of domain policy (fault routing, fault caps, the focus/WIP-lock heuristic that exists precisely *because* DESIGN raises confidence and thereby drops priority mid-sequence — a subtlety no generic engine would ever have). The durability we actually need is "don't repeat an expensive Claude call after a crash", which is a checkpoint log; the 2026 consensus, visible in the search results below, is that this is on the order of 200 lines of stdlib Python over SQLite. We already have a cruder version working.

Critically: **every engine here would invert control over the loop.** Restate and Inngest want your app to be an HTTP service they call into. Temporal wants worker processes polling task queues and will fail your workflow on a code change without explicit versioning. Hatchet wants Postgres and gRPC. DBOS wants determinism in the loop body. Doktoreltern's shape is "a CLI command that reads a git repo, thinks, spawns `claude -p`, writes files, exits". Every one of those engines fights that shape to some degree.

**The argument against.** `ctx_run.py`'s durability is coarse (whole-dispatch granularity), untested against real crash scenarios, and hand-rolled durable state is a classic source of subtle bugs that only show up when you most need recovery. And the seal gate — "pause for days, survive a restart" — is a *new* requirement that we have not built yet and which DBOS/Restate give away free. Building a durable, race-free approval wait by hand is more work than it looks (see Inngest, a funded company, still shipping a documented early-signal race in 2026).

**Verdict: keep the scheduler, unconditionally. The open question is only durability + seals — and that is a narrow enough surface that Option A is a cheap experiment rather than a rewrite.**

### Option C — **Apache Burr** for the move state machine + resume, scheduler untouched

**Shape.** `ctx_schedule.next_node` still picks the node. The move ladder (INTERFACE→DESIGN→PLAN→TEST→CONSTRUCT→VALIDATE) becomes a Burr `Application` per node, keyed `app_id=node_id`, `partition_key=project`. `with_state_persister(SQLLitePersister...)` writes after each completed action; a later process does `initialize_from(..., resume_at_next_action=True)` and continues.

**Buys:** replaces `run-state.json` and a slice of `ctx_driver.py`'s resume bookkeeping with a maintained, Apache-2.0, **zero-core-dependency** library. Crucially it persists at **completed-action** granularity, so a `claude -p` dispatch is never replayed — the property LangGraph's `interrupt()` explicitly does *not* give. `fork_from_app_id` is a free "re-run this move from a known earlier state" primitive we'd otherwise build on git. `pip install apache-burr` adds literally nothing to the dependency tree.

**Costs:** does *not* give durable seal gates (no signal/awakeable primitive — a pause is just "the process exits and someone starts it again", which for a human seal is arguably fine and arguably exactly what we want). No retries, no durable timers, no crash-safety *within* an action. Burr persists flat state rows, not a node tree, so it sits beside the git store rather than replacing it — two state locations again. And the governance risk is real: ASF **incubation**, still Beta at 0.42.0, and commits (Aug 2026) are outpacing releases (May 2026).

**Verdict: the lightest credible external option, and the only agent-graph framework worth a spike.** Weaker than DBOS on durability (no intra-action crash safety, no retries, no timers, no signals) but far lighter on dependencies and with no determinism constraint on the loop body. **If Option A's determinism tension with per-tick world reload proves fatal, this is the fallback.**

### Option D — **Restate**, if seal gates turn out to be the dominant requirement

**Shape.** `restate-server` runs as a local daemon (single self-contained binary, `brew install`, no external DB). The per-node inner loop becomes a Restate workflow; each seal gate becomes an awakeable whose id is written into the node's markdown, releasable by `curl localhost:8080/restate/awakeables/<id>/resolve`.

**Buys:** the best human-gate primitive in the survey by a clear margin — durable, unbounded, no early-signal race, and **releasable from a shell one-liner with no SDK, no UI, no client library**. That is beautifully aligned with a git-native, text-first tool: the gate id is just text in a file, and approving is one command. Plus full durable execution, durable timers, and a decent local UI on :9070.

**Costs:** BUSL-1.1 (fine for us — Change Date is 4 years to Apache 2.0, and the Additional Use Grant explicitly permits internal/own-service production use). The real cost is architectural: **two daemons** (`restate-server` + your app as a registered hypercorn HTTP service), and inversion of control — Restate drives you. The Python SDK is young (78 stars, `restate-sdk` 1.0.3) versus the Rust server's 4.3k. For one person on a laptop this is a lot of standing infrastructure to keep a to-do graph moving.

**Verdict: adopt only if human seal gates become the centre of the design.** Otherwise DBOS's `send`/`recv` is 80% as good for 0% of the operational cost.

### Option E — **Hatchet**, the one that is explicitly courting us

**Shape.** `hatchet-lite` container + Postgres; workers dial the engine over gRPC; `@hatchet.durable_task` per move; `ctx.aio_wait_for_event(..., lookback_window=...)` for seals.

**Buys:** MIT (cleanest licence of the server-based options). Genuinely good durable-event semantics — the `lookback_window` parameter fixes exactly the race Inngest documents as unfixed. A real UI, queues with concurrency limits, and — uniquely — **`hatchet-sdk[claude]` depends on `claude-agent-sdk` and `mcp`**, i.e. the vendor has already built for a Claude-Code executor. If this project ever grew past one developer onto shared infrastructure, this is the most natural landing spot.

**Costs:** Postgres + an engine container running permanently on a solo dev's laptop, plus a `grpcio`/`protobuf` dependency tree. For one person, that is infrastructure tax with no corresponding benefit — the concurrency limits, multi-tenancy, and dashboard exist to solve problems we do not have.

**Verdict: right answer to a question we are not asking yet. Revisit if Doktoreltern ever runs unattended on a server.**

### Explicitly rejected

- **Temporal** — best-engineered durable execution in existence, and the worst possible fit: mandatory cluster, mandatory determinism *versioning* (`workflow.patched()`) every time orchestration code changes between a pause and a resume. For a solo dev iterating weekly, that alone disqualifies it. `temporal server start-dev --db-filename` is a pleasant local story but the docs explicitly say it is not for production.
- **Inngest** — SSPL server, requires your app to be an HTTP endpoint or WebSocket-connected worker, and ships a **documented correctness hazard for human approval** (`wait_for_event` has no lookback; a human who approves before the wait starts is ignored). Do not put a seal gate on that.
- **Windmill** — AGPLv3 + proprietary EE, three mandatory services, and its entire value proposition (a browser UI where non-engineers compose scripts with auto-generated forms) is worthless to a solo CLI user.
- **Dagster** — enterprise data infrastructure. Steal the *idea* of declarative staleness driving run selection; do not take the dependency.
- **Prefect** — its HITL API (`suspend_flow_run`/`wait_for_input`/`RunInput`) is pleasant, but the docs indicate it needs a Prefect server or Cloud backend, its durability unit is a cached task run rather than a replayable workflow, and its centre of gravity is data pipelines.
- **Celery / Procrastinate** — need a broker or Postgres; no durable workflow semantics. **APScheduler** — time-based, and our scheduling is value-based. Irrelevant.

### Zero-dependency wins available regardless of which option wins

These cost nothing, carry no lock-in, and are worth doing even if the answer is Option B.

1. **`transitions`** (`pytransitions/transitions`, MIT, 6.6k★) for the move state machine's *declaration*. Our INTERFACE→DESIGN→PLAN→TEST→CONSTRUCT→VALIDATE ladder plus its fault-routing edges is currently imperative Python inside `ctx_driver.py`. Declaring it as data buys guard/condition hooks, illegal-transition errors for free, and — via `GraphMachine` — auto-generated state diagrams for the docs. No persistence, no daemon; we keep serialising state into git exactly as now.
2. **Copy `pydantic_graph`'s deleted v1 `record_run` contract.** At tag `v1.107.1`, `BaseStatePersistence.record_run` is an async context manager that **raises `GraphNodeRunningError` if the node is already running**. That is a concurrency guard our move state machine should have and currently does not. Its five-state snapshot lifecycle — `Literal['created', 'pending', 'running', 'success', 'error']` — is the cleanest published statement of our problem, and its seven-method interface (`snapshot_node`, `snapshot_node_if_new`, `snapshot_end`, `record_run`, `load_next`, `load_all`, `set_graph_types`) is a better shape than what we have. **Read it, don't depend on it.**
3. **Adopt LangGraph's `durability` vocabulary** (`"exit"` / `"async"` / `"sync"`) as an explicit, documented setting on our own run-state writes, rather than leaving the guarantee implicit. Right now `ctx_run.py` is `"sync"` at whole-dispatch granularity and nothing says so.
4. **Steal Burr's `fork_from_app_id` idea** — "re-run this move from a known earlier state" — as an explicit `ctx` subcommand. We are git-backed, so we are unusually well placed to implement it, and it is the natural debugging primitive for an agent that occasionally goes wrong in an interesting way.

---

## 6. What could not be verified

1. **`DBOS.recv` durability across a multi-day restart mid-wait.** The docs state this explicitly for `DBOS.sleep` but the `recv` page asserted it by architectural inference. **Prototype before relying on it for seal gates.**
2. **DBOS SQLite feature parity with Postgres** — whether queues, recovery, and concurrent workers all work in SQLite mode, or whether SQLite is dev-only in practice. SQLite has no `LISTEN/NOTIFY` and single-writer locking.
3. **Restate Python quickstart specifics** — the official quickstart covers only TypeScript and Java. The exact `hypercorn` + `restate.app([...])` invocation is inferred, not read.
4. **Prefect pause-vs-suspend semantics** and whether a suspended flow resumes days later after process exit without Prefect Cloud. Docs fetched said only that examples "reference a Prefect Cloud account or a self-hosted Prefect server instance".
5. **Windmill's approval/suspend step mechanism** — not named on the self-host page.
6. **Inngest server licence nuance** — confirmed SSPL v1.0 + "Apache 2.0 Future License" from `LICENSE.md`, but the exact future-licence conversion terms were not read in full.
7. **Whether DBOS's determinism constraint can accommodate our per-tick world reload.** Flagged in Option A as the sharpest open design question.
8. **LangGraph:** the `SqliteSaver.from_conn_string` signature; and whether `sqlite-vec` — a **compiled** hard dependency of `langgraph-checkpoint-sqlite` — ships prebuilt wheels for all target platforms.
9. **Apache Burr:** a verbatim full `ApplicationBuilder` save/load round-trip snippet; and post-incubation release cadence (commits to Aug 2026 vs last release May 2026). Check before committing.
10. **Mastra's licence** — GitHub reports `NOASSERTION` and it must be checked manually. Also its supported storage backends and whether a server is required. (Moot unless we ever move to TypeScript.)
11. Whether any of AutoGen/AG2/CrewAI/OpenAI Agents SDK/Google ADK have added durable-pause features not surfaced on the pages read.

---

## 7. Bottom line

- **Keep `ctx_schedule.py`.** Value-based node *selection* — `centrality × (1 − confidence)` with a fidelity fold and a bottom-up readiness gate — has **no equivalent anywhere in this landscape**. Every engine surveyed runs work you hand it; none decides what is worth doing. This is the genuinely novel part of Doktoreltern and there is nothing to buy. The 275 lines stay.
- **Keep `ctx_core.py` and `ctx_store.py`.** Nothing here persists a human-readable, git-versioned node tree; they all persist opaque serialised rows. Different artifacts.
- **The only thing genuinely worth replacing is `ctx_run.py`'s durability layer (~395 lines), and the seal gate we haven't built yet.** That is a narrow surface.
- **Spike DBOS first** (`pip install dbos`, SQLite default, zero infrastructure, MIT) as **one workflow per move**, not per run — this sidesteps the determinism-vs-world-reload tension. Verify `DBOS.recv` durability across a multi-day restart before relying on it for seals.
- **If DBOS's determinism constraint bites, fall back to Apache Burr** (zero core deps, persists at completed-action granularity, no replay hazard) and build the seal gate by hand.
- **Do not adopt Temporal, Windmill, Dagster, Prefect, Inngest, or any of the LLM agent frameworks.** They are either enterprise infrastructure for problems a solo dev does not have, or LLM-loop abstractions whose persisted artifact (chat history) is irrelevant when the executor is a subprocess.
- **Take the four zero-dependency design imports above regardless.**

### Sources

- [DBOS architecture](https://docs.dbos.dev/architecture) · [DBOS config](https://docs.dbos.dev/python/reference/configuration) · [DBOS contexts](https://docs.dbos.dev/python/reference/contexts) · [DBOS workflows](https://docs.dbos.dev/python/tutorials/workflow-tutorial) · [dbos-transact-py](https://github.com/dbos-inc/dbos-transact-py)
- [Restate awakeables](https://docs.restate.dev/develop/python/awakeables) · [Restate quickstart](https://docs.restate.dev/quickstart) · [restate LICENSE (BUSL-1.1)](https://raw.githubusercontent.com/restatedev/restate/main/LICENSE)
- [Inngest wait-for-event](https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-event) · [inngest LICENSE.md (SSPL)](https://raw.githubusercontent.com/inngest/inngest/main/LICENSE.md)
- [Hatchet durable execution](https://docs.hatchet.run/home/durable-execution) · [Hatchet durable event waits](https://docs.hatchet.run/v1/durable-event-waits) · [Hatchet self-hosting](https://docs.hatchet.run/self-hosting/docker-compose)
- [Temporal CLI dev server](https://docs.temporal.io/cli/server)
- [Windmill self-host](https://www.windmill.dev/docs/advanced/self_host) · [windmill LICENSE](https://raw.githubusercontent.com/windmill-labs/windmill/main/LICENSE)
- [Prefect interactive workflows](https://docs.prefect.io/v3/advanced/interactive)
- [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence) · [LangGraph interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts) · [langgraph repo](https://github.com/langchain-ai/langgraph)
- [Apache Burr](https://burr.apache.org/) · [burr repo](https://github.com/apache/burr)
- [PocketFlow](https://github.com/The-Pocket/PocketFlow) · [pydantic-ai repo + V2 migration guide](https://github.com/pydantic/pydantic-ai) · [openai-agents-python](https://github.com/openai/openai-agents-python) · [Mastra](https://github.com/mastra-ai/mastra) · [Google ADK](https://github.com/google/adk-python) · [AG2](https://github.com/ag2ai/ag2) · [CrewAI](https://github.com/crewAIInc/crewAI)
- On hand-rolled SQLite durable execution being ~200 lines: [Gunnar Morling, "Building a Durable Execution Engine With SQLite"](https://www.morling.dev/blog/building-durable-execution-engine-with-sqlite/) · [Pedro Alonso, "Durable LLM Agent Workflows on SQLite"](https://www.pedroalonso.net/blog/durable-llm-workflows-sqlite/) · [obeli.sk, "SQLite is All You Need for Durable Workflows"](https://obeli.sk/blog/sqlite-is-all-you-need-for-durable-workflows/)
