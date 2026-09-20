"""CloudShield real-VM agent (Milestone 1 of the live-monitoring pivot).

Read-only observation only: every function here either calls a psutil *read* API or
makes one outbound HTTP POST to the backend's existing /ingest endpoint. Nothing here
executes a shell command, writes a file, or mutates system/network/firewall state.

Usage:
    python -m agent.agent --server http://localhost:8000 --token dev-token

Collects CPU/memory every --fast-interval seconds and listeners/connections/
processes/disks/network interfaces every --slow-interval seconds, merging the most
recent of each into one AgentSnapshot-shaped payload sent on every fast tick -- so the
backend keeps receiving continuous snapshots, not a single one-shot upload.

Every collector degrades a single field to None/[] (never raises) when the OS/
platform/permissions don't allow it, per the "unknown, not invented" requirement.
"""
from __future__ import annotations

import argparse
import json
import platform
import socket
import time
import urllib.error
import urllib.request
from typing import Any

import psutil

from engine.models import AgentSnapshot

DEFAULT_FAST_INTERVAL = 3.0
DEFAULT_SLOW_INTERVAL = 10.0
HTTP_TIMEOUT_SECONDS = 5.0


# -- host -----------------------------------------------------------------------


def _primary_private_ip() -> str:
    # Prefer a real LAN address over link-local/APIPA (169.254.x.x) autoconfig
    # addresses, which are common on machines with multiple virtual adapters (VPN
    # clients, Bluetooth PAN, etc.) but aren't a useful "the machine's IP" answer.
    candidates = []
    for name, addrs in psutil.net_if_addrs().items():
        if name.lower().startswith(("lo", "loopback")):
            continue
        for addr in addrs:
            if addr.family == socket.AF_INET and not addr.address.startswith("127."):
                candidates.append(addr.address)
    for ip in candidates:
        if not ip.startswith("169.254."):
            return ip
    if candidates:
        return candidates[0]
    try:
        return socket.gethostbyname(socket.gethostname())
    except OSError:
        return "127.0.0.1"


def collect_host() -> dict[str, Any]:
    hostname = socket.gethostname()
    try:
        uptime_seconds: float | None = time.time() - psutil.boot_time()
    except Exception:
        uptime_seconds = None
    return {
        # No cloud metadata call in this milestone (see plan) -- the hostname is the
        # only stable identifier available without one, so it doubles as instance_id.
        "instance_id": hostname,
        "private_ip": _primary_private_ip(),
        "public_ip": None,
        "hostname": hostname,
        "os": platform.system() or None,
        "kernel": platform.release() or None,
        "arch": platform.machine() or None,
        "uptime_seconds": uptime_seconds,
        "cloud_id": None,
    }


# -- cpu / memory / disk / network interfaces -----------------------------------


def collect_cpu() -> dict[str, Any]:
    percent: float | None
    per_core: list[float] = []
    load_avg: list[float] | None = None
    freq_mhz: float | None = None
    try:
        percent = psutil.cpu_percent(interval=None)
    except Exception:
        percent = None
    try:
        per_core = list(psutil.cpu_percent(interval=None, percpu=True))
    except Exception:
        per_core = []
    try:
        load_avg = list(psutil.getloadavg())
    except (AttributeError, OSError):
        load_avg = None  # not available on this platform (e.g. Windows)
    try:
        freq = psutil.cpu_freq()
        freq_mhz = freq.current if freq else None
    except Exception:
        freq_mhz = None
    return {"percent": percent, "per_core": per_core, "load_avg": load_avg, "freq_mhz": freq_mhz}


def collect_memory() -> dict[str, Any]:
    mem: dict[str, Any]
    try:
        vm = psutil.virtual_memory()
        mem = {"total": vm.total, "used": vm.used, "available": vm.available, "percent": vm.percent}
    except Exception:
        mem = {"total": None, "used": None, "available": None, "percent": None}
    try:
        swap = psutil.swap_memory()
        mem["swap_total"], mem["swap_used"], mem["swap_percent"] = swap.total, swap.used, swap.percent
    except Exception:
        mem["swap_total"] = mem["swap_used"] = mem["swap_percent"] = None
    return mem


