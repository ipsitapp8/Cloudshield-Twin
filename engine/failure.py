"""Failure propagation algorithm (§5.B). Pure: DiGraph + TwinConfig -> result dicts."""
from __future__ import annotations

import networkx as nx

from engine.models import TwinConfig

_RANK = {"ok": 0, "degraded": 1, "down": 2}


def _propagate(G: nx.DiGraph, start: str) -> dict[str, str]:
    state = {n: "ok" for n in G.nodes}
    state[start] = "down"
    frontier = [start]
    while frontier:
        x = frontier.pop()
        xs = state[x]
        for y, _, data in G.in_edges(x, data=True):
            dep = data.get("dep")
            if dep not in ("hard", "soft"):
                continue
            if xs == "down":
                new = "down" if dep == "hard" else "degraded"
            elif xs == "degraded" and dep == "hard":
                new = "degraded"
            else:
                continue
            if _RANK[new] > _RANK[state[y]]:
                state[y] = new
                frontier.append(y)
    return state


def _endpoint_status(state: dict[str, str], hard: list[str], soft: list[str]) -> str:
    if any(state.get(n) == "down" for n in hard):
        return "FAILED"
    if any(state.get(n) == "degraded" for n in hard):
        return "DEGRADED"
    if any(state.get(n) in ("degraded", "down") for n in soft):
        return "DEGRADED"
    return "OK"


def simulate_failure(G: nx.DiGraph, node: str, config: TwinConfig) -> dict:
    state = _propagate(G, node)
    affected_services = {n: s for n, s in state.items() if s != "ok"}

    affected_endpoints = {}
    for name, ep in config.endpoints.items():
        affected_endpoints[name] = _endpoint_status(state, ep.hard, ep.soft)

    critical_paths = {}
    for n in affected_services:
        if n == node:
            continue
        if nx.has_path(G, n, node):
            critical_paths[n] = nx.shortest_path(G, n, node)

    order = sorted(affected_services, key=lambda n: (0 if n == node else len(critical_paths.get(n, [n]))))
    recovery_order = list(reversed(order))

    return {
        "node": node,
        "affected_services": affected_services,
        "affected_endpoints": affected_endpoints,
        "critical_paths": critical_paths,
        "recovery_order": recovery_order,
    }


def spof(G: nx.DiGraph, config: TwinConfig) -> list[dict]:
    ranking = []
    for node, data in G.nodes(data=True):
        if data.get("kind") not in ("service", "datastore"):
            continue
        result = simulate_failure(G, node, config)
        failed = [ep for ep, status in result["affected_endpoints"].items() if status == "FAILED"]
        ranking.append({"node": node, "failed_endpoints": failed, "count": len(failed)})
    ranking.sort(key=lambda r: r["count"], reverse=True)
    return ranking
