"""FastAPI control plane (§1, §6, §7). Wires engine/ (pure) to store/aws_layer/replay/apply/llm.

Works fully offline in AWS_MODE=fake (default): no AWS credentials, no real VM required.
"""
from __future__ import annotations

import os
import secrets
import socket
import time
from pathlib import Path
from typing import Literal

import yaml
from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError

from engine import attack as attack_engine
from engine import drift as drift_engine
from engine import exposure as exposure_engine
from engine import failure as failure_engine
from engine import performance as performance_engine
from engine import remediate as remediate_engine
from engine.models import AgentSnapshot, Finding, Patch, TwinConfig
from engine.twin import build_twin

from backend import llm as llm_engine
from backend.apply import Applier, ApplyError
from backend.aws_layer import FakeAws, get_aws_source
from backend.replay import ReplayState
from backend.store import Store

REPO_ROOT = Path(__file__).resolve().parent.parent
FIXTURES_DIR = REPO_ROOT / "fixtures"
PROBE_TIMEOUT_SECONDS = 2.0
DEFAULT_SG_ID = "sg-0abc123"
# A real agent (agent/agent.py) sends its slow-cadence fields (listeners/conns/etc.)
# at least this often (default 10s) -- twice that with no ingest means the agent
# process has actually stopped, not just between ticks.
LIVE_STALE_SECONDS = 30.0


class LiveModeConflict(Exception):
    """Raised when a demo/replay action is attempted while a real agent is connected
    (§21: demo data must never silently overwrite/mix with live telemetry)."""


class NoTwinConnected(Exception):
    """Raised when no agent has ever connected and demo/replay mode hasn't been
    explicitly activated -- there is no twin to build yet."""


def probe_tcp(host: str, port: int, timeout: float = PROBE_TIMEOUT_SECONDS) -> dict:
    """TCP connect probe. Distinguishes a confirmed-closed port (refused/timeout) from
    an ambiguous failure (DNS, routing, etc.) so callers never mistake "unknown" for "fixed"."""
    start = time.monotonic()
    try:
        with socket.create_connection((host, port), timeout=timeout):
            status, reason = "reachable", None
    except socket.timeout:
        status, reason = "unreachable", "timeout"
    except ConnectionRefusedError:
        status, reason = "unreachable", "connection_refused"
    except (OSError, OverflowError) as exc:
        # OverflowError: some platforms raise this (not an OSError subclass) for a port
        # outside 0-65535 -- must still resolve to a safe "unknown", never an unhandled 500.
        status, reason = "unknown", str(exc)
    elapsed_ms = int((time.monotonic() - start) * 1000)
    return {"host": host, "port": port, "status": status, "reason": reason, "elapsed_ms": elapsed_ms}


