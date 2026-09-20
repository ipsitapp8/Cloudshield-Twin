# CloudShield Twin

A live digital twin of a small cloud stack (nginx → node-api → postgres, redis) that
observes real state, simulates failures and attack paths, and proposes/applies narrowly
scoped, auditable remediations.

Loop: **Observe → Understand → Simulate → Remediate → Prove**

See `Spec.md` for the full specification; this README covers setup and day-to-day use.

## Architecture

```
VM (EC2): demo stack (nginx -> node-api -> postgres, redis) + read-only agent
   --HTTPS-->  Control plane (this repo): FastAPI backend + React dashboard
                 |-- boto3 -> EC2/SG/IAM (read); SG revoke/authorize only via approved apply
                 `-- external probe: TCP connect to the VM's public IP (independent proof)
```

`engine/` is pure (no network/file/AWS I/O — dicts and graphs in, dicts out). Everything
else (`backend/`, `web/`) wires that pure logic to HTTP, storage, and AWS.

The whole application runs **fully offline** in replay/fake mode, driven entirely from
`fixtures/` — no AWS credentials, no real VM, no LLM/Bedrock access required.

### Repository layout

```
engine/    pure algorithms: models, twin, exposure, failure, attack, risk, remediate, drift
backend/   FastAPI app: main, store (SQLite), aws_layer (Fake/RealAws), apply, llm, replay
agent/     real-machine telemetry agent (psutil-based) -- LIVE mode's data source
web/       Vite + React + TypeScript + Tailwind + @xyflow/react + dagre dashboard
fixtures/  healthy / latent / exposed / fixed scenario snapshots + twin.yaml (DEMO mode only)
tests/     pytest suite for engine/, agent/, and backend/ (unit, API, integration, security)
```

CloudShield Twin has two independent data sources feeding the same unmodified engine:
**LIVE** (`agent/agent.py`, real telemetry from a real machine — see "Real agent" below)
and **DEMO/replay** (`fixtures/`, offline and deterministic, for tests/demo/development
without a machine to connect). The backend never mixes the two: once a real agent has
sent one snapshot, replay is disabled for that session (see `LiveModeConflict` in
`backend/main.py`). `Spec.md` §2 also describes a `demo/` stack (the actual provisioned
nginx/node-api/postgres/redis EC2 box the fixtures model) — that provisioning work
itself (spinning up a real EC2 box) remains out of scope; the agent that would monitor
one now exists and works against any real machine, EC2 or otherwise.

## Requirements

- Python 3.11+ (backend/engine)
- Node.js 18+ (frontend)

## Setup

```bash
# Python backend/engine
pip install -e ".[dev]"        # fastapi, pydantic, networkx, PyYAML, uvicorn + pytest/mypy
pip install -e ".[aws]"        # optional: only needed for AWS_MODE=real or BEDROCK_ENABLED=true

# Frontend
cd web
npm install
```

## Running

### Backend (fake mode, default — no AWS credentials needed)

```bash
uvicorn backend.main:app --reload --port 8000
```

`AWS_MODE` defaults to `fake`, which reads `fixtures/<scenario>/aws_snapshot.json`
instead of calling AWS. `POST /replay/step` advances through the canned scenario
sequence `healthy -> latent -> exposed -> fixed` (`POST /replay/reset` returns to
`healthy`), updating both the agent and AWS fixture data together.

Set `INGEST_TOKEN` to whatever bearer token the real agent should present to `/ingest`
(defaults to `dev-token` for local use only — override it for anything beyond a laptop
demo).

### Frontend

```bash
cd web
npm run dev
```

By default the frontend calls the backend at `http://localhost:8000` (see
`web/.env.example` — copy to `.env.local` to point at a different backend URL).

The app opens on a landing page explaining the problem and the loop — click
"Launch the Twin" to reach the live dashboard (the tab title in the dashboard header
takes you back to the landing page at any time).

### Real agent (LIVE mode — connect a real machine)

```bash
python -m agent.agent --server http://localhost:8000 --token dev-token
```

This replaces the fixture/replay twin with a live one built from telemetry actually
collected on the machine the agent runs on (via `psutil`): host identity, CPU, memory,
disk, network interfaces, listening ports, connections, and top processes. CPU/memory
refresh every `--fast-interval` seconds (default 3s); listeners/connections/processes/
disks/interfaces refresh every `--slow-interval` seconds (default 10s). The agent only
ever reads system state and makes one outbound `POST /ingest` per tick — no shell
execution, no file writes, no mutation of anything.

Once a real agent has sent even one snapshot, the backend switches to **LIVE mode for
the rest of that process's lifetime**: `/replay/step` and `/replay/reset` are rejected
(409) so demo fixture data can never silently overwrite real telemetry, and `GET /twin`
reports `mode: "live"` plus `connected`/`last_seen_seconds_ago` (surfaced in the
dashboard header as "LIVE ●" / "LIVE (stale)"). Nodes that aren't actually running on
the connected machine (e.g. nginx/redis/postgres from the demo fixtures) simply don't
appear — nothing is invented.

This has been verified against a real machine (this dev environment): real hostname,
real running processes, and a manually-opened test TCP listener all appeared in the
live twin within one slow-refresh cycle, with no process killed and no system state
changed. `AWS_MODE` is independent of this — LIVE agent telemetry still pairs with
`fake` (default) or `real` AWS data for the security-exposure layer.

### Performance — "Why is my VM slow?"

