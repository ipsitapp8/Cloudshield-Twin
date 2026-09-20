from pathlib import Path

from backend.replay import SCENARIOS, ReplayState

FIXTURES = Path(__file__).parent.parent.parent / "fixtures"


def test_replay_progression_healthy_to_fixed():
    state = ReplayState(FIXTURES)

    assert state.scenario == "healthy"
    assert state.step() == "latent"
    assert state.step() == "exposed"
    assert state.step() == "fixed"
    assert SCENARIOS == ["healthy", "latent", "exposed", "fixed"]

    # stays at the end instead of erroring past it
    assert state.step() == "fixed"


def test_replay_reset_returns_to_healthy():
    state = ReplayState(FIXTURES)
    state.step()
    state.step()
    assert state.reset() == "healthy"


def test_replay_load_works_offline_for_every_scenario():
    state = ReplayState(FIXTURES)
    for _ in SCENARIOS:
        agent, aws = state.load()
        assert agent.host.instance_id == aws.instance.id
        state.step()