class Backend:
    """Holds runtime state and wires HTTP handlers to pure engine/ calls. Framework-free
    so it can be unit tested directly, without going through FastAPI."""

    def __init__(
        self,
        fixtures_dir: Path = FIXTURES_DIR,
        db_path: str = ":memory:",
        audit_path: Path | None = None,
        ingest_token: str | None = None,
        configured_sg_id: str = DEFAULT_SG_ID,
        agent_port: int | None = None,
    ):
        self.fixtures_dir = Path(fixtures_dir)
        self.twin_config = TwinConfig.model_validate(
            yaml.safe_load((self.fixtures_dir / "twin.yaml").read_text())
        )
        self.store = Store(db_path)
        self.aws_source = get_aws_source(self.fixtures_dir, scenario="healthy")
        self.replay = ReplayState(self.fixtures_dir)
        self.ingest_token = ingest_token or os.environ.get("INGEST_TOKEN", "dev-token")
        self.applier = Applier(
            configured_sg_id=configured_sg_id,
            audit_path=audit_path or (REPO_ROOT / "audit.jsonl"),
            agent_port=agent_port,
        )
        self._latest_agent: AgentSnapshot | None = None
        self._drift_prev_fp: dict | None = None
        # No agent has ever connected and no one has explicitly asked for demo data
        # yet -- the default MUST be "unconnected", never a silent fixture fallback.
        self._mode: Literal["unconnected", "demo", "live"] = "unconnected"
        self._last_ingest_ts: float | None = None
        self._connected_agent_id: str | None = None

    # -- agent registration ---------------------------------------------

    def register_agent(self) -> dict:
        agent_id = f"agent-{secrets.token_hex(4)}"
        token = secrets.token_urlsafe(24)
        self.store.create_agent(agent_id, token)
        return {"agent_id": agent_id, "token": token}

    # -- ingestion ----------------------------------------------------

    def ingest(self, snapshot: AgentSnapshot, agent_id: str = "default") -> None:
        self._latest_agent = snapshot
        self._mode = "live"  # sticky for the process lifetime once a real agent connects
        self._last_ingest_ts = time.time()
        self._connected_agent_id = agent_id
        self.store.touch_agent(agent_id, snapshot.host.hostname, ts=snapshot.ts)
        self.store.add_snapshot("agent", snapshot.model_dump(mode="json"), ts=snapshot.ts)
        self._recompute_drift()

    # -- twin -----------------------------------------------------------

    def build_twin(self):
        if self._mode == "unconnected":
            raise NoTwinConnected("no VM connected -- connect an agent or enable demo/replay mode")
        if self._latest_agent is not None:
            agent = self._latest_agent
        else:
            agent, _ = self.replay.load()
        aws = self.aws_source.get_snapshot()
        return build_twin(agent, aws, self.twin_config)

    def _recompute_drift(self) -> None:
        G = self.build_twin()
        fp = drift_engine.fingerprint(G)
        if self._drift_prev_fp is not None:
            for ev in drift_engine.diff(self._drift_prev_fp, fp, ts=time.time()):
                self.store.add_event(ev.type, ev.model_dump())
        self._drift_prev_fp = fp

    def get_twin_json(self) -> dict:
        last_seen_ago = time.time() - self._last_ingest_ts if self._last_ingest_ts is not None else None
        connected = self._mode == "live" and last_seen_ago is not None and last_seen_ago <= LIVE_STALE_SECONDS
        if self._mode == "unconnected":
            return {
                "nodes": [],
                "edges": [],
                "mode": self._mode,
                "connected": False,
                "last_seen_seconds_ago": None,
                "agent_id": None,
                "hostname": None,
            }
        G = self.build_twin()
        nodes = [{"id": n, **d} for n, d in G.nodes(data=True)]
        edges = [{"src": u, "dst": v, **d} for u, v, d in G.edges(data=True)]
        hostname = self._latest_agent.host.hostname if self._latest_agent is not None else None
        return {
            "nodes": nodes,
            "edges": edges,
            "mode": self._mode,
            "connected": connected,
            "last_seen_seconds_ago": last_seen_ago,
            "agent_id": self._connected_agent_id,
            "hostname": hostname,
        }

    def connection_status(self) -> dict:
        twin = self.get_twin_json()
        return {
            "mode": twin["mode"],
            "connected": twin["connected"],
            "agent_id": twin["agent_id"],
            "hostname": twin["hostname"],
            "last_seen_seconds_ago": twin["last_seen_seconds_ago"],
        }

    def processes(self) -> dict:
        if self._latest_agent is None:
            return {"available": False}
        return {
            "available": True,
            "processes": [p.model_dump() for p in self._latest_agent.processes],
            "listeners": [ln.model_dump() for ln in self._latest_agent.listeners],
        }

    # -- agent registry ---------------------------------------------------

    def _agent_view(self, row: dict) -> dict:
        connected = (
            row["agent_id"] == self._connected_agent_id
            and self._mode == "live"
            and self._last_ingest_ts is not None
            and (time.time() - self._last_ingest_ts) <= LIVE_STALE_SECONDS
        )
        last_seen_ts = row["last_seen_ts"]
        return {
            "agent_id": row["agent_id"],
            "hostname": row["hostname"],
            "created_at": row["created_ts"],
            "last_seen": last_seen_ts,
            "last_seen_seconds_ago": (time.time() - last_seen_ts) if last_seen_ts is not None else None,
            "connected": connected,
        }

    def list_agents(self) -> list[dict]:
        return [self._agent_view(row) for row in self.store.list_agents()]

    def agent_detail(self, agent_id: str) -> dict:
        row = self.store.get_agent(agent_id)
        if row is None:
            raise KeyError(agent_id)
        return self._agent_view(row)

    def agent_status(self, agent_id: str) -> dict:
        view = self.agent_detail(agent_id)
        return {
            "agent_id": view["agent_id"],
            "connected": view["connected"],
            "last_seen_seconds_ago": view["last_seen_seconds_ago"],
        }

    # -- scan ---------------------------------------------------------------

    def scan(self) -> dict:
        """Recompute the twin + exposure + SPOF from the most recently *received*
        telemetry. Cannot ask the agent to collect fresh data on demand -- telemetry
        is strictly one-way (agent -> backend); the backend never commands the agent.
        """
        G = self.build_twin()
        findings = exposure_engine.exposed_all(G)
        spof_result = failure_engine.spof(G, self.twin_config)
        scanned_at = time.time()
        self.store.add_event("SCAN_COMPLETE", {"scanned_at": scanned_at, "finding_count": len(findings)})
        return {
            "status": "complete",
            "scanned_at": scanned_at,
            "mode": self._mode,
            "twin": self.get_twin_json(),
            "findings": [f.model_dump() for f in findings],
            "spof": spof_result,
        }

    # -- findings ---------------------------------------------------------

    def findings(self) -> list[Finding]:
        return exposure_engine.exposed_all(self.build_twin())

    def find_finding(self, finding_id: str) -> Finding | None:
        return next((f for f in self.findings() if f.id == finding_id), None)

    # -- simulation ---------------------------------------------------------

    def simulate_failure(self, node: str) -> dict:
        G = self.build_twin()
        if node not in G.nodes:
            raise KeyError(node)
        return failure_engine.simulate_failure(G, node, self.twin_config)

    def simulate_attack(self, entry_type: str, node: str) -> dict:
        G = self.build_twin()
        if node not in G.nodes:
            raise KeyError(node)
        return attack_engine.simulate_attack(G, entry_type, node)

    def spof(self) -> list[dict]:
        return failure_engine.spof(self.build_twin(), self.twin_config)

    # -- performance ---------------------------------------------------------

    def performance(self) -> dict:
        agent = self._latest_agent
        if agent is None or agent.cpu is None and agent.memory is None:
            return {
                "available": False,
                "reason": "no live telemetry yet (demo/replay mode has no CPU/memory data)",
                "source": self._mode,
            }
        diagnosis = performance_engine.diagnose(
            cpu=agent.cpu.model_dump() if agent.cpu else None,
            memory=agent.memory.model_dump() if agent.memory else None,
            disks=[d.model_dump() for d in agent.disks],
            processes=[p.model_dump() for p in agent.processes],
        )
        raw_history = [
            s["payload"]
            for s in self.store.list_snapshots("agent", limit=40)
            if s["payload"].get("cpu") and s["payload"]["cpu"].get("percent") is not None
        ]
        raw_history.reverse()  # store returns newest-first; history wants oldest-first
        samples = [
            {"ts": s["ts"], "cpu_percent": s["cpu"]["percent"], "memory_percent": (s.get("memory") or {}).get("percent")}
            for s in raw_history
        ]
        history = performance_engine.summarize_history(samples)
        return {
            "available": True,
            "source": self._mode,
            "observed": diagnosis["observed"],
            "findings": diagnosis["findings"],
            "explanation": performance_engine.explain(diagnosis),
            "history": history,
        }

    # -- fix / apply / rollback ---------------------------------------------

    def fix_preview(self, finding_id: str) -> dict:
        finding = self.find_finding(finding_id)
        if finding is None:
            raise KeyError(finding_id)
        G = self.build_twin()
        candidates = remediate_engine.candidates(G, finding)
        best = remediate_engine.best_patch(G, finding)
        return {
            "finding": finding.model_dump(),
            "candidates": [c.model_dump() for c in candidates],
            "best_patch_id": best.id if best else None,
        }

    def _find_patch(self, patch_id: str) -> Patch:
        G = self.build_twin()
        for finding in exposure_engine.exposed_all(G):
            for patch in remediate_engine.candidates(G, finding):
                if patch.id == patch_id:
                    return patch
        raise KeyError(patch_id)

    def fix_apply(self, patch_id: str, approve: bool) -> dict:
        patch = self._find_patch(patch_id)
        result = self.applier.apply(patch, approve, self.aws_source)
        self.store.add_event("PATCH_APPLIED", {"patch_id": patch_id})
        return result

    def fix_rollback(self, rollback_id: str) -> dict:
        result = self.applier.rollback(rollback_id, self.aws_source)
        self.store.add_event("PATCH_ROLLED_BACK", {"patch_id": rollback_id})
        return result

    # -- probe ---------------------------------------------------------

    def probe(self, port: int, host: str | None = None) -> dict:
        if host is None:
            host = self.build_twin().graph.get("public_ip")
            if not host:
                raise ValueError("no host available and none provided")
        return probe_tcp(host, port)

    # -- explain ---------------------------------------------------------

    def explain(self, context: dict) -> dict:
        return llm_engine.explain(context)

    # -- replay ---------------------------------------------------------

    def replay_step(self) -> dict:
        if self._mode == "live":
            raise LiveModeConflict("a real agent is connected; demo replay is disabled for this session")
        self._mode = "demo"  # explicit opt-in -- never entered implicitly
        scenario = self.replay.step()
        agent, _aws = self.replay.load()
        self._latest_agent = agent
        if isinstance(self.aws_source, FakeAws):
            self.aws_source.set_scenario(scenario)
        self.store.add_snapshot("agent", agent.model_dump(mode="json"), ts=agent.ts)
        self._recompute_drift()
        return {"scenario": scenario, "twin": self.get_twin_json()}

    def replay_reset(self) -> dict:
        if self._mode == "live":
            raise LiveModeConflict("a real agent is connected; demo replay is disabled for this session")
        self._mode = "demo"  # explicit opt-in -- never entered implicitly
        scenario = self.replay.reset()
        self._latest_agent = None
        self._drift_prev_fp = None
        if isinstance(self.aws_source, FakeAws):
            self.aws_source.set_scenario(scenario)
        return {"scenario": scenario, "twin": self.get_twin_json()}


