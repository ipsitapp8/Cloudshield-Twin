from engine.exposure import exposed


def test_latent_is_not_exposed(latent_twin):
    finding = exposed("redis", latent_twin)
    assert finding.status == "latent"
    assert finding.status != "exposed"
    assert finding.evidence["sg"] is True
    assert finding.evidence["bind"] is False


def test_healthy_redis_is_closed(healthy_twin):
    finding = exposed("redis", healthy_twin)
    assert finding.status == "closed"


def test_exposed_redis_has_three_layer_evidence(exposed_twin):
    finding = exposed("redis", exposed_twin)
    assert finding.status == "exposed"
    assert finding.evidence == {"bind": True, "host_fw": True, "sg": True}
    assert all(finding.evidence.values())
    assert len(finding.evidence) == 3
