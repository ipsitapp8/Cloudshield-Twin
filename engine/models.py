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
    # Optional real-machine identity (populated by agent/agent.py in live mode;
    # always None/absent for fixtures -- unread by every existing engine algorithm).
    hostname: str | None = None
    os: str | None = None
    kernel: str | None = None
    arch: str | None = None
    uptime_seconds: float | None = None
    cloud_id: str | None = None


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


# --- Real telemetry (§3 of the live-monitoring extension). All fields are optional/
# empty-default: the agent fills in whatever the OS actually exposes and leaves the
# rest unset rather than inventing values. Nothing in engine/{twin,exposure,failure,
# attack,risk,remediate,drift}.py reads these -- they exist for the performance/
# network-analysis layer, not yet built (see the live-monitoring plan).


class CpuInfo(BaseModel):
    percent: float | None = None
    per_core: list[float] = Field(default_factory=list)
    load_avg: list[float] | None = None  # None on platforms without getloadavg (Windows)
    freq_mhz: float | None = None


class MemoryInfo(BaseModel):
    total: int | None = None
    used: int | None = None
    available: int | None = None
    percent: float | None = None
    swap_total: int | None = None
    swap_used: int | None = None
    swap_percent: float | None = None


class DiskInfo(BaseModel):
    device: str
    mountpoint: str
    total: int | None = None
    used: int | None = None
    free: int | None = None
    percent: float | None = None


class ProcessInfo(BaseModel):
    pid: int | None = None
    ppid: int | None = None
    name: str = "unknown"
    exe: str | None = None
    user: str = "unknown"
    cpu_percent: float | None = None
    memory_percent: float | None = None
    create_time: float | None = None
    cmdline: list[str] | None = None


class NetworkInterfaceInfo(BaseModel):
    name: str
    addresses: list[str] = Field(default_factory=list)
    is_up: bool | None = None
    bytes_sent: int | None = None
    bytes_recv: int | None = None
    packets_sent: int | None = None
    packets_recv: int | None = None
    errin: int | None = None
    errout: int | None = None
    dropin: int | None = None
    dropout: int | None = None


class AgentSnapshot(BaseModel):
    ts: float
    host: Host
    listeners: list[Listener] = Field(default_factory=list)
    conns: list[Conn] = Field(default_factory=list)
    containers: list[Container] = Field(default_factory=list)
    firewall: Firewall | None = None
    checks: Checks = Field(default_factory=Checks)
    # Real telemetry -- always absent/default for fixtures, always populated (to the
    # extent the OS allows) by agent/agent.py. `source` is how the backend tells a
    # real agent snapshot apart from a replayed fixture (§21 mode tracking).
    cpu: CpuInfo | None = None
    memory: MemoryInfo | None = None
    disks: list[DiskInfo] = Field(default_factory=list)
    network_interfaces: list[NetworkInterfaceInfo] = Field(default_factory=list)
    processes: list[ProcessInfo] = Field(default_factory=list)
    source: Literal["live", "demo"] = "demo"


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