def collect_disks() -> list[dict[str, Any]]:
    disks: list[dict[str, Any]] = []
    try:
        partitions = psutil.disk_partitions(all=False)
    except Exception:
        return []
    for part in partitions:
        entry: dict[str, Any] = {"device": part.device, "mountpoint": part.mountpoint}
        try:
            usage = psutil.disk_usage(part.mountpoint)
            entry["total"], entry["used"], entry["free"], entry["percent"] = (
                usage.total,
                usage.used,
                usage.free,
                usage.percent,
            )
        except (PermissionError, OSError):
            entry["total"] = entry["used"] = entry["free"] = entry["percent"] = None
        disks.append(entry)
    return disks


def collect_network_interfaces() -> list[dict[str, Any]]:
    try:
        addrs_by_if = psutil.net_if_addrs()
        stats_by_if = psutil.net_if_stats()
        io_by_if = psutil.net_io_counters(pernic=True)
    except Exception:
        return []
    interfaces = []
    for name, addrs in addrs_by_if.items():
        stats = stats_by_if.get(name)
        io = io_by_if.get(name)
        interfaces.append(
            {
                "name": name,
                "addresses": [a.address for a in addrs if a.family in (socket.AF_INET, socket.AF_INET6)],
                "is_up": stats.isup if stats else None,
                "bytes_sent": io.bytes_sent if io else None,
                "bytes_recv": io.bytes_recv if io else None,
                "packets_sent": io.packets_sent if io else None,
                "packets_recv": io.packets_recv if io else None,
                "errin": io.errin if io else None,
                "errout": io.errout if io else None,
                "dropin": io.dropin if io else None,
                "dropout": io.dropout if io else None,
            }
        )
    return interfaces


# -- processes / listeners / connections -----------------------------------------


def _proc_name(pid: int | None) -> str:
    if pid is None:
        return "unknown"
    try:
        return psutil.Process(pid).name()
    except (psutil.NoSuchProcess, psutil.AccessDenied, ProcessLookupError):
        return "unknown"


def _proc_user(pid: int | None) -> str:
    if pid is None:
        return "unknown"
    try:
        return psutil.Process(pid).username()
    except (psutil.NoSuchProcess, psutil.AccessDenied, ProcessLookupError):
        return "unknown"


def collect_processes(limit: int = 20) -> list[dict[str, Any]]:
    """Top `limit` processes by CPU%, to keep the payload bounded (per the plan's
    "don't make every expensive call run every second / keep payloads bounded")."""
    procs = []
    attrs = ["pid", "ppid", "name", "exe", "username", "cpu_percent", "memory_percent", "create_time", "cmdline"]
    try:
        for p in psutil.process_iter(attrs):
            info = p.info
            procs.append(
                {
                    "pid": info.get("pid"),
                    "ppid": info.get("ppid"),
                    "name": info.get("name") or "unknown",
                    "exe": info.get("exe"),
                    "user": info.get("username") or "unknown",
                    "cpu_percent": info.get("cpu_percent"),
                    "memory_percent": info.get("memory_percent"),
                    "create_time": info.get("create_time"),
                    "cmdline": info.get("cmdline") or None,
                }
            )
    except Exception:
        return []
    procs.sort(key=lambda p: p.get("cpu_percent") or 0.0, reverse=True)
    return procs[:limit]


def collect_listeners() -> list[dict[str, Any]]:
    """Maps onto the *existing* engine.models.Listener shape -- engine/twin.py needs
    no changes to build real graph nodes from this."""
    listeners = []
    try:
        conns = psutil.net_connections(kind="inet")
    except (psutil.AccessDenied, PermissionError, OSError):
        return []
    for c in conns:
        if c.status != psutil.CONN_LISTEN or not c.laddr:
            continue
        listeners.append(
            {
                "pid": c.pid or 0,
                "proc": _proc_name(c.pid),
                "user": _proc_user(c.pid),
                "proto": "udp" if c.type == socket.SOCK_DGRAM else "tcp",
                "bind": c.laddr.ip,
                "port": c.laddr.port,
            }
        )
    return listeners


