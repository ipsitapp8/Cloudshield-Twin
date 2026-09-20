"""Risk scoring (§5.D). Pure: DiGraph -> risk dict. All numbers computed, never hardcoded."""
from __future__ import annotations

import networkx as nx

from engine.attack import simulate_attack
from engine.exposure import exposed_all

LOW_MAX = 3
MED_MAX = 6


def _band(score: float) -> str:
    if score <= LOW_MAX:
        return "LOW"
    if score <= MED_MAX:
        return "MED"
    return "HIGH"


def compute_risk(G: nx.DiGraph) -> dict:
    findings = exposed_all(G)
    exposed_nodes = [f for f in findings if f.status == "exposed"]

    breakdown = []
    total = 0.0
    max_blast_radius = 0

    for f in exposed_nodes:
        data = G.nodes[f.node]
        sensitivity = data.get("sensitivity", 0)
        noauth_mult = 2 if data.get("noauth") else 1
        result = simulate_attack(G, "public_service", f.node)
        reaches_sensitive = len(result["paths"]) > 0
        sensitive_mult = 1.5 if reaches_sensitive else 1
        score = sensitivity * noauth_mult * sensitive_mult
        total += score
        max_blast_radius = max(max_blast_radius, result["blast_radius"])
        breakdown.append(
            {
                "node": f.node,
                "sensitivity": sensitivity,
                "noauth": bool(data.get("noauth")),
                "reaches_sensitive": reaches_sensitive,
                "score": score,
            }
        )

    return {
        "attack_surface": total,
        "band": _band(total),
        "blast_radius": max_blast_radius,
        "breakdown": breakdown,
    }
