from engine.exposure import exposed
from engine.models import Patch
from engine.remediate import best_patch, candidates, validate_patch
from engine.risk import compute_risk


def test_best_patch_is_sg_revoke_and_passes_invariants(exposed_twin):
    finding = exposed("redis", exposed_twin)
    patch = best_patch(exposed_twin, finding)

    assert patch is not None
    assert patch.op == "sg_revoke"
    assert patch.layer == "aws"
    assert all(patch.invariants.values())
    assert patch.accepted is True
    assert patch.after["attack_surface"] < patch.before["attack_surface"]


def test_iptables_and_bind_localhost_candidates_are_rejected_for_removing_flow(exposed_twin):
    finding = exposed("redis", exposed_twin)
    results = {p.op: p for p in candidates(exposed_twin, finding)}

    assert results["iptables_drop"].accepted is False
    assert results["iptables_drop"].invariants["no_flows_removed"] is False

    assert results["bind_localhost"].accepted is False
    assert results["bind_localhost"].invariants["no_flows_removed"] is False


def test_patch_touching_port_22_is_rejected(exposed_twin):
    bad_patch = Patch(
        id="patch-bad-ssh",
        layer="aws",
        target="redis",
        op="sg_revoke",
        aws_cli=["aws ec2 revoke-security-group-ingress --group-id sg-0abc123 --protocol tcp --port 22 --cidr 0.0.0.0/0"],
        rollback=["aws ec2 authorize-security-group-ingress --group-id sg-0abc123 --protocol tcp --port 22 --cidr 0.0.0.0/0"],
    )
    validated = validate_patch(exposed_twin, bad_patch)
    assert validated.accepted is False
    assert validated.invariants["port22_and_agent_untouched"] is False
