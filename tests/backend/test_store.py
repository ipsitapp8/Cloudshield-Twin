from backend.store import Store


def test_add_and_latest_snapshot():
    store = Store(":memory:")
    store.add_snapshot("agent", {"n": 1}, ts=1.0)
    store.add_snapshot("agent", {"n": 2}, ts=2.0)
    latest = store.latest_snapshot("agent")
    assert latest["payload"] == {"n": 2}


def test_keeps_latest_200_snapshots():
    store = Store(":memory:")
    for i in range(250):
        store.add_snapshot("agent", {"n": i}, ts=float(i))
    assert store.count_snapshots("agent") == 200
    snapshots = store.list_snapshots("agent", limit=200)
    assert snapshots[0]["payload"] == {"n": 249}
    oldest_kept = min(s["payload"]["n"] for s in snapshots)
    assert oldest_kept == 50


def test_events_are_independent_of_snapshots():
    store = Store(":memory:")
    store.add_event("NEW_EXPOSURE", {"target": "redis"})
    events = store.list_events()
    assert events[0]["type"] == "NEW_EXPOSURE"
    assert events[0]["payload"]["target"] == "redis"
