"""Pydantic v2 models for agent/AWS snapshots, twin.yaml, Finding, Patch.

engine/ is pure: these models only hold data, no I/O.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------------------
# Agent snapshot (§3)
# ---------------------------------------------------------------------------


class Host(BaseModel):
    instance_id: str
    private_ip: str
    public_ip: str | None = None


class Listener(BaseModel):
    pid: int
    proc: str
    user: str
    proto: str
    bind: str
    port: int


class Conn(BaseModel):
    pid: int
    proc: str
    laddr: str
    raddr: str
    status: str


class Container(BaseModel):
    name: str
    image: str
    ports: list[int] = Field(default_factory=list)


class FirewallRule(BaseModel):
    proto: str = "tcp"
    port: int
    action: Literal["allow", "deny"] = "allow"
    src: str = "0.0.0.0/0"


class Firewall(BaseModel):
    backend: str
    input_policy: Literal["allow", "deny"]
    rules: list[FirewallRule] = Field(default_factory=list)


class Checks(BaseModel):
    redis_noauth: bool = False


class AgentSnapshot(BaseModel):
    ts: float
    host: Host
    listeners: list[Listener] = Field(default_factory=list)
    conns: list[Conn] = Field(default_factory=list)
    containers: list[Container] = Field(default_factory=list)
    firewall: Firewall | None = None
    checks: Checks = Field(default_factory=Checks)


# ---------------------------------------------------------------------------
# AWS snapshot (§3)
# ---------------------------------------------------------------------------


class SGRule(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    proto: str
    from_port: int = Field(alias="from")
    to_port: int = Field(alias="to")
    cidr: str


class SecurityGroup(BaseModel):
    inbound: list[SGRule] = Field(default_factory=list)


class Instance(BaseModel):
    id: str
    sg_ids: list[str]
    imds_http_tokens: Literal["required", "optional"] = "optional"
    role: str


class RolePermission(BaseModel):
    action: str
    resource: str


class AWSSnapshot(BaseModel):
    instance: Instance
    security_groups: dict[str, SecurityGroup] = Field(default_factory=dict)
    role_permissions: list[RolePermission] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# twin.yaml (§3)
# ---------------------------------------------------------------------------


class Endpoint(BaseModel):
    hard: list[str] = Field(default_factory=list)
    soft: list[str] = Field(default_factory=list)


class TwinConfig(BaseModel):
    tiers: dict[str, int] = Field(default_factory=dict)
    endpoints: dict[str, Endpoint] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Findings / Patches (§5)
# ---------------------------------------------------------------------------

ExposureStatus = Literal["exposed", "latent", "internal", "closed"]


class Finding(BaseModel):
    id: str
    node: str
    status: ExposureStatus
    evidence: dict[str, bool]
    confidence: Literal["high", "low"] = "high"


class Patch(BaseModel):
    id: str
    layer: Literal["aws", "host", "terraform"]
    target: str
    op: Literal["sg_revoke", "iptables_drop", "bind_localhost"] | None = None
    aws_cli: list[str] = Field(default_factory=list)
    iptables: list[str] = Field(default_factory=list)
    terraform: str | None = None
    rollback: list[str] = Field(default_factory=list)
    before: dict = Field(default_factory=dict)
    after: dict = Field(default_factory=dict)
    invariants: dict[str, bool] = Field(default_factory=dict)
    accepted: bool = False
    reason: str | None = None


class DriftEvent(BaseModel):
    type: Literal["NEW_EXPOSURE", "NEW_LISTENER", "NEW_FLOW", "REMOVED"]
    target: str
    first_seen: float
    details: dict = Field(default_factory=dict)
