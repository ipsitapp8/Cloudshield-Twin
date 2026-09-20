from engine.attack import simulate_attack


def test_attack_path_internet_to_demo_data(exposed_twin):
    result = simulate_attack(exposed_twin, "public_service", "internet")
    assert "demo-data" in result["paths"]
    entry = result["paths"]["demo-data"]
    assert entry["path"] == ["internet", "redis", "i-0123456789abcdef0", "imds", "arn:aws:iam::123456789012:role/demo-role", "demo-data"]
    assert entry["potential"] is True
    assert "T1190" in entry["mitre"]
    assert "T1552.005" in entry["mitre"]


def test_latent_has_no_attack_path_to_demo_data(latent_twin):
    result = simulate_attack(latent_twin, "public_service", "internet")
    assert "demo-data" not in result["paths"]
