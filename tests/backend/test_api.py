import json


def test_fake_mode_works_without_aws_credentials(client, monkeypatch):
    for var in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"):
        monkeypatch.delenv(var, raising=False)
    client.post("/replay/reset")  # explicit demo activation -- fixtures are never a passive default
    resp = client.get("/twin")
    assert resp.status_code == 200
    body = resp.json()
    assert any(n["id"] == "redis" for n in body["nodes"])


def test_fresh_backend_has_no_twin_until_connected_or_demo_activated(client):
    resp = client.get("/twin")
    assert resp.status_code == 200
    body = resp.json()
    assert body == {
        "nodes": [],
        "edges": [],
        "mode": "unconnected",
        "connected": False,
        "last_seen_seconds_ago": None,
        "agent_id": None,
        "hostname": None,
    }


def test_build_twin_backed_endpoints_409_while_unconnected(client):
    resp = client.post("/simulate/failure", json={"node": "redis"})
    assert resp.status_code == 409
    resp = client.get("/spof")
    assert resp.status_code == 409


def test_ingest_requires_bearer_token(client):
    resp = client.post("/ingest", json={"ts": 1.0})
    assert resp.status_code == 401


def test_ingest_with_valid_token_updates_twin(client, auth_headers):
    payload = {
        "ts": 42.0,
        "host": {"instance_id": "i-test", "private_ip": "10.0.0.9", "public_ip": "1.2.3.4"},
        "listeners": [{"pid": 1, "proc": "api", "user": "app", "proto": "tcp", "bind": "0.0.0.0", "port": 9000}],
        "conns": [],
        "containers": [],
        "firewall": {"backend": "iptables", "input_policy": "allow", "rules": []},
        "checks": {"redis_noauth": False},
    }
    resp = client.post("/ingest", json=payload, headers=auth_headers)
    assert resp.status_code == 200
    twin = client.get("/twin").json()
    assert any(n["id"] == "api" and n["ports"] == [9000] for n in twin["nodes"])


def test_replay_progression_via_api(client):
    for expected in ("latent", "exposed", "fixed"):
        resp = client.post("/replay/step")
        assert resp.status_code == 200
        assert resp.json()["scenario"] == expected


def test_failure_simulation_endpoint(client):
    client.post("/replay/reset")
    resp = client.post("/simulate/failure", json={"node": "redis"})
    assert resp.status_code == 200
    result = resp.json()
    assert result["affected_services"]["api"] == "degraded"
    assert result["affected_endpoints"]["/checkout"] == "FAILED"


def test_failure_simulation_unknown_node_404(client):
    client.post("/replay/reset")
    resp = client.post("/simulate/failure", json={"node": "does-not-exist"})
    assert resp.status_code == 404


def test_attack_simulation_endpoint_after_replay_to_exposed(client):
    client.post("/replay/step")  # latent
    client.post("/replay/step")  # exposed
    resp = client.post("/simulate/attack", json={"entry_type": "public_service", "node": "internet"})
    assert resp.status_code == 200
    assert "demo-data" in resp.json()["paths"]


def test_spof_endpoint(client):
    client.post("/replay/reset")
    resp = client.get("/spof")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_fix_preview_endpoint(client):
    client.post("/replay/step")  # latent
    client.post("/replay/step")  # exposed
    resp = client.get("/fix/exposure-redis")
    assert resp.status_code == 200
    body = resp.json()
    assert body["finding"]["status"] == "exposed"
    assert body["best_patch_id"] is not None


def test_fix_apply_requires_approve_true(client):
    client.post("/replay/step")
    client.post("/replay/step")
    preview = client.get("/fix/exposure-redis").json()
    patch_id = preview["best_patch_id"]
    resp = client.post(f"/fix/{patch_id}/apply", json={"approve": False})
    assert resp.status_code == 400


def test_fix_apply_and_rollback_round_trip(client, backend):
    client.post("/replay/step")
    client.post("/replay/step")
    preview = client.get("/fix/exposure-redis").json()
    patch_id = preview["best_patch_id"]

    apply_resp = client.post(f"/fix/{patch_id}/apply", json={"approve": True})
    assert apply_resp.status_code == 200
    assert apply_resp.json()["status"] == "applied"
    assert backend.applier.get_rollback(patch_id) is not None

    audit_lines = backend.applier.audit_path.read_text().strip().splitlines()
    assert json.loads(audit_lines[-1])["action"] == "apply"

    rollback_resp = client.post(f"/fix/{patch_id}/rollback")
    assert rollback_resp.status_code == 200
    assert rollback_resp.json()["status"] == "rolled_back"


def test_probe_endpoint_uses_current_public_ip(client, monkeypatch):
    import socket

    monkeypatch.setattr(socket, "create_connection", lambda addr, timeout: (_ for _ in ()).throw(ConnectionRefusedError()))
    client.post("/replay/reset")
    resp = client.get("/probe", params={"port": 6379})
    assert resp.status_code == 200
    body = resp.json()
    assert body["host"] == "3.91.100.20"
    assert body["status"] == "unreachable"


def test_explain_endpoint_deterministic(client, monkeypatch):
    monkeypatch.delenv("BEDROCK_ENABLED", raising=False)
    resp = client.post("/explain", json={"context": {"kind": "finding", "node": "redis", "status": "exposed"}})
    assert resp.status_code == 200
    assert resp.json()["source"] == "template"


def test_events_endpoint_returns_new_exposure_after_replay(client):
    client.post("/replay/step")  # latent
    client.post("/replay/step")  # exposed -> should emit NEW_EXPOSURE for redis
    events = client.get("/events").json()
    assert any(e["type"] == "NEW_EXPOSURE" for e in events)


def test_websocket_receives_initial_twin_and_replay_broadcast(client):
    with client.websocket_connect("/ws") as ws:
        first = ws.receive_json()
        assert first["type"] == "TWIN"
        assert first["twin"]["mode"] == "unconnected"
        assert first["twin"]["nodes"] == []

        client.post("/replay/step")
        second = ws.receive_json()
        assert second["type"] == "REPLAY_STEP"
        assert second["scenario"] == "latent"
