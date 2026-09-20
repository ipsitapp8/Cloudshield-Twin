"""Remediation algorithm (§5.E). Pure: DiGraph + Finding -> Patch candidates, simulated on copies."""
from __future__ import annotations

import networkx as nx

from engine.exposure import PUBLIC_CIDRS, exposed
from engine.models import Finding, Patch
from engine.risk import compute_risk

LOCAL_IPS = {"127.0.0.1", "::1"}
LAYER_RANK = {"aws": 0, "host": 1, "terraform": 2}


def _make_candidates(G: nx.DiGraph, finding: Finding) -> list[Patch]:
    node = finding.node
    data = G.nodes[node]
    port = data["ports"][0]
    sg_ids = G.graph.get("sg_ids", [])

    patches = [
        Patch(
            id=f"patch-sg-revoke-{node}-{port}",
            layer="aws",
            target=node,
            op="sg_revoke",
            aws_cli=[
                f"aws ec2 revoke-security-group-ingress --group-id {sg} --protocol tcp --port {port} --cidr 0.0.0.0/0"
                for sg in sg_ids
            ],
            rollback=[
                f"aws ec2 authorize-security-group-ingress --group-id {sg} --protocol tcp --port {port} --cidr 0.0.0.0/0"
                for sg in sg_ids
            ],
        ),
        Patch(
            id=f"patch-iptables-drop-{node}-{port}",
            layer="host",
            target=node,
            op="iptables_drop",
            iptables=[f"iptables -A INPUT -p tcp --dport {port} ! -s 127.0.0.1 -j DROP"],
            rollback=[f"iptables -D INPUT -p tcp --dport {port} ! -s 127.0.0.1 -j DROP"],
        ),
        Patch(
            id=f"patch-bind-localhost-{node}-{port}",
            layer="terraform",
            target=node,
            op="bind_localhost",
            terraform=f"# preview only: rebind {node} to 127.0.0.1 for port {port}",
            rollback=[f"# rollback: restore {node} bind to {data['bind']}"],
        ),
    ]

    # + allow app source only if the observed client is remote (not this host / loopback)
    remote_clients = [
        via
        for _, _, via in _flow_vias(G, node)
        if via not in LOCAL_IPS and via != G.graph.get("private_ip")
    ]
    if remote_clients:
        patches[0].aws_cli.extend(
            f"aws ec2 authorize-security-group-ingress --group-id {sg} --protocol tcp --port {port} --cidr {ip}/32"
            for sg in sg_ids
            for ip in remote_clients
        )

    return patches


def _flow_vias(G: nx.DiGraph, target: str) -> list[tuple[str, str, str]]:
    return [
        (u, target, data["via"])
        for u, _, data in G.in_edges(target, data=True)
        if data.get("kind") == "flow" and "via" in data
    ]


def _apply(G: nx.DiGraph, patch: Patch) -> nx.DiGraph:
    H = G.copy()
    node = patch.target
    port = G.nodes[node]["ports"][0]

    if patch.op == "sg_revoke":
        sgs = {k: {**v, "inbound": list(v["inbound"])} for k, v in H.graph["security_groups"].items()}
        for sg in sgs.values():
            sg["inbound"] = [
                r
                for r in sg["inbound"]
                if not (r["cidr"] in PUBLIC_CIDRS and r["from_port"] <= port <= r["to_port"])
            ]
        H.graph["security_groups"] = sgs

    elif patch.op == "iptables_drop":
        for u, v, data in list(H.in_edges(node, data=True)):
            if data.get("kind") == "flow" and data.get("via") not in LOCAL_IPS:
                H.remove_edge(u, v)

    elif patch.op == "bind_localhost":
        H.nodes[node]["bind"] = "127.0.0.1"
        for u, v, data in list(H.in_edges(node, data=True)):
            if data.get("kind") == "flow" and data.get("via") not in LOCAL_IPS:
                H.remove_edge(u, v)

    return H


def _port22_untouched(G: nx.DiGraph, patch: Patch) -> bool:
    target_ports = G.nodes[patch.target].get("ports", [])
    if 22 in target_ports:
        return False
    for cmd in [*patch.aws_cli, *patch.iptables]:
        if "port 22" in cmd or "dport 22" in cmd:
            return False
    return True


def validate_patch(G: nx.DiGraph, patch: Patch) -> Patch:
    H = _apply(G, patch)

    before_flows = {(u, v) for u, v, d in G.edges(data=True) if d.get("kind") == "flow" and d.get("observed")}
    after_flows = {(u, v) for u, v, d in H.edges(data=True) if d.get("kind") == "flow" and d.get("observed")}

    invariants = {
        "not_internet_reachable": exposed(patch.target, H).status != "exposed",
        "no_flows_removed": before_flows.issubset(after_flows),
        "port22_and_agent_untouched": _port22_untouched(G, patch),
        "rollback_exists": len(patch.rollback) > 0,
    }
    accepted = all(invariants.values())

    before_risk = compute_risk(G)
    after_risk = compute_risk(H)

    patch.invariants = invariants
    patch.accepted = accepted
    patch.before = {"attack_surface": before_risk["attack_surface"], "band": before_risk["band"]}
    patch.after = {"attack_surface": after_risk["attack_surface"], "band": after_risk["band"]}
    if not accepted:
        patch.reason = "rejected: " + ", ".join(k for k, v in invariants.items() if not v)
    return patch


def candidates(G: nx.DiGraph, finding: Finding) -> list[Patch]:
    return [validate_patch(G, p) for p in _make_candidates(G, finding)]


def best_patch(G: nx.DiGraph, finding: Finding) -> Patch | None:
    validated = candidates(G, finding)
    accepted = [p for p in validated if p.accepted]
    if not accepted:
        return None
    accepted.sort(key=lambda p: (LAYER_RANK[p.layer], len(p.aws_cli) + len(p.iptables)))
    return accepted[0]
