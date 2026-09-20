"""Exposure algorithm (§5.A). Pure: DiGraph -> list[Finding]."""
from __future__ import annotations

from typing import Literal

import networkx as nx

from engine.models import ExposureStatus, Finding
from engine.twin import LOCAL_BINDS

PUBLIC_CIDRS = {"0.0.0.0/0", "::/0"}


def _host_fw_allows(firewall: dict | None, port: int) -> bool | None:
    if firewall is None:
        return None
    policy = firewall["input_policy"]
    matching = [r for r in firewall["rules"] if r["port"] == port]
    if policy == "deny":
        return any(r["action"] == "allow" for r in matching)
    return not any(r["action"] == "deny" for r in matching)


def _sg_allows(security_groups: dict, sg_ids: list[str], port: int) -> bool:
    for sg_id in sg_ids:
        sg = security_groups.get(sg_id)
        if not sg:
            continue
        for rule in sg["inbound"]:
            if rule["cidr"] not in PUBLIC_CIDRS:
                continue
            if rule["proto"] not in ("tcp", "-1", "all"):
                continue
            if rule["from_port"] <= port <= rule["to_port"]:
                return True
    return False


def exposed(node: str, G: nx.DiGraph) -> Finding:
    data = G.nodes[node]
    ports = data.get("ports") or []
    port = ports[0] if ports else None
    bind = data.get("bind", "")

    bind_ok = bind not in LOCAL_BINDS
    fw_result = _host_fw_allows(G.graph.get("firewall"), port) if port is not None else None
    confidence: Literal["high", "low"] = "high" if fw_result is not None else "low"
    fw_ok = True if fw_result is None else fw_result
    sg_ok = _sg_allows(G.graph.get("security_groups", {}), G.graph.get("sg_ids", []), port) if port is not None else False
    has_public_ip = bool(G.graph.get("public_ip"))

    is_exposed = has_public_ip and bind_ok and fw_ok and sg_ok
    is_latent = sg_ok and not bind_ok

    status: ExposureStatus
    if is_exposed:
        status = "exposed"
    elif is_latent:
        status = "latent"
    elif bind_ok:
        status = "internal"
    else:
        status = "closed"

    return Finding(
        id=f"exposure-{node}",
        node=node,
        status=status,
        evidence={"bind": bind_ok, "host_fw": fw_ok, "sg": sg_ok},
        confidence=confidence,
    )


def exposed_all(G: nx.DiGraph) -> list[Finding]:
    findings = []
    for node, data in G.nodes(data=True):
        if data.get("kind") not in ("service", "datastore"):
            continue
        if not data.get("ports"):
            continue
        findings.append(exposed(node, G))
    return findings
