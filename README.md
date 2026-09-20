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
web/       Vite + React + TypeScript + Tailwind + @xyflow/react + dagre dashboard
fixtures/  healthy / latent / exposed / fixed scenario snapshots + twin.yaml
tests/     pytest suite for engine/ and backend/ (unit, API, integration, security)
```

`Spec.md` §2 also describes an `agent/agent.py` (the read-only monitoring script that
would run on the real EC2 demo VM) and a `demo/` stack (the actual nginx/node-api/
postgres/redis VM setup). **Neither exists in this repository.** Every phase of this
project so far has built and hardened the engine/backend/frontend against `fixtures/`
in fake/replay mode; provisioning a real demo VM and its agent is out of scope for what
has been implemented and would be new, substantial work, not a bug fix.

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
# Engine + backend (unit, API, integration, adversarial/security)
pytest -q
mypy engine backend

# Frontend
cd web
npm run test          # vitest
npm run typecheck     # tsc -b
npm run build         # production build
npm run lint          # oxlint
```

At the time of writing: 110 Python tests (engine, backend unit/API, integration, and a
dedicated adversarial security suite) and 40 frontend tests all pass; `mypy` and
`tsc -b` report no errors; the production build succeeds.

## Known limitations

- `agent/agent.py` and the `demo/` VM stack described in `Spec.md` §2 are not
  implemented — see "Repository layout" above.
- `AWS_MODE=real` and Bedrock have not been exercised against real AWS in any phase;
  only fake/replay mode has automated test coverage.
- There is no dependency lockfile for the Python side (`pyproject.toml` declares
  version ranges, not exact pins).
