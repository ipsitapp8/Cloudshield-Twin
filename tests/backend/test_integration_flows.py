"""Phase 4: engine -> backend integration, end to end, through the real HTTP API.

Each test drives the actual FastAPI app (backend/main.py) wired to the real engine/
algorithms and FakeAws/replay fixtures -- no mocking of engine or backend internals.
Only socket.create_connection is mocked (for /probe), since the fixtures' fake public
IP is not a real reachable/unreachable host from this machine.

Mirrors the flow checklist from the Phase 4 request, numbered to match.
"""
import json
import socket

import pytest
from fastapi.testclient import TestClient

from backend.main import create_app

SG_ID = "sg-0abc123"


def make_client(tmp_path, **backend_kwargs):
    app = create_app(
        audit_path=tmp_path / "audit.jsonl",
        db_path=str(tmp_path / "store.db"),
        ingest_token="test-token",
        **backend_kwargs,
    )
    return TestClient(app), app.state.backend


# 1. HEALTHY -----------------------------------------------------------------


def test_1_healthy_twin_renders_and_redis_is_not_falsely_exposed(tmp_path):
    client, _ = make_client(tmp_path)
    client.post("/replay/reset")  # explicit demo activation -- fixtures are never a passive default

    twin = client.get("/twin").json()
    node_ids = {n["id"] for n in twin["nodes"]}
    assert {"nginx", "api", "postgres", "redis", "internet"}.issubset(node_ids)
    redis_node = next(n for n in twin["nodes"] if n["id"] == "redis")
    assert redis_node["bind"] == "127.0.0.1"

    finding = client.get("/fix/exposure-redis").json()["finding"]
    assert finding["status"] != "exposed"
    assert finding["status"] == "closed"


# 2. LATENT --------------------------------------------------------------------


def test_2_replay_healthy_to_latent_reports_latent_not_exposed(tmp_path):
    client, _ = make_client(tmp_path)

    step = client.post("/replay/step").json()
    assert step["scenario"] == "latent"

    finding = client.get("/fix/exposure-redis").json()["finding"]
    assert finding["status"] == "latent"
    assert finding["status"] != "exposed"
    assert finding["evidence"]["sg"] is True
    assert finding["evidence"]["bind"] is False


# 3. EXPOSED ---------------------------------------------------------------------


def test_3_replay_latent_to_exposed_full_chain(tmp_path):
    client, _ = make_client(tmp_path)
    client.post("/replay/step")  # -> latent
    step = client.post("/replay/step").json()  # -> exposed
    assert step["scenario"] == "exposed"

    preview = client.get("/fix/exposure-redis").json()
    finding = preview["finding"]
    assert finding["status"] == "exposed"
    # 3-layer evidence, all confirmed true
    assert finding["evidence"] == {"bind": True, "host_fw": True, "sg": True}

    best = next(c for c in preview["candidates"] if c["id"] == preview["best_patch_id"])
    assert best["before"]["band"] == "HIGH"
    assert best["before"]["attack_surface"] > 3

    attack = client.post(
        "/simulate/attack", json={"entry_type": "public_service", "node": "internet"}
    ).json()
    assert "demo-data" in attack["paths"]
    path_info = attack["paths"]["demo-data"]
    assert path_info["path"] == [
        "internet",
        "redis",
        "i-0123456789abcdef0",
        "imds",
        "arn:aws:iam::123456789012:role/demo-role",
        "demo-data",
    ]
    assert path_info["potential"] is True
    assert "T1190" in path_info["mitre"]
    assert "T1552.005" in path_info["mitre"]


# 4. FAILURE -----------------------------------------------------------------------


def test_4_redis_failure_propagates_correctly_while_exposed(tmp_path):
    client, _ = make_client(tmp_path)
    client.post("/replay/step")  # latent
    client.post("/replay/step")  # exposed

    result = client.post("/simulate/failure", json={"node": "redis"}).json()
    assert result["affected_services"]["api"] == "degraded"
    assert result["affected_endpoints"]["/checkout"] == "FAILED"
    assert result["affected_endpoints"]["/products"] == "DEGRADED"


# 5. REMEDIATION ----------------------------------------------------------------


def test_5_remediation_preview_before_after_and_safety(tmp_path):
    client, _ = make_client(tmp_path)
    client.post("/replay/step")  # latent
    client.post("/replay/step")  # exposed

    preview = client.get("/fix/exposure-redis").json()
    best = next(c for c in preview["candidates"] if c["id"] == preview["best_patch_id"])

    assert best["op"] == "sg_revoke"
    assert best["accepted"] is True
    assert best["after"]["attack_surface"] < best["before"]["attack_surface"]
    assert not any("port 22" in cmd or "--port 22" in cmd for cmd in best["aws_cli"])
    assert best["invariants"]["no_flows_removed"] is True
    assert best["invariants"]["port22_and_agent_untouched"] is True

    # the other candidates are rejected specifically for touching the real observed flow
    rejected = [c for c in preview["candidates"] if c["id"] != best["id"]]
    assert len(rejected) == 2
    for patch in rejected:
        assert patch["accepted"] is False
        assert patch["invariants"]["no_flows_removed"] is False


