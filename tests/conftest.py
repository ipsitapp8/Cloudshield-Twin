import json
from pathlib import Path

import pytest
import yaml

from engine.models import AgentSnapshot, AWSSnapshot, TwinConfig
from engine.twin import build_twin

FIXTURES = Path(__file__).parent.parent / "fixtures"


def _load_scenario(name: str):
    agent = AgentSnapshot.model_validate(json.loads((FIXTURES / name / "agent_snapshot.json").read_text()))
    aws = AWSSnapshot.model_validate(json.loads((FIXTURES / name / "aws_snapshot.json").read_text()))
    return agent, aws


@pytest.fixture(scope="session")
def twin_config() -> TwinConfig:
    data = yaml.safe_load((FIXTURES / "twin.yaml").read_text())
    return TwinConfig.model_validate(data)


def _make_twin_fixture(name: str):
    @pytest.fixture
    def _fixture(twin_config):
        agent, aws = _load_scenario(name)
        return build_twin(agent, aws, twin_config)

    return _fixture


healthy_twin = _make_twin_fixture("healthy")
latent_twin = _make_twin_fixture("latent")
exposed_twin = _make_twin_fixture("exposed")
