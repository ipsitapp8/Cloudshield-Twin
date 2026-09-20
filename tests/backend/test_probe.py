import socket

from backend.main import probe_tcp


def test_probe_reachable(monkeypatch):
    class FakeSocket:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    monkeypatch.setattr(socket, "create_connection", lambda addr, timeout: FakeSocket())
    result = probe_tcp("10.0.1.5", 6379, timeout=2.0)
    assert result["status"] == "reachable"
    assert result["reason"] is None


def test_probe_connection_refused_is_unreachable(monkeypatch):
    def raise_refused(addr, timeout):
        raise ConnectionRefusedError()

    monkeypatch.setattr(socket, "create_connection", raise_refused)
    result = probe_tcp("10.0.1.5", 6379, timeout=2.0)
    assert result["status"] == "unreachable"
    assert result["reason"] == "connection_refused"


def test_probe_timeout_is_unreachable(monkeypatch):
    def raise_timeout(addr, timeout):
        raise socket.timeout()

    monkeypatch.setattr(socket, "create_connection", raise_timeout)
    result = probe_tcp("10.0.1.5", 6379, timeout=0.2)
    assert result["status"] == "unreachable"
    assert result["reason"] == "timeout"


def test_probe_ambiguous_os_error_is_unknown_not_fixed(monkeypatch):
    """An unrelated failure (e.g. DNS/network routing) must never be reported as
    'reachable' or silently treated as proof a service was fixed."""

    def raise_other(addr, timeout):
        raise OSError("network is unreachable")

    monkeypatch.setattr(socket, "create_connection", raise_other)
    result = probe_tcp("10.0.1.5", 6379, timeout=0.2)
    assert result["status"] == "unknown"
    assert result["status"] != "reachable"
    assert "network is unreachable" in result["reason"]