# 6. APPLY SAFETY ------------------------------------------------------------------


def test_6a_apply_without_approve_fails(tmp_path):
    client, _ = make_client(tmp_path)
    client.post("/replay/step")
    client.post("/replay/step")
    patch_id = client.get("/fix/exposure-redis").json()["best_patch_id"]

    resp = client.post(f"/fix/{patch_id}/apply", json={"approve": False})
    assert resp.status_code == 400


def test_6b_apply_to_unauthorized_security_group_fails(tmp_path):
    # The fixture's real SG is sg-0abc123; configure the allowlist to a different one to
    # prove the real preview-generated patch is rejected end to end, not just in a unit test.
    client, _ = make_client(tmp_path, configured_sg_id="sg-NOT-ALLOWLISTED")
    client.post("/replay/step")
    client.post("/replay/step")
    patch_id = client.get("/fix/exposure-redis").json()["best_patch_id"]
    assert patch_id is not None

    resp = client.post(f"/fix/{patch_id}/apply", json={"approve": True})
    assert resp.status_code == 400
    assert "allowlisted" in resp.json()["detail"]


def test_6c_apply_touching_protected_agent_port_fails(tmp_path):
    # redis listens on 6379 in the exposed fixture; configuring that as the agent channel
    # proves the backend's independent apply-time safety net blocks it even though the
    # engine's own preview marked the patch "accepted".
    client, _ = make_client(tmp_path, agent_port=6379)
    client.post("/replay/step")
    client.post("/replay/step")
    preview = client.get("/fix/exposure-redis").json()
    patch_id = preview["best_patch_id"]
    best = next(c for c in preview["candidates"] if c["id"] == patch_id)
    assert best["accepted"] is True  # engine-level: fine

    resp = client.post(f"/fix/{patch_id}/apply", json={"approve": True})
    assert resp.status_code == 400  # backend-level: still blocked
    assert "protected" in resp.json()["detail"]


def test_6d_successful_apply_rollback_audit(tmp_path):
    client, backend = make_client(tmp_path)
    client.post("/replay/step")
    client.post("/replay/step")
    patch_id = client.get("/fix/exposure-redis").json()["best_patch_id"]

    apply_resp = client.post(f"/fix/{patch_id}/apply", json={"approve": True})
    assert apply_resp.status_code == 200
    assert apply_resp.json()["status"] == "applied"

    # rollback information stored
    assert backend.applier.get_rollback(patch_id) is not None

    # audit.jsonl contains the mutation, only structured fields -- no shell/iptables/terraform
    lines = backend.applier.audit_path.read_text().strip().splitlines()
    assert len(lines) == 1
    entry = json.loads(lines[0])
    assert entry["action"] == "apply"
    assert entry["patch_id"] == patch_id
    assert all(cmd.startswith("aws ec2 ") for cmd in entry["aws_cli"])
    assert "iptables" not in entry and "terraform" not in entry

    # redis is no longer exposed after the real SG mutation took effect
    finding = client.get("/fix/exposure-redis").json()["finding"]
    assert finding["status"] != "exposed"

    rollback_resp = client.post(f"/fix/{patch_id}/rollback")
    assert rollback_resp.status_code == 200
    assert rollback_resp.json()["status"] == "rolled_back"
    assert backend.applier.get_rollback(patch_id) is None

    lines_after = backend.applier.audit_path.read_text().strip().splitlines()
    assert len(lines_after) == 2
    assert json.loads(lines_after[1])["action"] == "rollback"

    # rollback actually restored the exposure (SG rule re-added)
    finding_after_rollback = client.get("/fix/exposure-redis").json()["finding"]
    assert finding_after_rollback["status"] == "exposed"


def test_6e_no_host_or_terraform_layer_can_ever_be_applied(tmp_path):
    client, _ = make_client(tmp_path)
    client.post("/replay/step")
    client.post("/replay/step")
    preview = client.get("/fix/exposure-redis").json()

    for patch in preview["candidates"]:
        if patch["layer"] == "aws":
            continue
        resp = client.post(f"/fix/{patch['id']}/apply", json={"approve": True})
        assert resp.status_code == 400
        assert "preview-only" in resp.json()["detail"]


# 7. REPLAY --------------------------------------------------------------------------


