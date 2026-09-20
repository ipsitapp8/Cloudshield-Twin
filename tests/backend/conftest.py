import pytest
from fastapi.testclient import TestClient

from backend.main import create_app

INGEST_TOKEN = "test-token"


@pytest.fixture
def backend_app(tmp_path):
    return create_app(
        audit_path=tmp_path / "audit.jsonl",
        db_path=str(tmp_path / "store.db"),
        ingest_token=INGEST_TOKEN,
    )


@pytest.fixture
def backend(backend_app):
    return backend_app.state.backend


@pytest.fixture
def client(backend_app):
    return TestClient(backend_app)


@pytest.fixture
def auth_headers():
    return {"Authorization": f"Bearer {INGEST_TOKEN}"}
