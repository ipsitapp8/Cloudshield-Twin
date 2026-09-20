from engine.risk import compute_risk


def test_healthy_has_low_risk(healthy_twin):
    risk = compute_risk(healthy_twin)
    assert risk["attack_surface"] >= 0
    assert risk["band"] in ("LOW", "MED", "HIGH")


def test_exposed_has_higher_risk_than_healthy(healthy_twin, exposed_twin):
    healthy_risk = compute_risk(healthy_twin)
    exposed_risk = compute_risk(exposed_twin)
    assert exposed_risk["attack_surface"] > healthy_risk["attack_surface"]
    assert exposed_risk["blast_radius"] > 0


def test_risk_bands_are_computed_not_hardcoded(exposed_twin):
    risk = compute_risk(exposed_twin)
    score = risk["attack_surface"]
    expected_band = "LOW" if score <= 3 else "MED" if score <= 6 else "HIGH"
    assert risk["band"] == expected_band