def test_7_full_replay_progression_and_fixed_state_reflected(tmp_path):
    client, _ = make_client(tmp_path)

    assert client.post("/replay/step").json()["scenario"] == "latent"
    assert client.post("/replay/step").json()["scenario"] == "exposed"
    fixed_step = client.post("/replay/step").json()
    assert fixed_step["scenario"] == "fixed"

    # the "fixed" scenario is the exposed state with the SG revoke already applied:
    # backend/frontend contract for this is GET /twin (host bind unchanged) + GET /fix (status)
    twin = client.get("/twin").json()
    redis_node = next(n for n in twin["nodes"] if n["id"] == "redis")
    assert redis_node["bind"] == "0.0.0.0"  # host-level state untouched by an AWS-layer fix

    finding = client.get("/fix/exposure-redis").json()["finding"]
    assert finding["status"] == "internal"  # not exposed (SG closed), not closed (still bound wide)
    assert finding["status"] != "exposed"

    # stepping past the end stays at fixed rather than erroring
    assert client.post("/replay/step").json()["scenario"] == "fixed"


# 8. EXPLAIN -----------------------------------------------------------------------


def test_8_explain_deterministic_without_bedrock(tmp_path, monkeypatch):
    monkeypatch.delenv("BEDROCK_ENABLED", raising=False)
    client, _ = make_client(tmp_path)
    client.post("/replay/step")
    client.post("/replay/step")
    finding = client.get("/fix/exposure-redis").json()["finding"]

    resp = client.post("/explain", json={"context": {"kind": "finding", **finding}})
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "template"
    assert body["generated_by"] == "deterministic"
    assert "redis" in body["text"]


def test_8_explain_only_ever_receives_structured_json(tmp_path):
    # /explain's schema only accepts a `context: dict` -- passing a raw string/command is
    # rejected by FastAPI's request validation before it ever reaches the LLM layer.
    client, _ = make_client(tmp_path)
    resp = client.post("/explain", json={"context": "rm -rf /"})
    assert resp.status_code == 422


# 9. PROBE -----------------------------------------------------------------------


def test_9_probe_reachable(tmp_path, monkeypatch):
    client, _ = make_client(tmp_path)
    client.post("/replay/reset")

    class FakeSocket:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    monkeypatch.setattr(socket, "create_connection", lambda addr, timeout: FakeSocket())
    resp = client.get("/probe", params={"port": 6379})
    assert resp.status_code == 200
    assert resp.json()["status"] == "reachable"


def test_9_probe_unreachable_and_ambiguous_never_claim_fixed(tmp_path, monkeypatch):
    client, _ = make_client(tmp_path)
    client.post("/replay/reset")

    monkeypatch.setattr(
        socket, "create_connection", lambda addr, timeout: (_ for _ in ()).throw(socket.timeout())
    )
    timeout_resp = client.get("/probe", params={"port": 6379}).json()
    assert timeout_resp["status"] == "unreachable"
    assert timeout_resp["reason"] == "timeout"

    monkeypatch.setattr(
        socket, "create_connection", lambda addr, timeout: (_ for _ in ()).throw(OSError("no route to host"))
    )
    ambiguous_resp = client.get("/probe", params={"port": 6379}).json()
    assert ambiguous_resp["status"] == "unknown"
    assert ambiguous_resp["status"] != "reachable"
    # nothing in the payload claims the target is fixed/closed -- only "unknown"
    assert set(ambiguous_resp.keys()) == {"host", "port", "status", "reason", "elapsed_ms"}


# 10. WEBSOCKET / EVENTS -----------------------------------------------------------


def test_10_websocket_and_events_reach_the_client_live(tmp_path):
    client, backend = make_client(tmp_path)

    with client.websocket_connect("/ws") as ws:
        initial = ws.receive_json()
        assert initial["type"] == "TWIN"

        client.post("/replay/step")  # -> latent
        step_msg = ws.receive_json()
        assert step_msg["type"] == "REPLAY_STEP"
        assert step_msg["scenario"] == "latent"

        client.post("/replay/step")  # -> exposed
        ws.receive_json()

        patch_id = client.get("/fix/exposure-redis").json()["best_patch_id"]
        client.post(f"/fix/{patch_id}/apply", json={"approve": True})
        applied_msg = ws.receive_json()
        assert applied_msg["type"] == "PATCH_APPLIED"
        assert applied_msg["patch_id"] == patch_id

    # events are independently retrievable via REST too (not only pushed over the socket) --
    # this is what lets the frontend catch up after a reconnect without a full page reload.
    events = client.get("/events").json()
    event_types = {e["type"] for e in events}
    assert "NEW_EXPOSURE" in event_types
    assert "PATCH_APPLIED" in event_types
