"""Attack path algorithm (§5.C). Pure: DiGraph -> attack DiGraph + result dicts."""
from __future__ import annotations

import networkx as nx

from engine.exposure import exposed_all
from engine.twin import IMDS

ENTRY_TYPES = {"public_service", "compromised_service", "stolen_credential", "malicious_process"}


def _find_by_kind(G: nx.DiGraph, kind: str) -> str | None:
    for node, data in G.nodes(data=True):
        if data.get("kind") == kind:
            return node
    return None


def build_attack_graph(G: nx.DiGraph) -> nx.DiGraph:
    """flows + exposes + RULES, all rule edges tagged potential + MITRE id.

    Only "flow" and "grants" edges from the twin represent traversable network/credential
    paths for an attacker; "runs_on" is structural (not a hop) and is intentionally excluded.
    """
    AG = nx.DiGraph()
    AG.add_nodes_from(G.nodes(data=True))
    for u, v, data in G.edges(data=True):
        if data.get("kind") in ("flow", "grants"):
            AG.add_edge(u, v, **data, potential=False)

    host_id = _find_by_kind(G, "host")
    role_id = _find_by_kind(G, "aws_role")
    findings = {f.node: f for f in exposed_all(G)}

    # exposes: internet -> exposed service
    for node, finding in findings.items():
        if finding.status == "exposed":
            AG.add_edge("internet", node, kind="exposes", observed=True, dep="none", potential=False)

    # RULE: exposed noauth redis -> host (T1190)
    for node, finding in findings.items():
        if finding.status == "exposed" and G.nodes[node].get("noauth"):
            if host_id:
                AG.add_edge(node, host_id, kind="flow", observed=False, dep="none", potential=True, mitre="T1190")

    # RULE: host -> all services on it (lateral movement)
    if host_id:
        for node, data in G.nodes(data=True):
            if data.get("kind") in ("service", "datastore") and node != host_id:
                AG.add_edge(host_id, node, kind="flow", observed=False, dep="none", potential=True, mitre="T1210")

    # RULE: compromised service/host -> imds -> role (T1552.005)
    if host_id and G.has_node(IMDS) and role_id:
        AG.add_edge(host_id, IMDS, kind="flow", observed=False, dep="none", potential=True, mitre="T1552.005")
        AG.add_edge(IMDS, role_id, kind="grants", observed=False, dep="none", potential=True, mitre="T1552.005")

    # RULE: role -> buckets from role_permissions (already grants edges in G)
    if role_id:
        for _, dst, data in G.out_edges(role_id, data=True):
            if data.get("kind") == "grants":
                AG.add_edge(role_id, dst, **{**data, "potential": True})

    return AG


def simulate_attack(G: nx.DiGraph, entry_type: str, entry_node: str) -> dict:
    AG = build_attack_graph(G)

    sensitive = [
        n
        for n, d in G.nodes(data=True)
        if d.get("sensitivity", 0) >= 2 or d.get("kind") == "aws_bucket"
    ]

    paths = {}
    for target in sensitive:
        if target == entry_node:
            continue
        if AG.has_node(entry_node) and AG.has_node(target) and nx.has_path(AG, entry_node, target):
            path = nx.shortest_path(AG, entry_node, target)
            mitre_ids = sorted(
                {
                    AG.edges[a, b]["mitre"]
                    for a, b in zip(path, path[1:])
                    if AG.edges[a, b].get("mitre")
                }
            )
            paths[target] = {
                "path": path,
                "hops": len(path) - 1,
                "mitre": mitre_ids,
                "potential": True,
            }

    blast_radius = len(nx.descendants(AG, entry_node)) if AG.has_node(entry_node) else 0

    return {
        "entry_type": entry_type,
        "entry_node": entry_node,
        "paths": paths,
        "blast_radius": blast_radius,
    }