Once a real agent is connected, the **Performance** tab (`GET /performance`) answers
this from the actual telemetry: observed CPU/memory/swap/disk numbers, a deterministic
evidence-backed diagnosis (`engine/performance.py` — e.g. `CPU_BOTTLENECK` only fires
above a threshold, with `high` confidence only when one process explains most of the
usage; `SWAP_PRESSURE`/`MEMORY_PRESSURE`/`DISK_SPACE_PRESSURE` similarly threshold-
and evidence-based; `NO_BOTTLENECK_DETECTED` when nothing crosses a threshold), a
plain-English conclusion citing the exact numbers (never an LLM guess — `POST
/explain` with `kind: "performance"` also routes through this same deterministic
function), and a short history table built from already-stored snapshots (no new
persistence). In demo/replay mode this reports `available: false` rather than
fabricating numbers, since fixtures carry no CPU/memory telemetry.

Live-verified against this dev machine: real CPU (~10%), memory (~79%), swap (~15%,
which correctly triggered a `SWAP_PRESSURE` finding citing that exact number), and
disk usage all reported, with history accumulating real samples over time. One
Windows-specific rough edge observed during verification: `psutil`'s "System Idle
Process" can report a nonsensical `cpu_percent` (e.g. >1000%) as a platform quirk of
per-process CPU accounting on Windows — it doesn't affect the bottleneck thresholds
(which key off total CPU%, not the flagged top process) but is worth knowing about.

### Real AWS mode (not exercised by the test suite)

```bash
AWS_MODE=real AWS_INSTANCE_ID=i-xxxx AWS_REGION=us-east-1 uvicorn backend.main:app
```

This requires real AWS credentials (via the standard boto3 credential chain) and a real
EC2 instance. **This mode has not been live-tested against real AWS in any phase of this
project** — only `AWS_MODE=fake` (the default) has been exercised, including in the
automated test suite. `RealAws` performs read-only `describe_*` calls plus the single
allowlisted SG revoke/authorize mutation used by the apply flow; review `backend/aws_layer.py`
before pointing it at real infrastructure.

### Bedrock (optional; disabled by default)

`POST /explain` works with **zero AI configuration** via a deterministic template. Set
`BEDROCK_ENABLED=true` (plus `AWS_REGION` and AWS credentials) to have it call Amazon
Bedrock instead; on any failure, timeout, or missing configuration it safely falls back
to the same deterministic template and labels the response accordingly
(`generated_by: "deterministic"` vs `"ai"`). The model only ever receives structured
JSON (already-computed finding/failure/attack/risk output) and its reply is treated as
inert display text — never parsed as a command, never executed, never fed back into the
engine, backend, or apply layer.

## Safety model (non-negotiable, per `Spec.md` §7)

- The agent is read-only and only ever pushes data outbound.
- `apply` is allowlist-only: it can only revoke/authorize an inbound rule on the one
  configured security group and the one port a computed patch targets. Port 22 and the
  configured agent-channel port can never be touched, regardless of what a patch claims.
- `GET /fix/{finding_id}` is preview-only and never mutates anything. Applying always
  requires `approve: true` explicitly.
- No endpoint accepts an arbitrary AWS CLI/Terraform/iptables command from a client —
  only a `patch_id` string is accepted, and the backend looks up its own
  server-computed candidate for it. There is no shell/subprocess execution anywhere in
  `engine/` or `backend/` (verified by both manual review and an automated structural
  regression test).
- Every successful apply/rollback is appended to `audit.jsonl`; rejected attempts never
  write an audit entry claiming otherwise. Rollback commands are stored per-patch at
  apply time, so rollback can only ever reverse a change the backend itself already made
  and validated — not an arbitrary caller-supplied action.
- Attack-path simulation only ever produces paths tagged `"potential"` — it never
  represents a confirmed compromise.

## Testing

```bash
# Engine + backend + agent (unit, API, integration, adversarial/security, live-mode)
pytest -q
mypy engine backend agent

# Frontend
cd web
npm run test          # vitest
npm run typecheck     # tsc -b
npm run build         # production build
npm run lint          # oxlint
```

At the time of writing: 148 Python tests (engine incl. performance diagnosis, agent
unit tests, backend unit/API/live-mode/performance, integration, and a dedicated
adversarial security suite) and 52 frontend tests all pass; `mypy` and `tsc -b` report
no errors; the production build succeeds. Agent collectors and the performance engine
are unit-tested deterministically (no dependency on the CI machine's actual state) and
separately verified live against a real machine — see "Real agent (LIVE mode)" and
"Performance" above.

## Known limitations

- The `demo/` VM stack described in `Spec.md` §2 (the actual provisioned nginx/node/
  postgres/redis EC2 box) is not implemented — only the agent that would monitor such
  a box exists. `agent/agent.py` now exists and is real, but has only been verified
  against local Linux/Windows dev machines, not a real EC2 instance.
- Docker/container telemetry, network-anomaly analysis, telemetry trend charts beyond
  the simple history table, and a snapshot-upload flow are not implemented yet — raw
  telemetry needed for these is already being captured and stored, but no analysis/UI
  for them exists.
- Performance diagnosis's disk findings cover disk *space* usage only, not I/O
  wait/throughput — psutil doesn't expose I/O wait % cross-platform, so this was left
  out rather than approximated with a fabricated number.
- `psutil`'s "System Idle Process" can report a nonsensical `cpu_percent` on Windows
  (observed during live verification) — a platform quirk, not a bug in the diagnosis
  logic, which keys off total CPU% for its threshold, not the flagged top process.
- `AWS_MODE=real` and Bedrock have not been exercised against real AWS in any phase;
  only fake/replay mode has automated test coverage.
- The agent has been live-verified on Windows (this dev environment) via `psutil`,
  which is genuinely cross-platform, but has not yet been run against a real Linux VM
  or macOS machine.
- There is no dependency lockfile for the Python side (`pyproject.toml` declares
  version ranges, not exact pins).
