"""Apply layer (§5.E, §7 safety). The ONLY mutation this module allows is the SG
revoke/authorize operation encoded in an already-computed engine.models.Patch, on the
one configured security group, never on port 22 or the agent channel.

No arbitrary shell commands. No host/iptables execution. No Terraform execution.
Preview by default; apply requires approve=True; every apply/rollback is audited.
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path

from engine.models import Patch

from backend.aws_layer import AwsSource

PROTECTED_PORTS_DEFAULT = {22}
_SG_CLI_RE = re.compile(r"--group-id (\S+).*?--port (\d+).*?--cidr (\S+)")


class ApplyError(Exception):
    pass


class Applier:
    def __init__(
        self,
        configured_sg_id: str,
        audit_path: Path,
        agent_port: int | None = None,
        protected_ports: set[int] | None = None,
    ):
        self.configured_sg_id = configured_sg_id
        self.audit_path = Path(audit_path)
        self.protected_ports = set(protected_ports or PROTECTED_PORTS_DEFAULT)
        if agent_port:
            self.protected_ports.add(agent_port)
        self._rollbacks: dict[str, Patch] = {}

    # -- validation -----------------------------------------------------

    def _parsed_commands(self, patch: Patch) -> list[tuple[str, int, str]]:
        parsed = []
        for cmd in patch.aws_cli:
            match = _SG_CLI_RE.search(cmd)
            if not match:
                raise ApplyError(f"unparseable aws_cli command: {cmd!r}")
            sg_id, port, cidr = match.group(1), int(match.group(2)), match.group(3)
            parsed.append((sg_id, port, cidr))
        return parsed

    def check(self, patch: Patch) -> str | None:
        """Return a rejection reason, or None if the patch may be applied."""
        if patch.layer != "aws" or patch.op != "sg_revoke":
            return "only aws sg_revoke patches may be applied (host/terraform patches are preview-only)"
        if not patch.rollback:
            return "rollback missing"
        if not patch.aws_cli:
            return "no aws_cli commands to apply"
        try:
            commands = self._parsed_commands(patch)
        except ApplyError as exc:
            return str(exc)
        for sg_id, port, _cidr in commands:
            if sg_id != self.configured_sg_id:
                return f"security group {sg_id} is not the configured allowlisted group"
            if port in self.protected_ports:
                return f"port {port} is protected (ssh/agent channel) and cannot be modified"
        return None

    # -- preview / apply / rollback --------------------------------------

    def preview(self, patch: Patch) -> dict:
        reason = self.check(patch)
        return {"patch": patch.model_dump(), "applyable": reason is None, "reason": reason}

    def apply(self, patch: Patch, approve: bool, aws_source: AwsSource) -> dict:
        if not approve:
            raise ApplyError("approve:true is required to apply a patch")
        reason = self.check(patch)
        if reason:
            raise ApplyError(reason)

        for sg_id, port, cidr in self._parsed_commands(patch):
            aws_source.revoke_ingress(sg_id, port, cidr)

        self._rollbacks[patch.id] = patch
        self._audit("apply", patch)
        return {"status": "applied", "patch_id": patch.id}

    def get_rollback(self, patch_id: str) -> Patch | None:
        return self._rollbacks.get(patch_id)

    def rollback(self, patch_id: str, aws_source: AwsSource) -> dict:
        patch = self._rollbacks.get(patch_id)
        if not patch:
            raise ApplyError(f"no rollback stored for patch {patch_id}")

        for cmd in patch.rollback:
            match = _SG_CLI_RE.search(cmd)
            if not match:
                continue
            sg_id, port, cidr = match.group(1), int(match.group(2)), match.group(3)
            aws_source.authorize_ingress(sg_id, port, cidr)

        self._audit("rollback", patch)
        del self._rollbacks[patch_id]
        return {"status": "rolled_back", "patch_id": patch_id}

    # -- audit ------------------------------------------------------------

    def _audit(self, action: str, patch: Patch) -> None:
        entry = {
            "ts": time.time(),
            "action": action,
            "patch_id": patch.id,
            "layer": patch.layer,
            "target": patch.target,
            "aws_cli": patch.aws_cli,
            "rollback": patch.rollback,
        }
        self.audit_path.parent.mkdir(parents=True, exist_ok=True)
        with self.audit_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
