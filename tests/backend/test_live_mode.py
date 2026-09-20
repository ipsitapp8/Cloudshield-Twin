"""LIVE mode: a real agent ingest must switch the twin from fixture-driven to the
real observed data, and demo replay must never be able to silently overwrite it
(SPEC extension §21: never mix demo data with live data)."""
from __future__ import annotations

import backend.main as main_module

LIVE_SNAPSHOT = {
    "ts": 1000.0,
    "host": {"instance_id": "my-real-host", "private_ip": "10.0.0.9", "public_ip": None, "hostname": "my-real-host"},
    "listeners": [{"pid": 111, "proc": "myrealapp", "user": "alice", "proto": "tcp", "bind": "0.0.0.0", "port": 9000}],
    "conns": [],
    "containers": [],
    "firewall": None,
    "checks": {"redis_noauth": False},
    "cpu": {"percent": 12.5, "per_core": [], "load_avg": None, "freq_mhz": None},
    "memory": {"total": 100, "used": 50, "available": 50, "percent": 50.0, "swap_total": None, "swap_used": None, "swap_percent": None},
    "disks": [],
    "network_interfaces": [],
    "processes": [],
    "source": "live",
}


def test_live_ingest_flips_mode_and_reports_connected(client, auth_headers):
    before = client.get("/twin").json()
    assert before["mode"] == "unconnected"
    assert before["connected"] is False

    resp = client.post("/ingest", json=LIVE_SNAPSHOT, headers=auth_headers)
    assert resp.status_code == 200

    after = client.get("/twin").json()
    assert after["mode"] == "live"
    assert after["connected"] is True
    assert after["last_seen_seconds_ago"] is not None
    assert after["last_seen_seconds_ago"] < 5


def test_live_ingest_shows_real_listener_and_hides_fixture_nginx(client, auth_headers):
    unconnected_twin = client.get("/twin").json()
    assert unconnected_twin["nodes"] == []  # no fixture data before any agent/demo action

    client.post("/ingest", json=LIVE_SNAPSHOT, headers=auth_headers)

    live_twin = client.get("/twin").json()
    node_ids = {n["id"] for n in live_twin["nodes"]}
    assert "myrealapp" in node_ids  # the real listener from the live payload
    assert "nginx" not in node_ids  # never invented -- it wasn't in the real payload


def test_replay_is_rejected_once_live_never_overwrites_live_data(client, auth_headers):
    client.post("/ingest", json=LIVE_SNAPSHOT, headers=auth_headers)

    resp = client.post("/replay/step")
    assert resp.status_code == 409

    resp = client.post("/replay/reset")
    assert resp.status_code == 409

    # the real listener is still there -- replay never sneaked fixture data back in
    twin = client.get("/twin").json()
    assert any(n["id"] == "myrealapp" for n in twin["nodes"])


def test_connected_becomes_false_after_the_staleness_window(client, auth_headers, monkeypatch):
    real_time = main_module.time.time
    client.post("/ingest", json=LIVE_SNAPSHOT, headers=auth_headers)
    assert client.get("/twin").json()["connected"] is True

    monkeypatch.setattr(main_module.time, "time", lambda: real_time() + main_module.LIVE_STALE_SECONDS + 1)
    stale = client.get("/twin").json()
    assert stale["mode"] == "live"  # mode is sticky...
    assert stale["connected"] is False  # ...but connectivity honestly reflects staleness


def test_full_real_data_flow_registration_to_websocket_broadcast(client):
    """SPEC §P: register -> authenticated ingest -> stored snapshot -> twin reflects
    the real listener -> exposure/SPOF computable -> event/WS broadcast reach the client."""
    with client.websocket_connect("/ws") as ws:
        initial = ws.receive_json()
        assert initial["twin"]["mode"] == "unconnected"

        reg = client.post("/agents/register").json()
        assert reg["agent_id"] and reg["token"]

        resp = client.post(
            "/ingest", json=LIVE_SNAPSHOT, headers={"Authorization": f"Bearer {reg['token']}"}
        )
        assert resp.status_code == 200

        ingest_msg = ws.receive_json()
        assert ingest_msg["type"] == "INGEST"

    twin = client.get("/twin").json()
    assert twin["mode"] == "live"
    assert twin["agent_id"] == reg["agent_id"]
    assert any(n["id"] == "myrealapp" for n in twin["nodes"])

    scan = client.post("/scan").json()
    assert scan["status"] == "complete"
    assert isinstance(scan["findings"], list)
    assert isinstance(scan["spof"], list)

    events = client.get("/events").json()
    assert any(e["type"] == "SCAN_COMPLETE" for e in events)
