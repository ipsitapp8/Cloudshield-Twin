from engine.failure import simulate_failure, spof


def test_redis_failure_degrades_api_and_endpoints(healthy_twin, twin_config):
    result = simulate_failure(healthy_twin, "redis", twin_config)
    assert result["affected_services"]["api"] == "degraded"
    assert result["affected_endpoints"]["/checkout"] == "FAILED"
    assert result["affected_endpoints"]["/products"] == "DEGRADED"


def test_postgres_failure_fails_both_endpoints(healthy_twin, twin_config):
    result = simulate_failure(healthy_twin, "postgres", twin_config)
    assert result["affected_services"]["api"] == "down"
    assert result["affected_endpoints"]["/checkout"] == "FAILED"
    assert result["affected_endpoints"]["/products"] == "FAILED"


def test_spof_ranks_postgres_above_redis(healthy_twin, twin_config):
    ranking = spof(healthy_twin, twin_config)
    by_node = {r["node"]: r["count"] for r in ranking}
    assert by_node["postgres"] >= by_node["redis"]
