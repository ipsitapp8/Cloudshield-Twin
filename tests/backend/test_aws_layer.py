from pathlib import Path

from backend.aws_layer import FakeAws, get_aws_source

FIXTURES = Path(__file__).parent.parent.parent / "fixtures"


def test_fake_aws_works_without_credentials(monkeypatch):
    for var in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_MODE"):
        monkeypatch.delenv(var, raising=False)
    source = get_aws_source(FIXTURES)
    assert isinstance(source, FakeAws)
    snapshot = source.get_snapshot()
    assert snapshot.instance.id == "i-0123456789abcdef0"
    assert "sg-0abc123" in snapshot.security_groups


def test_fake_aws_scenario_switch_reflects_in_snapshot():
    source = FakeAws(FIXTURES, scenario="healthy")
    healthy = source.get_snapshot()
    assert len(healthy.security_groups["sg-0abc123"].inbound) == 1

    source.set_scenario("exposed")
    exposed = source.get_snapshot()
    assert len(exposed.security_groups["sg-0abc123"].inbound) == 2


def test_fake_aws_revoke_ingress_mutates_in_memory_copy():
    source = FakeAws(FIXTURES, scenario="exposed")
    before = source.get_snapshot()
    assert any(r.from_port == 6379 for r in before.security_groups["sg-0abc123"].inbound)

    source.revoke_ingress("sg-0abc123", 6379, "0.0.0.0/0")
    after = source.get_snapshot()
    assert not any(r.from_port == 6379 for r in after.security_groups["sg-0abc123"].inbound)

    # underlying fixture file on disk is untouched
    fresh = FakeAws(FIXTURES, scenario="exposed").get_snapshot()
    assert any(r.from_port == 6379 for r in fresh.security_groups["sg-0abc123"].inbound)
