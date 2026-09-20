"""Agent registry: registration issues a real per-agent token, the registry never
leaks tokens, and only a registered (or the legacy static) token can ingest."""
from __future__ import annotations

LIVE_SNAPSHOT = {
    "ts": 1000.0,
    "host": {"instance_id": "h", "private_ip": "10.0.0.1", "public_ip": None, "hostname": "real-host"},
    "listeners": [],
    "conns": [],
    "containers": [],
    "firewall": None,
    "checks": {"redis_noauth": False},
    "source": "live",
}


def test_register_issues_a_usable_token(client):
    resp = client.post("/agents/register")
    assert resp.status_code == 200
    body = resp.json()
    assert body["agent_id"].startswith("agent-")
    assert len(body["token"]) > 10

    ingest_resp = client.post(
        "/ingest", json=LIVE_SNAPSHOT, headers={"Authorization": f"Bearer {body['token']}"}
    )
    assert ingest_resp.status_code == 200


def test_bogus_token_is_rejected_and_never_appears_in_registry(client):
    resp = client.post("/ingest", json=LIVE_SNAPSHOT, headers={"Authorization": "Bearer never-registered"})
    assert resp.status_code == 401
    assert client.get("/agents").json() == []


def test_registered_agent_appears_in_list_without_leaking_its_token(client):
    reg = client.post("/agents/register").json()
    client.post("/ingest", json=LIVE_SNAPSHOT, headers={"Authorization": f"Bearer {reg['token']}"})

    agents = client.get("/agents").json()
    assert len(agents) == 1
    assert agents[0]["agent_id"] == reg["agent_id"]
    assert agents[0]["hostname"] == "real-host"
    assert agents[0]["connected"] is True
    assert "token" not in agents[0]


def test_agent_detail_and_status_endpoints(client):
    reg = client.post("/agents/register").json()
    client.post("/ingest", json=LIVE_SNAPSHOT, headers={"Authorization": f"Bearer {reg['token']}"})

    detail = client.get(f"/agents/{reg['agent_id']}").json()
    assert detail["hostname"] == "real-host"
    assert "token" not in detail

    status = client.get(f"/agents/{reg['agent_id']}/status").json()
    assert status["connected"] is True
    assert status["last_seen_seconds_ago"] is not None


def test_unknown_agent_id_404s(client):
    assert client.get("/agents/agent-doesnotexist").status_code == 404
    assert client.get("/agents/agent-doesnotexist/status").status_code == 404
