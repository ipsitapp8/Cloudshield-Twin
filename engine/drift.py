"""Drift detection (§5.F). Pure: fingerprint DiGraph -> dict, diff(prev,curr) -> list[DriftEvent]."""
from __future__ import annotations

import networkx as nx

from engine.exposure import exposed_all
from engine.models import DriftEvent

SKIP_KINDS = {"internet", "host", "imds", "aws_role", "aws_bucket"}


def fingerprint(G: nx.DiGraph) -> dict:
    nodes = {
        n: {"kind": d.get("kind"), "ports": tuple(sorted(d.get("ports") or []))}
        for n, d in G.nodes(data=True)
    }
    edges = {
        (u, v): {"kind": d.get("kind"), "port": d.get("port")}
        for u, v, d in G.edges(data=True)
    }
    exposure = {f.node: f.status for f in exposed_all(G)}
    return {"nodes": nodes, "edges": edges, "exposure": exposure}


def diff(prev: dict, curr: dict, ts: float = 0.0) -> list[DriftEvent]:
    events: list[DriftEvent] = []

    for node, status in curr["exposure"].items():
        if status == "exposed" and prev["exposure"].get(node) != "exposed":
            events.append(
                DriftEvent(type="NEW_EXPOSURE", target=node, first_seen=ts, details={"status": status})
            )

    for node, info in curr["nodes"].items():
        if node not in prev["nodes"] and info["kind"] not in SKIP_KINDS:
            events.append(DriftEvent(type="NEW_LISTENER", target=node, first_seen=ts, details=info))

    for edge, info in curr["edges"].items():
        if edge not in prev["edges"] and info["kind"] == "flow":
            u, v = edge
            events.append(
                DriftEvent(type="NEW_FLOW", target=f"{u}->{v}", first_seen=ts, details=info)
            )

    for node in prev["nodes"]:
        if node not in curr["nodes"]:
            events.append(DriftEvent(type="REMOVED", target=node, first_seen=ts, details={"kind": "node"}))

    for edge in prev["edges"]:
        if edge not in curr["edges"]:
            u, v = edge
            events.append(
                DriftEvent(type="REMOVED", target=f"{u}->{v}", first_seen=ts, details={"kind": "edge"})
            )

    return events
