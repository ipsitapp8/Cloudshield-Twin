"""POST /scan: recomputes twin + exposure + SPOF from the most recently received
telemetry. It never asks the agent to collect anything -- there is no such channel."""
from __future__ import annotations

LIVE_SNAPSHOT = {
    "ts": 1000.0,
    "host": {"instance_id": "h", "private_ip": "10.0.0.1", "public_ip": None, "hostname": "real-host"},
    "listeners": [{"pid": 1, "proc": "myapp", "user": "app", "proto": "tcp", "bind": "0.0.0.0", "port": 9000}],
    "conns": [],
    "containers": [],
    "firewall": None,
    "checks": {"redis_noauth": False},
    "source": "live",
}


def test_scan_409s_while_unconnected(client):
    resp = client.post("/scan")
    assert resp.status_code == 409


def test_scan_after_live_ingest_returns_real_findings_and_emits_event(client, auth_headers):
    client.post("/ingest", json=LIVE_SNAPSHOT, headers=auth_headers)

    resp = client.post("/scan")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "complete"
    assert body["scanned_at"] is not None
    assert body["mode"] == "live"
    assert any(n["id"] == "myapp" for n in body["twin"]["nodes"])
    assert isinstance(body["findings"], list)
    assert isinstance(body["spof"], list)

    events = client.get("/events").json()
    assert any(e["type"] == "SCAN_COMPLETE" for e in events)


def test_scan_works_in_demo_mode_too(client):
    client.post("/replay/step")  # -> latent
    client.post("/replay/step")  # -> exposed
    resp = client.post("/scan")
    assert resp.status_code == 200
    assert resp.json()["mode"] == "demo"
    assert any(f["status"] == "exposed" for f in resp.json()["findings"])
