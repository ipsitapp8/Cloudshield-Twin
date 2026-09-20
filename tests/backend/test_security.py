"""Phase 5: adversarial security hardening.

Each test attempts a concrete bypass/attack against the real FastAPI app (or the
Applier/FakeAws units directly) and asserts it is safely rejected -- never a silent
success, a crash, an information leak, or an executed command.
"""
from __future__ import annotations

import json
import socket
from pathlib import Path

import pytest

from backend.apply import Applier, ApplyError
from backend.aws_layer import FakeAws
from backend.main import probe_tcp
from engine.models import Patch

FIXTURES = Path(__file__).parent.parent.parent / "fixtures"
SOURCE_DIRS = [Path(__file__).parent.parent.parent / "backend", Path(__file__).parent.parent.parent / "engine"]
FORBIDDEN_EXEC_PATTERNS = [
    "subprocess",
    "os.system(",
    "os.popen(",
    "Popen(",
    "check_output(",
    "check_call(",
    "eval(",
    "exec(",
]


def _replay_to_exposed(client):
    client.post("/replay/step")  # -> latent
    client.post("/replay/step")  # -> exposed


# -- 1. APPLY SAFETY ----------------------------------------------------------------


def test_no_execution_primitives_exist_anywhere_in_backend_or_engine():
    """Structural guarantee: no shell/iptables/Terraform/eval execution path can exist,
    regardless of what a future patch/finding/context contains, because the primitives
    to run one aren't imported anywhere in the pure engine or the backend."""
    for directory in SOURCE_DIRS:
        for path in directory.rglob("*.py"):
            text = path.read_text(encoding="utf-8")
            for pattern in FORBIDDEN_EXEC_PATTERNS:
                assert pattern not in text, f"forbidden execution primitive {pattern!r} found in {path}"


def test_apply_without_approve_field_at_all_is_rejected(client):
    _replay_to_exposed(client)
    patch_id = client.get("/fix/exposure-redis").json()["best_patch_id"]
    resp = client.post(f"/fix/{patch_id}/apply", json={})
    assert resp.status_code == 400


def test_apply_with_falsy_approve_variants_is_rejected(client):
    _replay_to_exposed(client)
    patch_id = client.get("/fix/exposure-redis").json()["best_patch_id"]
    for falsy in (False, "false", "no", 0):
        resp = client.post(f"/fix/{patch_id}/apply", json={"approve": falsy})
        assert resp.status_code == 400, f"approve={falsy!r} must not apply"


def test_forged_patch_cannot_be_applied_only_server_computed_ids_work(client):
    """An attacker cannot POST an arbitrary Patch payload -- /fix/{patch_id}/apply takes
    only an id string and approve bool; the server looks up its own computed candidate."""
    _replay_to_exposed(client)
    resp = client.post(
        "/fix/patch-does-not-exist/apply",
        json={"approve": True, "aws_cli": ["aws ec2 revoke-security-group-ingress --group-id sg-0abc123 --protocol tcp --port 22 --cidr 0.0.0.0/0"]},
    )
    assert resp.status_code == 404


def test_preview_endpoint_never_mutates_state(client):
    """GET /fix/{finding_id} is preview-only: calling it repeatedly must never itself
    change exposure state or write to the audit log."""
    _replay_to_exposed(client)
    before = client.get("/fix/exposure-redis").json()
    for _ in range(5):
        client.get("/fix/exposure-redis")
    after = client.get("/fix/exposure-redis").json()
    assert before == after
    assert not (client.app.state.backend.applier.audit_path).exists()


def test_apply_rejected_paths_never_write_an_audit_entry(client):
    _replay_to_exposed(client)
    patch_id = client.get("/fix/exposure-redis").json()["best_patch_id"]
    audit_path = client.app.state.backend.applier.audit_path

    client.post(f"/fix/{patch_id}/apply", json={"approve": False})
    assert not audit_path.exists()

    client.post("/fix/patch-does-not-exist/apply", json={"approve": True})
    assert not audit_path.exists()


def test_port_with_leading_zeros_still_matches_protected_port(tmp_path):
    """'0022' must still parse to the protected port 22, not bypass via a zero-padded
    string that int()-parsing might treat differently."""
    applier = Applier(configured_sg_id="sg-0abc123", audit_path=tmp_path / "audit.jsonl")
    aws_source = FakeAws(FIXTURES, scenario="exposed")
    bad = Patch(
        id="patch-zero-padded-ssh",
        layer="aws",
        target="redis",
        op="sg_revoke",
        aws_cli=["aws ec2 revoke-security-group-ingress --group-id sg-0abc123 --protocol tcp --port 0022 --cidr 0.0.0.0/0"],
        rollback=["aws ec2 authorize-security-group-ingress --group-id sg-0abc123 --protocol tcp --port 0022 --cidr 0.0.0.0/0"],
    )
    with pytest.raises(ApplyError, match="protected"):
        applier.apply(bad, approve=True, aws_source=aws_source)


