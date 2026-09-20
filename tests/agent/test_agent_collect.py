"""Each collector must degrade a single unavailable field to None/[] rather than
raise, regardless of platform/permission errors -- never invent a value."""
from __future__ import annotations

from types import SimpleNamespace

import psutil
import pytest

from agent import agent


def _addr(ip: str, port: int) -> SimpleNamespace:
    return SimpleNamespace(ip=ip, port=port)


def _conn(pid, laddr=None, raddr=None, status="ESTABLISHED", type_=None):
    return SimpleNamespace(
        pid=pid,
        laddr=laddr,
        raddr=raddr,
        status=status,
        type=type_ if type_ is not None else __import__("socket").SOCK_STREAM,
    )


class FakeProcess:
    def __init__(self, name="myproc", user="alice", raise_error=None):
        self._name = name
        self._user = user
        self._raise = raise_error

    def name(self):
        if self._raise:
            raise self._raise
        return self._name

    def username(self):
        if self._raise:
            raise self._raise
        return self._user


# -- cpu --------------------------------------------------------------------------


def test_collect_cpu_normal(monkeypatch):
    monkeypatch.setattr(agent.psutil, "cpu_percent", lambda interval=None, percpu=False: [10.0, 20.0] if percpu else 15.0)
    monkeypatch.setattr(agent.psutil, "getloadavg", lambda: (0.5, 0.4, 0.3))
    monkeypatch.setattr(agent.psutil, "cpu_freq", lambda: SimpleNamespace(current=2400.0))
    result = agent.collect_cpu()
    assert result == {"percent": 15.0, "per_core": [10.0, 20.0], "load_avg": [0.5, 0.4, 0.3], "freq_mhz": 2400.0}


def test_collect_cpu_load_avg_unsupported_on_this_platform(monkeypatch):
    monkeypatch.setattr(agent.psutil, "cpu_percent", lambda interval=None, percpu=False: [] if percpu else 15.0)

    def raise_attr():
        raise AttributeError("getloadavg not available on Windows")

    monkeypatch.setattr(agent.psutil, "getloadavg", raise_attr)
    monkeypatch.setattr(agent.psutil, "cpu_freq", lambda: None)
    result = agent.collect_cpu()
    assert result["load_avg"] is None
    assert result["percent"] == 15.0  # unrelated field is unaffected


def test_collect_cpu_freq_unavailable_returns_none_not_error(monkeypatch):
    monkeypatch.setattr(agent.psutil, "cpu_percent", lambda interval=None, percpu=False: [] if percpu else 0.0)
    monkeypatch.setattr(agent.psutil, "getloadavg", lambda: (0.0, 0.0, 0.0))
    monkeypatch.setattr(agent.psutil, "cpu_freq", lambda: None)
    result = agent.collect_cpu()
    assert result["freq_mhz"] is None


# -- memory -------------------------------------------------------------------------


def test_collect_memory_normal(monkeypatch):
    monkeypatch.setattr(
        agent.psutil, "virtual_memory", lambda: SimpleNamespace(total=100, used=60, available=40, percent=60.0)
    )
    monkeypatch.setattr(agent.psutil, "swap_memory", lambda: SimpleNamespace(total=10, used=2, percent=20.0))
    result = agent.collect_memory()
    assert result == {
        "total": 100,
        "used": 60,
        "available": 40,
        "percent": 60.0,
        "swap_total": 10,
        "swap_used": 2,
        "swap_percent": 20.0,
    }


def test_collect_memory_swap_unavailable_degrades_only_swap(monkeypatch):
    monkeypatch.setattr(
        agent.psutil, "virtual_memory", lambda: SimpleNamespace(total=100, used=60, available=40, percent=60.0)
    )

    def raise_error():
        raise RuntimeError("swap not available")

    monkeypatch.setattr(agent.psutil, "swap_memory", raise_error)
    result = agent.collect_memory()
    assert result["total"] == 100  # unaffected
    assert result["swap_total"] is None
    assert result["swap_used"] is None
    assert result["swap_percent"] is None


# -- disks --------------------------------------------------------------------------


def test_collect_disks_permission_denied_on_one_partition(monkeypatch):
    partitions = [SimpleNamespace(device="/dev/sda1", mountpoint="/"), SimpleNamespace(device="//net/share", mountpoint="/mnt")]
    monkeypatch.setattr(agent.psutil, "disk_partitions", lambda all=False: partitions)

    def fake_usage(mountpoint):
        if mountpoint == "/mnt":
            raise PermissionError("access denied")
        return SimpleNamespace(total=100, used=50, free=50, percent=50.0)

    monkeypatch.setattr(agent.psutil, "disk_usage", fake_usage)
    result = agent.collect_disks()
    assert result[0] == {"device": "/dev/sda1", "mountpoint": "/", "total": 100, "used": 50, "free": 50, "percent": 50.0}
    assert result[1] == {"device": "//net/share", "mountpoint": "/mnt", "total": None, "used": None, "free": None, "percent": None}


