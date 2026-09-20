"""FastAPI control plane (§1, §6, §7). Wires engine/ (pure) to store/aws_layer/replay/apply/llm.

Works fully offline in AWS_MODE=fake (default): no AWS credentials, no real VM required.
"""
from __future__ import annotations

import os
import socket
import time
from pathlib import Path

import yaml
from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ValidationError

from engine import attack as attack_engine
from engine import drift as drift_engine
from engine import exposure as exposure_engine
from engine import failure as failure_engine
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

    # -- ingestion ----------------------------------------------------

    def ingest(self, snapshot: AgentSnapshot) -> None:
        self._latest_agent = snapshot
        self.store.add_snapshot("agent", snapshot.model_dump(mode="json"), ts=snapshot.ts)
        self._recompute_drift()

    # -- twin -----------------------------------------------------------

    def build_twin(self):
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
        G = self.build_twin()
        nodes = [{"id": n, **d} for n, d in G.nodes(data=True)]
        edges = [{"src": u, "dst": v, **d} for u, v, d in G.edges(data=True)]
        return {"nodes": nodes, "edges": edges}

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
        scenario = self.replay.step()
        agent, _aws = self.replay.load()
        self._latest_agent = agent
        if isinstance(self.aws_source, FakeAws):
            self.aws_source.set_scenario(scenario)
        self.store.add_snapshot("agent", agent.model_dump(mode="json"), ts=agent.ts)
        self._recompute_drift()
        return {"scenario": scenario, "twin": self.get_twin_json()}

    def replay_reset(self) -> dict:
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
    frontend_origins = os.environ.get("FRONTEND_ORIGIN", "*")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in frontend_origins.split(",")],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    async def broadcast(message: dict) -> None:
        stale = []
        for ws in app.state.ws_clients:
            try:
                await ws.send_json(message)
            except Exception:
                stale.append(ws)
        for ws in stale:
            app.state.ws_clients.discard(ws)

    def check_bearer(authorization: str | None = Header(default=None)) -> None:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="missing bearer token")
        if authorization.removeprefix("Bearer ") != backend.ingest_token:
            raise HTTPException(status_code=401, detail="invalid token")

    @app.post("/ingest")
    async def ingest(body: dict, _auth: None = Depends(check_bearer)):
        try:
            snapshot = AgentSnapshot.model_validate(body)
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail=exc.errors(include_url=False))
        backend.ingest(snapshot)
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
        result = backend.replay_step()
        await broadcast({"type": "REPLAY_STEP", "scenario": result["scenario"]})
        return result

    @app.post("/replay/reset")
    async def replay_reset():
        result = backend.replay_reset()
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