def test_no_endpoint_other_than_fix_apply_and_rollback_can_mutate_aws(client, backend, monkeypatch):
    """Spy on the aws_source mutation methods and hit every other route: none of them
    may ever call revoke_ingress/authorize_ingress."""
    calls = []
    monkeypatch.setattr(backend.aws_source, "revoke_ingress", lambda *a, **k: calls.append(("revoke", a)))
    monkeypatch.setattr(backend.aws_source, "authorize_ingress", lambda *a, **k: calls.append(("authorize", a)))

    client.get("/twin")
    client.post("/simulate/failure", json={"node": "redis"})
    client.post("/simulate/attack", json={"entry_type": "public_service", "node": "internet"})
    client.get("/spof")
    client.get("/fix/exposure-redis")
    client.get("/probe", params={"port": 6379})
    client.get("/events")
    client.post("/explain", json={"context": {"kind": "finding"}})
    client.post("/replay/step")
    client.post("/replay/reset")

    assert calls == []


# -- 2. INPUT VALIDATION -------------------------------------------------------------


def test_malformed_ingest_body_is_rejected_cleanly_not_500(client, auth_headers):
    resp = client.post("/ingest", json={"not_a_valid": "snapshot"}, headers=auth_headers)
    assert resp.status_code == 422
    assert resp.headers["content-type"].startswith("application/json")


def test_ingest_non_object_json_is_rejected(client, auth_headers):
    resp = client.post("/ingest", json=[1, 2, 3], headers=auth_headers)
    assert resp.status_code == 422


def test_probe_out_of_range_port_never_crashes(monkeypatch):
    """Some platforms raise OverflowError (not an OSError subclass) for a port outside
    0-65535 -- probe_tcp must still resolve to a safe 'unknown', never propagate."""

    def raise_overflow(addr, timeout):
        raise OverflowError("getsockaddrarg: port must be 0-65535.")

    monkeypatch.setattr(socket, "create_connection", raise_overflow)
    result = probe_tcp("10.0.1.5", 999999999, timeout=0.2)
    assert result["status"] == "unknown"
    assert result["status"] != "reachable"


def test_probe_out_of_range_port_via_api_never_500s(client, monkeypatch):
    def raise_overflow(addr, timeout):
        raise OverflowError("getsockaddrarg: port must be 0-65535.")

    monkeypatch.setattr(socket, "create_connection", raise_overflow)
    client.post("/replay/reset")
    resp = client.get("/probe", params={"port": 999999999})
    assert resp.status_code == 200
    assert resp.json()["status"] == "unknown"


@pytest.mark.parametrize(
    "malicious_id",
    [
        "exposure-redis' OR '1'='1",
        "../../etc/passwd",
        "<script>alert(1)</script>",
        "x" * 5000,
        "exposure-redis%00",
    ],
)
def test_malicious_finding_ids_are_rejected_not_500(client, malicious_id):
    client.post("/replay/reset")
    resp = client.get(f"/fix/{malicious_id}")
    assert resp.status_code in (404, 422)


@pytest.mark.parametrize(
    "malicious_id",
    [
        "patch-sg-revoke-redis-6379' OR '1'='1",
        "../../etc/passwd",
        "x" * 5000,
    ],
)
def test_malicious_patch_ids_are_rejected_not_500(client, malicious_id):
    client.post("/replay/reset")
    resp = client.post(f"/fix/{malicious_id}/apply", json={"approve": True})
    assert resp.status_code in (404, 422)


def test_malicious_node_names_are_rejected_not_500(client):
    client.post("/replay/reset")
    for node in ["'; DROP TABLE snapshots; --", "../../etc/passwd", "\x00\x01", "x" * 5000]:
        resp = client.post("/simulate/failure", json={"node": node})
        assert resp.status_code == 404
        resp = client.post("/simulate/attack", json={"entry_type": "public_service", "node": node})
        assert resp.status_code == 404


def test_invalid_entry_type_is_rejected(client):
    resp = client.post("/simulate/attack", json={"entry_type": "sql_injection", "node": "internet"})
    assert resp.status_code == 400


def test_malformed_json_body_is_rejected_not_500(client, auth_headers):
    resp = client.post(
        "/ingest",
        content=b"{not valid json",
        headers={**auth_headers, "Content-Type": "application/json"},
    )
    assert resp.status_code == 422


def test_unexpected_http_methods_are_rejected(client):
    assert client.get("/fix/x/apply").status_code == 405
    assert client.put("/twin").status_code == 405
    assert client.delete("/fix/x/rollback").status_code == 405


