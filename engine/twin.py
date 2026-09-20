"""Build the twin graph (§4). Pure: AgentSnapshot + AWSSnapshot + TwinConfig -> DiGraph."""
from __future__ import annotations

import re

import networkx as nx

from engine.models import AgentSnapshot, AWSSnapshot, TwinConfig

LOCAL_BINDS = {"127.0.0.1", "::1", "localhost"}
DATASTORE_PORTS = {6379: "redis", 5432: "postgres"}
SENSITIVITY_BY_PORT = {6379: 2, 5432: 3, 80: 1, 443: 1}
DEFAULT_DEP_BY_PORT = {6379: "soft", 5432: "hard"}
DEFAULT_SENSITIVITY = 1
DEFAULT_DEP = "hard"
DEFAULT_TIER = 2

INTERNET = "internet"
IMDS = "imds"

_S3_ARN_RE = re.compile(r"arn:aws:s3:::([^/]+)")


def _node_kind_for_port(port: int) -> str:
    return "datastore" if port in DATASTORE_PORTS else "service"


def _addr_port(addr: str) -> tuple[str, int]:
    ip, _, port = addr.rpartition(":")
    return ip, int(port)


def build_twin(agent: AgentSnapshot, aws: AWSSnapshot, config: TwinConfig) -> nx.DiGraph:
    G = nx.DiGraph()
    G.graph["firewall"] = agent.firewall.model_dump() if agent.firewall else None
    G.graph["security_groups"] = {
        sg_id: sg.model_dump() for sg_id, sg in aws.security_groups.items()
    }
    G.graph["sg_ids"] = list(aws.instance.sg_ids)
    G.graph["public_ip"] = agent.host.public_ip
    G.graph["private_ip"] = agent.host.private_ip
    G.graph["agent_port"] = None  # reserved: agent push channel, never touched by patches

    host_id = aws.instance.id
    G.add_node(host_id, id=host_id, kind="host", ports=[], tier=DEFAULT_TIER, sensitivity=2, state="ok")
    G.add_node(INTERNET, id=INTERNET, kind="internet", ports=[], tier=0, sensitivity=0, state="ok")
    G.add_node(IMDS, id=IMDS, kind="imds", ports=[], tier=1, sensitivity=1, state="ok")

    # --- service/datastore nodes from listeners ---
    proc_ports: dict[str, set[int]] = {}
    proc_binds: dict[str, str] = {}
    for listener in agent.listeners:
        proc_ports.setdefault(listener.proc, set()).add(listener.port)
        proc_binds[listener.proc] = listener.bind

    for proc, ports in proc_ports.items():
        primary_port = min(ports)
        kind = _node_kind_for_port(primary_port)
        sensitivity = SENSITIVITY_BY_PORT.get(primary_port, DEFAULT_SENSITIVITY)
        tier = config.tiers.get(proc, DEFAULT_TIER)
        node_attrs = dict(
            id=proc,
            kind=kind,
            ports=sorted(ports),
            tier=tier,
            sensitivity=sensitivity,
            state="ok",
            bind=proc_binds[proc],
        )
        if proc == "redis":
            node_attrs["noauth"] = agent.checks.redis_noauth
        G.add_node(proc, **node_attrs)
        G.add_edge(proc, host_id, kind="runs_on", observed=True, dep="none", port=None)

    # --- flow edges from ESTABLISHED conns (client side) ---
    listener_by_port_bind = [(l.port, l.bind, l.proc) for l in agent.listeners]

    def _server_for(raddr: str) -> str | None:
        ip, port = _addr_port(raddr)
        for lport, lbind, lproc in listener_by_port_bind:
            if lport != port:
                continue
            if lbind in ("0.0.0.0", "::") or lbind == ip:
                return lproc
        return None

    for conn in agent.conns:
        if conn.status != "ESTABLISHED":
            continue
        server = _server_for(conn.raddr)
        if server is None or conn.proc == server:
            continue
        via_ip, port = _addr_port(conn.raddr)
        dep = DEFAULT_DEP_BY_PORT.get(port, DEFAULT_DEP)
        if not G.has_node(conn.proc):
            continue
        G.add_edge(conn.proc, server, kind="flow", observed=True, dep=dep, port=port, via=via_ip)

    # --- IAM: host -> imds -> role -> buckets ---
    role_id = aws.instance.role
    G.add_node(role_id, id=role_id, kind="aws_role", ports=[], tier=2, sensitivity=3, state="ok")
    G.add_edge(host_id, IMDS, kind="flow", observed=True, dep="none", port=None)
    G.add_edge(IMDS, role_id, kind="grants", observed=True, dep="none", port=None)

    buckets: set[str] = set()
    for perm in aws.role_permissions:
        match = _S3_ARN_RE.search(perm.resource)
        if match:
            buckets.add(match.group(1))
    for bucket in sorted(buckets):
        G.add_node(bucket, id=bucket, kind="aws_bucket", ports=[], tier=3, sensitivity=3, state="ok")
        G.add_edge(role_id, bucket, kind="grants", observed=True, dep="none", port=None)

    return G
