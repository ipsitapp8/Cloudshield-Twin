"""build_snapshot()'s output must validate directly against engine.models.AgentSnapshot
-- the agent has no duplicate validation logic of its own."""
from __future__ import annotations

from agent.agent import build_snapshot
from engine.models import AgentSnapshot


def _slow():
    return {
        "host": {"instance_id": "my-machine", "private_ip": "10.0.0.5", "public_ip": None},
        "listeners": [{"pid": 100, "proc": "nginx", "user": "root", "proto": "tcp", "bind": "0.0.0.0", "port": 80}],
        "conns": [],
        "processes": [{"pid": 100, "ppid": 1, "name": "nginx", "exe": None, "user": "root", "cpu_percent": 1.0, "memory_percent": 2.0, "create_time": 0.0, "cmdline": None}],
        "disks": [{"device": "/dev/sda1", "mountpoint": "/", "total": 100, "used": 50, "free": 50, "percent": 50.0}],
        "network_interfaces": [],
    }


def test_build_snapshot_validates_against_agent_snapshot_model(monkeypatch):
    import agent.agent as agent_module

    monkeypatch.setattr(agent_module, "collect_cpu", lambda: {"percent": 12.0, "per_core": [], "load_avg": None, "freq_mhz": None})
    monkeypatch.setattr(agent_module, "collect_memory", lambda: {"total": 100, "used": 50, "available": 50, "percent": 50.0, "swap_total": None, "swap_used": None, "swap_percent": None})

    snapshot = build_snapshot(_slow())
    validated = AgentSnapshot.model_validate(snapshot)

    assert validated.source == "live"
    assert validated.host.instance_id == "my-machine"
    assert validated.listeners[0].proc == "nginx"
    assert validated.cpu is not None and validated.cpu.percent == 12.0
    assert validated.containers == []  # Docker detection deferred -- never invented
    assert validated.firewall is None  # host firewall introspection deferred -- honest "unknown"


def test_build_snapshot_is_source_live_never_demo():
    snapshot = build_snapshot(_slow())
    assert snapshot["source"] == "live"