def test_websocket_binary_frame_does_not_crash_connection(client):
    with client.websocket_connect("/ws") as ws:
        initial = ws.receive_json()
        assert initial["type"] == "TWIN"

        ws.send_bytes(b"\x00\x01\x02\x03")

        # connection must still be alive and receiving broadcasts afterward
        client.post("/replay/step")
        step_msg = ws.receive_json()
        assert step_msg["type"] == "REPLAY_STEP"

    # server itself must still be responsive after the bad frame
    assert client.get("/twin").status_code == 200


def test_explain_rejects_non_dict_context(client):
    resp = client.post("/explain", json={"context": "rm -rf /"})
    assert resp.status_code == 422
    resp = client.post("/explain", json={"context": ["rm -rf /"]})
    assert resp.status_code == 422
    resp = client.post("/explain", json={"context": None})
    assert resp.status_code == 422


def test_explain_with_adversarial_nested_context_is_still_safe(client):
    nasty = {"kind": "finding", "node": "<script>alert(1)</script>", "status": "'; DROP TABLE x; --", "nested": {"a": [1, 2, {"b": "x" * 10000}]}}
    resp = client.post("/explain", json={"context": nasty})
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "template"
    assert body["generated_by"] == "deterministic"


# -- 4. AWS SECURITY -----------------------------------------------------------------


def test_fake_aws_rejects_unknown_scenario_name():
    with pytest.raises(ValueError):
        FakeAws(FIXTURES, scenario="../../etc/passwd")


def test_fake_aws_set_scenario_rejects_path_traversal_attempt():
    source = FakeAws(FIXTURES, scenario="healthy")
    with pytest.raises(ValueError):
        source.set_scenario("../../../etc")
    # state is unchanged after the rejected attempt
    assert source.scenario == "healthy"


# -- 5. REPLAY SECURITY ---------------------------------------------------------------


def test_replay_endpoints_accept_no_scenario_input_at_all(client):
    """/replay/step and /replay/reset take no body -- there is no way for a caller to
    name an arbitrary scenario/fixture path through the API."""
    resp = client.post("/replay/step", json={"scenario": "../../etc/passwd"})
    assert resp.status_code == 200
    assert resp.json()["scenario"] == "latent"  # extra/unknown body fields are ignored, not honored


# -- 6. API SECURITY -------------------------------------------------------------------


def test_500_error_body_never_leaks_a_stack_trace_or_file_path(backend_app, monkeypatch, backend):
    from fastapi.testclient import TestClient

    backend.replay_reset()  # mode must not be "unconnected", or /twin never calls build_twin at all

    def boom():
        raise RuntimeError("simulated internal failure")

    monkeypatch.setattr(backend, "build_twin", boom)
    lenient_client = TestClient(backend_app, raise_server_exceptions=False)
    resp = lenient_client.get("/twin")
    assert resp.status_code == 500
    assert "Traceback" not in resp.text
    assert ".py" not in resp.text
    assert "simulated internal failure" not in resp.text


def test_ingest_wrong_auth_scheme_rejected(client):
    resp = client.post("/ingest", json={"ts": 1.0}, headers={"Authorization": "Basic dXNlcjpwYXNz"})
    assert resp.status_code == 401


def test_ingest_token_not_leaked_in_error_response(client):
    resp = client.post("/ingest", json={"ts": 1.0}, headers={"Authorization": "Bearer wrong-token"})
    assert resp.status_code == 401
    assert "test-token" not in resp.text


# -- 8. AUDIT / ROLLBACK ---------------------------------------------------------------


def test_rollback_of_never_applied_patch_id_is_rejected(client):
    resp = client.post("/fix/patch-never-applied/rollback")
    assert resp.status_code == 400


def test_rollback_cannot_be_replayed_twice(client):
    _replay_to_exposed(client)
    patch_id = client.get("/fix/exposure-redis").json()["best_patch_id"]
    client.post(f"/fix/{patch_id}/apply", json={"approve": True})

    first = client.post(f"/fix/{patch_id}/rollback")
    assert first.status_code == 200

    second = client.post(f"/fix/{patch_id}/rollback")
    assert second.status_code == 400


def test_audit_log_is_append_only_and_prior_entries_survive(client):
    _replay_to_exposed(client)
    patch_id = client.get("/fix/exposure-redis").json()["best_patch_id"]
    audit_path = client.app.state.backend.applier.audit_path

    client.post(f"/fix/{patch_id}/apply", json={"approve": True})
    first_lines = audit_path.read_text().strip().splitlines()
    assert len(first_lines) == 1

    client.post(f"/fix/{patch_id}/rollback")
    second_lines = audit_path.read_text().strip().splitlines()
    assert len(second_lines) == 2
    # the original apply entry is untouched by the later rollback write
    assert second_lines[0] == first_lines[0]
    assert json.loads(second_lines[0])["action"] == "apply"
    assert json.loads(second_lines[1])["action"] == "rollback"
