from backend.llm import explain


def test_explain_is_deterministic_without_bedrock(monkeypatch):
    monkeypatch.delenv("BEDROCK_ENABLED", raising=False)
    result = explain({"kind": "finding", "node": "redis", "status": "exposed", "confidence": "high"})
    assert result["source"] == "template"
    assert result["generated_by"] == "deterministic"
    assert "redis" in result["text"]
    assert "exposed" in result["text"]


def test_explain_failure_context():
    result = explain(
        {
            "kind": "failure",
            "node": "redis",
            "affected_endpoints": {"/checkout": "FAILED", "/products": "DEGRADED"},
        }
    )
    assert result["source"] == "template"
    assert "/checkout" in result["text"]


def test_explain_unknown_context_is_safe():
    result = explain({"kind": "mystery"})
    assert result["source"] == "template"
    assert isinstance(result["text"], str)


def test_bedrock_failure_falls_back_to_template(monkeypatch):
    monkeypatch.setenv("BEDROCK_ENABLED", "true")
    result = explain({"kind": "finding", "node": "redis", "status": "exposed"})
    assert result["source"] == "template"
    assert "bedrock_error" in result