def collect_connections() -> list[dict[str, Any]]:
    """Maps onto the *existing* engine.models.Conn shape."""
    out = []
    try:
        conns = psutil.net_connections(kind="inet")
    except (psutil.AccessDenied, PermissionError, OSError):
        return []
    for c in conns:
        if c.status == psutil.CONN_LISTEN or not c.laddr or not c.raddr:
            continue
        out.append(
            {
                "pid": c.pid or 0,
                "proc": _proc_name(c.pid),
                "laddr": f"{c.laddr.ip}:{c.laddr.port}",
                "raddr": f"{c.raddr.ip}:{c.raddr.port}",
                "status": c.status,
            }
        )
    return out


# -- snapshot assembly + transport ------------------------------------------------


def build_snapshot(slow: dict[str, Any]) -> dict[str, Any]:
    """slow: the most recently collected listeners/conns/processes/disks/interfaces
    (refreshed on the slower cadence). CPU/memory are always collected fresh."""
    return {
        "ts": time.time(),
        "host": slow["host"],
        "listeners": slow["listeners"],
        "conns": slow["conns"],
        "containers": [],  # Docker detection is deferred (see plan) -- never invented
        "firewall": None,  # host firewall introspection deferred -- exposure.py
        # already treats firewall=None as "unknown, confidence low", the honest result
        "checks": {"redis_noauth": False},
        "cpu": collect_cpu(),
        "memory": collect_memory(),
        "disks": slow["disks"],
        "network_interfaces": slow["network_interfaces"],
        "processes": slow["processes"],
        "source": "live",
    }


def _collect_slow() -> dict[str, Any]:
    return {
        "host": collect_host(),
        "listeners": collect_listeners(),
        "conns": collect_connections(),
        "processes": collect_processes(),
        "disks": collect_disks(),
        "network_interfaces": collect_network_interfaces(),
    }


def send_snapshot(server: str, token: str, snapshot: dict[str, Any]) -> bool:
    body = json.dumps(snapshot).encode("utf-8")
    req = urllib.request.Request(
        f"{server.rstrip('/')}/ingest",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_SECONDS):
            return True
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
        print(f"[agent] failed to send snapshot: {exc}")
        return False


def run(server: str, token: str, fast_interval: float = DEFAULT_FAST_INTERVAL, slow_interval: float = DEFAULT_SLOW_INTERVAL) -> None:
    print(f"[agent] starting: server={server} fast={fast_interval}s slow={slow_interval}s")
    slow = _collect_slow()
    last_slow_refresh = time.monotonic()
    psutil.cpu_percent(interval=None)  # prime the internal baseline (first real call is 0.0 otherwise)

    while True:
        if time.monotonic() - last_slow_refresh >= slow_interval:
            slow = _collect_slow()
            last_slow_refresh = time.monotonic()

        snapshot = build_snapshot(slow)
        AgentSnapshot.model_validate(snapshot)  # fail fast locally, never send an invalid payload
        send_snapshot(server, token, snapshot)
        time.sleep(fast_interval)


def main() -> None:
    parser = argparse.ArgumentParser(description="CloudShield real-VM monitoring agent")
    parser.add_argument("--server", required=True, help="CloudShield backend base URL, e.g. http://localhost:8000")
    parser.add_argument("--token", required=True, help="Bearer token matching the backend's INGEST_TOKEN")
    parser.add_argument("--fast-interval", type=float, default=DEFAULT_FAST_INTERVAL)
    parser.add_argument("--slow-interval", type=float, default=DEFAULT_SLOW_INTERVAL)
    args = parser.parse_args()
    run(args.server, args.token, args.fast_interval, args.slow_interval)


if __name__ == "__main__":
    main()
