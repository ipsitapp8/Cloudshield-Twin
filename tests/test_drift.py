from engine.drift import diff, fingerprint


def test_drift_healthy_to_exposed_emits_new_exposure(healthy_twin, exposed_twin):
    prev = fingerprint(healthy_twin)
    curr = fingerprint(exposed_twin)
    events = diff(prev, curr)

    new_exposures = [e for e in events if e.type == "NEW_EXPOSURE"]
    assert any(e.target == "redis" for e in new_exposures)


def test_drift_no_change_emits_nothing(healthy_twin):
    prev = fingerprint(healthy_twin)
    curr = fingerprint(healthy_twin)
    events = diff(prev, curr)
    assert events == []