# ---------------------------------------------------------------------------
# FastAPI wiring
# ---------------------------------------------------------------------------


class ApplyBody(BaseModel):
    approve: bool = False


class FailureBody(BaseModel):
    node: str


class AttackBody(BaseModel):
    entry_type: str
    node: str


class ExplainBody(BaseModel):
    context: dict


def create_app(**backend_kwargs) -> FastAPI:
    backend = Backend(**backend_kwargs)
    app = FastAPI(title="CloudShield Twin")
    app.state.backend = backend
    app.state.ws_clients = set()

    # Local-dev CORS: the web/ frontend (Vite, a different origin/port) calls this API
    # directly from the browser. No new endpoints or logic -- purely enables cross-origin
    # requests for this local demo tool. Configurable for non-default frontend origins.
    # FRONTEND_ORIGIN_REGEX additionally matches a *pattern* of origins -- e.g. a host
    # like Vercel that gives every deployment its own unique subdomain, which a static
    # exact-match list can't keep up with across redeploys.
    frontend_origins = os.environ.get("FRONTEND_ORIGIN", "*")
    frontend_origin_regex = os.environ.get("FRONTEND_ORIGIN_REGEX")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in frontend_origins.split(",")],
        allow_origin_regex=frontend_origin_regex,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(NoTwinConnected)
    async def no_twin_connected_handler(request, exc: NoTwinConnected):
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    async def broadcast(message: dict) -> None:
        stale = []
        for ws in app.state.ws_clients:
            try:
                await ws.send_json(message)
            except Exception:
                stale.append(ws)
        for ws in stale:
            app.state.ws_clients.discard(ws)

    def check_bearer(authorization: str | None = Header(default=None)) -> str:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="missing bearer token")
        token = authorization.removeprefix("Bearer ")
        if token == backend.ingest_token:
            return "default"
        agent_id = backend.store.get_agent_id_by_token(token)
        if agent_id is None:
            raise HTTPException(status_code=401, detail="invalid token")
        return agent_id

    @app.post("/agents/register")
    def register_agent():
        return backend.register_agent()

    @app.get("/connection")
    def connection():
        return backend.connection_status()

    @app.get("/processes")
    def processes():
        return backend.processes()

    @app.get("/agents")
    def list_agents():
        return backend.list_agents()

    @app.get("/agents/{agent_id}")
    def agent_detail(agent_id: str):
        try:
            return backend.agent_detail(agent_id)
        except KeyError:
            raise HTTPException(status_code=404, detail=f"unknown agent {agent_id!r}")

    @app.get("/agents/{agent_id}/status")
    def agent_status(agent_id: str):
        try:
            return backend.agent_status(agent_id)
        except KeyError:
            raise HTTPException(status_code=404, detail=f"unknown agent {agent_id!r}")

    @app.post("/scan")
    async def scan():
        result = backend.scan()
        await broadcast({"type": "SCAN_COMPLETE", "scanned_at": result["scanned_at"]})
        return result

    @app.post("/ingest")
    async def ingest(body: dict, agent_id: str = Depends(check_bearer)):
        try:
            snapshot = AgentSnapshot.model_validate(body)
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail=exc.errors(include_url=False))
        backend.ingest(snapshot, agent_id)
        await broadcast({"type": "INGEST", "ts": snapshot.ts})
        return {"status": "ok"}

    @app.get("/twin")
    def get_twin():
        return backend.get_twin_json()

    @app.post("/simulate/failure")
    def simulate_failure(body: FailureBody):
        try:
            return backend.simulate_failure(body.node)
        except KeyError:
            raise HTTPException(status_code=404, detail=f"unknown node {body.node!r}")

    @app.post("/simulate/attack")
    def simulate_attack(body: AttackBody):
        if body.entry_type not in attack_engine.ENTRY_TYPES:
            raise HTTPException(status_code=400, detail=f"invalid entry_type {body.entry_type!r}")
        try:
            return backend.simulate_attack(body.entry_type, body.node)
        except KeyError:
            raise HTTPException(status_code=404, detail=f"unknown node {body.node!r}")

    @app.get("/spof")
    def spof():
        return backend.spof()

    @app.get("/performance")
    def performance():
        return backend.performance()

    @app.get("/fix/{finding_id}")
    def fix_preview(finding_id: str):
        try:
            return backend.fix_preview(finding_id)
        except KeyError:
            raise HTTPException(status_code=404, detail=f"unknown finding {finding_id!r}")

    @app.post("/fix/{patch_id}/apply")
    async def fix_apply(patch_id: str, body: ApplyBody):
        try:
            result = backend.fix_apply(patch_id, body.approve)
        except KeyError:
            raise HTTPException(status_code=404, detail=f"unknown patch {patch_id!r}")
        except ApplyError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        await broadcast({"type": "PATCH_APPLIED", "patch_id": patch_id})
        return result

    @app.post("/fix/{rollback_id}/rollback")
    async def fix_rollback(rollback_id: str):
        try:
            result = backend.fix_rollback(rollback_id)
        except ApplyError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        await broadcast({"type": "PATCH_ROLLED_BACK", "patch_id": rollback_id})
        return result

    @app.get("/probe")
    def probe(port: int, host: str | None = None):
        try:
            return backend.probe(port, host)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    @app.get("/events")
    def events(limit: int = 100):
        return backend.store.list_events(limit)

    @app.post("/explain")
    def explain(body: ExplainBody):
        return backend.explain(body.context)

    @app.post("/replay/step")
    async def replay_step():
        try:
            result = backend.replay_step()
        except LiveModeConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc))
        await broadcast({"type": "REPLAY_STEP", "scenario": result["scenario"]})
        return result

    @app.post("/replay/reset")
    async def replay_reset():
        try:
            result = backend.replay_reset()
        except LiveModeConflict as exc:
            raise HTTPException(status_code=409, detail=str(exc))
        await broadcast({"type": "REPLAY_RESET", "scenario": result["scenario"]})
        return result

    @app.websocket("/ws")
    async def ws(websocket: WebSocket):
        await websocket.accept()
        app.state.ws_clients.add(websocket)
        try:
            await websocket.send_json({"type": "TWIN", "twin": backend.get_twin_json()})
            while True:
                # Client messages are never parsed/acted on -- this loop only waits for a
                # disconnect. A non-text frame must not crash the connection: receive_text()
                # raises KeyError/RuntimeError (Starlette-version-dependent) for one, not
                # WebSocketDisconnect, so it's caught and ignored here rather than propagating.
                try:
                    await websocket.receive_text()
                except (KeyError, RuntimeError):
                    continue
        except WebSocketDisconnect:
            pass
        finally:
            app.state.ws_clients.discard(websocket)

    return app


app = create_app()
