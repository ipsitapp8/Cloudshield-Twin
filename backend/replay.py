"""Offline replay progression over fixtures/ (§1, §6 POST /replay/step).

Works with zero AWS credentials and no real VM: each step loads a canned
agent_snapshot.json/aws_snapshot.json pair from fixtures/<scenario>/.
"""
from __future__ import annotations

import json
from pathlib import Path

from engine.models import AgentSnapshot, AWSSnapshot

SCENARIOS = ["healthy", "latent", "exposed", "fixed"]


class ReplayState:
    def __init__(self, fixtures_dir: Path):
        self._dir = Path(fixtures_dir)
        self._index = 0

    @property
    def scenario(self) -> str:
        return SCENARIOS[self._index]

    @property
    def is_at_end(self) -> bool:
        return self._index == len(SCENARIOS) - 1

    def reset(self) -> str:
        self._index = 0
        return self.scenario

    def step(self) -> str:
        self._index = min(self._index + 1, len(SCENARIOS) - 1)
        return self.scenario

    def load(self) -> tuple[AgentSnapshot, AWSSnapshot]:
        agent = AgentSnapshot.model_validate(
            json.loads((self._dir / self.scenario / "agent_snapshot.json").read_text())
        )
        aws = AWSSnapshot.model_validate(
            json.loads((self._dir / self.scenario / "aws_snapshot.json").read_text())
        )
        return agent, aws
