"""GET /performance: demo mode has no fabricated numbers; live mode reports real
findings computed from the actually-ingested telemetry."""
from __future__ import annotations

HIGH_CPU_SNAPSHOT = {
    "ts": 1000.0,
    "host": {"instance_id": "h", "private_ip": "10.0.0.1", "public_ip": None},
    "listeners": [],
    "conns": [],
    "containers": [],
    "firewall": None,
    "checks": {"redis_noauth": False},
    "cpu": {"percent": 96.0, "per_core": [], "load_avg": None, "freq_mhz": None},
    "memory": {"total": 100, "used": 50, "available": 50, "percent": 50.0, "swap_total": None, "swap_used": None, "swap_percent": None},
    "disks": [],
    "network_interfaces": [],
    "processes": [{"pid": 4242, "ppid": 1, "name": "hog", "exe": None, "user": "u", "cpu_percent": 90.0, "memory_percent": 5.0, "create_time": 0.0, "cmdline": None}],
    "source": "live",
}


def test_performance_unavailable_in_demo_mode(client):
    resp = client.get("/performance")
    assert resp.status_code == 200
    body = resp.json()
    assert body["available"] is False
    assert body["source"] == "demo"


def test_performance_reports_real_cpu_bottleneck_after_live_ingest(client, auth_headers):
    client.post("/ingest", json=HIGH_CPU_SNAPSHOT, headers=auth_headers)

    resp = client.get("/performance")
    body = resp.json()
    assert body["available"] is True
    assert body["source"] == "live"
    assert body["observed"]["cpu_percent"] == 96.0

    finding = next(f for f in body["findings"] if f["type"] == "CPU_BOTTLENECK")
    assert finding["confidence"] == "high"
    assert any("hog" in e and "4242" in e for e in finding["evidence"])
    assert "hog" in body["explanation"]


def test_performance_history_reflects_multiple_ingests(client, auth_headers):
    for cpu_percent, ts in [(30.0, 1000.0), (60.0, 1001.0), (90.0, 1002.0)]:
        snap = {**HIGH_CPU_SNAPSHOT, "ts": ts, "cpu": {**HIGH_CPU_SNAPSHOT["cpu"], "percent": cpu_percent}}
        client.post("/ingest", json=snap, headers=auth_headers)

    body = client.get("/performance").json()
    series = body["history"]["series"]
    assert [s["cpu_percent"] for s in series] == [30.0, 60.0, 90.0]


def test_performance_no_bottleneck_case_is_explicit(client, auth_headers):
    calm = {**HIGH_CPU_SNAPSHOT, "cpu": {"percent": 5.0, "per_core": [], "load_avg": None, "freq_mhz": None}}
    client.post("/ingest", json=calm, headers=auth_headers)

    body = client.get("/performance").json()
    assert body["findings"][0]["type"] == "NO_BOTTLENECK_DETECTED"
    assert body["explanation"] == "No clear bottleneck detected from the currently observed telemetry."
