import json
from pathlib import Path

import pytest
import yaml

from backend.apply import Applier, ApplyError
from backend.aws_layer import FakeAws
from engine.exposure import exposed
from engine.models import AgentSnapshot, AWSSnapshot, Patch, TwinConfig
from engine.remediate import best_patch, candidates
from engine.twin import build_twin

FIXTURES = Path(__file__).parent.parent.parent / "fixtures"


def _exposed_twin():
    config = TwinConfig.model_validate(yaml.safe_load((FIXTURES / "twin.yaml").read_text()))
    agent = AgentSnapshot.model_validate(json.loads((FIXTURES / "exposed" / "agent_snapshot.json").read_text()))
    aws = AWSSnapshot.model_validate(json.loads((FIXTURES / "exposed" / "aws_snapshot.json").read_text()))
    return build_twin(agent, aws, config)


@pytest.fixture
def applier(tmp_path):
    return Applier(configured_sg_id="sg-0abc123", audit_path=tmp_path / "audit.jsonl")


@pytest.fixture
def aws_source():
    return FakeAws(FIXTURES, scenario="exposed")


@pytest.fixture
def redis_sg_revoke_patch():
    G = _exposed_twin()
    finding = exposed("redis", G)
    return best_patch(G, finding)


def test_apply_requires_approve_true(applier, aws_source, redis_sg_revoke_patch):
    with pytest.raises(ApplyError, match="approve"):
        applier.apply(redis_sg_revoke_patch, approve=False, aws_source=aws_source)


def test_apply_succeeds_with_approve_and_allowlisted_sg(applier, aws_source, redis_sg_revoke_patch):
    result = applier.apply(redis_sg_revoke_patch, approve=True, aws_source=aws_source)
    assert result["status"] == "applied"


def test_port_22_is_rejected(applier, aws_source):
    bad = Patch(
        id="patch-bad-ssh",
        layer="aws",
        target="redis",
        op="sg_revoke",
        aws_cli=["aws ec2 revoke-security-group-ingress --group-id sg-0abc123 --protocol tcp --port 22 --cidr 0.0.0.0/0"],
        rollback=["aws ec2 authorize-security-group-ingress --group-id sg-0abc123 --protocol tcp --port 22 --cidr 0.0.0.0/0"],
    )
    with pytest.raises(ApplyError, match="protected"):
        applier.apply(bad, approve=True, aws_source=aws_source)


def test_agent_port_is_rejected(tmp_path, aws_source):
    applier = Applier(configured_sg_id="sg-0abc123", audit_path=tmp_path / "audit.jsonl", agent_port=8443)
    bad = Patch(
        id="patch-bad-agent",
        layer="aws",
        target="redis",
        op="sg_revoke",
        aws_cli=["aws ec2 revoke-security-group-ingress --group-id sg-0abc123 --protocol tcp --port 8443 --cidr 0.0.0.0/0"],
        rollback=["aws ec2 authorize-security-group-ingress --group-id sg-0abc123 --protocol tcp --port 8443 --cidr 0.0.0.0/0"],
    )
    with pytest.raises(ApplyError, match="protected"):
        applier.apply(bad, approve=True, aws_source=aws_source)


def test_unauthorized_security_group_is_rejected(applier, aws_source):
    bad = Patch(
        id="patch-wrong-sg",
        layer="aws",
        target="redis",
        op="sg_revoke",
        aws_cli=["aws ec2 revoke-security-group-ingress --group-id sg-OTHER --protocol tcp --port 6379 --cidr 0.0.0.0/0"],
        rollback=["aws ec2 authorize-security-group-ingress --group-id sg-OTHER --protocol tcp --port 6379 --cidr 0.0.0.0/0"],
    )
    with pytest.raises(ApplyError, match="allowlisted"):
        applier.apply(bad, approve=True, aws_source=aws_source)


def test_host_and_terraform_patches_are_never_applyable(applier, aws_source):
    G = _exposed_twin()
    finding = exposed("redis", G)
    for patch in candidates(G, finding):
        if patch.layer == "aws":
            continue
        with pytest.raises(ApplyError, match="preview-only"):
            applier.apply(patch, approve=True, aws_source=aws_source)


def test_rollback_information_is_stored_after_apply(applier, aws_source, redis_sg_revoke_patch):
    assert applier.get_rollback(redis_sg_revoke_patch.id) is None
    applier.apply(redis_sg_revoke_patch, approve=True, aws_source=aws_source)
    stored = applier.get_rollback(redis_sg_revoke_patch.id)
    assert stored is not None
    assert stored.rollback == redis_sg_revoke_patch.rollback


def test_rollback_restores_and_requires_prior_apply(applier, aws_source, redis_sg_revoke_patch):
    with pytest.raises(ApplyError, match="no rollback stored"):
        applier.rollback(redis_sg_revoke_patch.id, aws_source)

    applier.apply(redis_sg_revoke_patch, approve=True, aws_source=aws_source)
    result = applier.rollback(redis_sg_revoke_patch.id, aws_source)
    assert result["status"] == "rolled_back"
    assert applier.get_rollback(redis_sg_revoke_patch.id) is None


def test_audit_entry_created_for_apply_and_rollback(applier, aws_source, redis_sg_revoke_patch):
    applier.apply(redis_sg_revoke_patch, approve=True, aws_source=aws_source)
    applier.rollback(redis_sg_revoke_patch.id, aws_source)

    lines = applier.audit_path.read_text().strip().splitlines()
    assert len(lines) == 2
    apply_entry = json.loads(lines[0])
    rollback_entry = json.loads(lines[1])
    assert apply_entry["action"] == "apply"
    assert apply_entry["patch_id"] == redis_sg_revoke_patch.id
    assert rollback_entry["action"] == "rollback"
    assert "ts" in apply_entry
