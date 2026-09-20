def test_topology_and_iam_bucket_present(healthy_twin):
    G = healthy_twin
    assert set(["nginx", "api", "postgres", "redis"]).issubset(G.nodes)
    assert G.has_edge("nginx", "api")
    assert G.has_edge("api", "postgres")
    assert G.has_edge("api", "redis")
    assert G.nodes["redis"]["kind"] == "datastore"
    assert G.nodes["postgres"]["sensitivity"] == 3
    assert "demo-data" in G.nodes
    assert G.nodes["demo-data"]["kind"] == "aws_bucket"