def test_collect_disks_no_partitions_available(monkeypatch):
    def raise_error(all=False):
        raise OSError("no partitions")

    monkeypatch.setattr(agent.psutil, "disk_partitions", raise_error)
    assert agent.collect_disks() == []


# -- network interfaces ---------------------------------------------------------------


def test_collect_network_interfaces_normal(monkeypatch):
    import socket

    monkeypatch.setattr(
        agent.psutil,
        "net_if_addrs",
        lambda: {"eth0": [SimpleNamespace(family=socket.AF_INET, address="10.0.0.5")]},
    )
    monkeypatch.setattr(agent.psutil, "net_if_stats", lambda: {"eth0": SimpleNamespace(isup=True)})
    monkeypatch.setattr(
        agent.psutil,
        "net_io_counters",
        lambda pernic=False: {
            "eth0": SimpleNamespace(bytes_sent=1, bytes_recv=2, packets_sent=3, packets_recv=4, errin=0, errout=0, dropin=0, dropout=0)
        },
    )
    result = agent.collect_network_interfaces()
    assert len(result) == 1
    assert result[0]["name"] == "eth0"
    assert result[0]["addresses"] == ["10.0.0.5"]
    assert result[0]["is_up"] is True
    assert result[0]["bytes_sent"] == 1


# -- listeners / connections ----------------------------------------------------------


def test_collect_listeners_filters_to_listen_status_only(monkeypatch):
    conns = [
        _conn(pid=100, laddr=_addr("0.0.0.0", 8080), status=psutil.CONN_LISTEN),
        _conn(pid=200, laddr=_addr("127.0.0.1", 9999), raddr=_addr("1.2.3.4", 443), status="ESTABLISHED"),
    ]
    monkeypatch.setattr(agent.psutil, "net_connections", lambda kind="inet": conns)
    monkeypatch.setattr(agent.psutil, "Process", lambda pid: FakeProcess(name="myserver", user="root"))
    result = agent.collect_listeners()
    assert len(result) == 1
    assert result[0] == {"pid": 100, "proc": "myserver", "user": "root", "proto": "tcp", "bind": "0.0.0.0", "port": 8080}


def test_collect_listeners_process_lookup_fails_degrades_to_unknown(monkeypatch):
    conns = [_conn(pid=999, laddr=_addr("0.0.0.0", 22), status=psutil.CONN_LISTEN)]
    monkeypatch.setattr(agent.psutil, "net_connections", lambda kind="inet": conns)

    def raise_no_such_process(pid):
        raise psutil.NoSuchProcess(pid)

    monkeypatch.setattr(agent.psutil, "Process", raise_no_such_process)
    result = agent.collect_listeners()
    assert result[0]["proc"] == "unknown"
    assert result[0]["user"] == "unknown"


def test_collect_listeners_access_denied_returns_empty_not_error(monkeypatch):
    def raise_denied(kind="inet"):
        raise psutil.AccessDenied()

    monkeypatch.setattr(agent.psutil, "net_connections", raise_denied)
    assert agent.collect_listeners() == []
    assert agent.collect_connections() == []


def test_collect_connections_filters_out_listeners(monkeypatch):
    conns = [
        _conn(pid=100, laddr=_addr("0.0.0.0", 8080), status=psutil.CONN_LISTEN),
        _conn(pid=200, laddr=_addr("127.0.0.1", 9999), raddr=_addr("1.2.3.4", 443), status="ESTABLISHED"),
    ]
    monkeypatch.setattr(agent.psutil, "net_connections", lambda kind="inet": conns)
    monkeypatch.setattr(agent.psutil, "Process", lambda pid: FakeProcess(name="client"))
    result = agent.collect_connections()
    assert len(result) == 1
    assert result[0] == {"pid": 200, "proc": "client", "laddr": "127.0.0.1:9999", "raddr": "1.2.3.4:443", "status": "ESTABLISHED"}


# -- processes ------------------------------------------------------------------------


def test_collect_processes_sorted_by_cpu_and_limited(monkeypatch):
    procs = [
        SimpleNamespace(info={"pid": 1, "ppid": 0, "name": "low", "exe": None, "username": "u", "cpu_percent": 1.0, "memory_percent": 1.0, "create_time": 0.0, "cmdline": []}),
        SimpleNamespace(info={"pid": 2, "ppid": 0, "name": "high", "exe": None, "username": "u", "cpu_percent": 90.0, "memory_percent": 5.0, "create_time": 0.0, "cmdline": ["high"]}),
    ]
    monkeypatch.setattr(agent.psutil, "process_iter", lambda attrs: procs)
    result = agent.collect_processes(limit=1)
    assert len(result) == 1
    assert result[0]["name"] == "high"


def test_collect_processes_unavailable_returns_empty(monkeypatch):
    def raise_error(attrs):
        raise RuntimeError("no access")

    monkeypatch.setattr(agent.psutil, "process_iter", raise_error)
    assert agent.collect_processes() == []
