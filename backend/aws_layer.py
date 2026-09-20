"""AWS access layer (§1, §6). RealAws performs read-only describe calls plus the single
allowlisted SG mutation used by backend/apply.py. FakeAws replays fixtures/ offline.

AWS_MODE env var selects the source: "real" (boto3, needs credentials) or "fake" (default).
boto3 is imported lazily inside RealAws so fake/replay mode never requires it to be installed.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Protocol
from urllib.parse import unquote

from engine.models import AWSSnapshot, Instance, RolePermission, SecurityGroup


class AwsSource(Protocol):
    def get_snapshot(self) -> AWSSnapshot: ...

    def revoke_ingress(self, sg_id: str, port: int, cidr: str) -> None: ...

    def authorize_ingress(self, sg_id: str, port: int, cidr: str) -> None: ...


class FakeAws:
    """Offline source backed by fixtures/<scenario>/aws_snapshot.json. Never touches the network."""

    def __init__(self, fixtures_dir: Path, scenario: str = "healthy"):
        self._dir = Path(fixtures_dir)
        self.scenario = scenario
        self._override: dict | None = None  # in-memory mutation from apply(), scenario-local

    def set_scenario(self, scenario: str) -> None:
        self.scenario = scenario
        self._override = None

    def get_snapshot(self) -> AWSSnapshot:
        if self._override is not None:
            return AWSSnapshot.model_validate(self._override)
        data = json.loads((self._dir / self.scenario / "aws_snapshot.json").read_text())
        return AWSSnapshot.model_validate(data)

    def revoke_ingress(self, sg_id: str, port: int, cidr: str) -> None:
        snapshot = self.get_snapshot().model_dump(by_alias=True)
        sg = snapshot["security_groups"].get(sg_id)
        if not sg:
            return
        sg["inbound"] = [
            r for r in sg["inbound"] if not (r["from"] <= port <= r["to"] and r["cidr"] == cidr)
        ]
        self._override = snapshot

    def authorize_ingress(self, sg_id: str, port: int, cidr: str) -> None:
        snapshot = self.get_snapshot().model_dump(by_alias=True)
        sg = snapshot["security_groups"].setdefault(sg_id, {"inbound": []})
        sg["inbound"].append({"proto": "tcp", "from": port, "to": port, "cidr": cidr})
        self._override = snapshot


class RealAws:
    """boto3-backed source. Read-only describes, plus the one allowlisted SG mutation.
    Never called by tests in this repo (no AWS credentials in this environment)."""

    def __init__(self, instance_id: str, region: str | None = None):
        import boto3  # lazy: only required when AWS_MODE=real

        self._ec2 = boto3.client("ec2", region_name=region)
        self._iam = boto3.client("iam", region_name=region)
        self.instance_id = instance_id

    def _describe_instance(self) -> dict:
        resp = self._ec2.describe_instances(InstanceIds=[self.instance_id])
        reservation = resp["Reservations"][0]["Instances"][0]
        sg_ids = [g["GroupId"] for g in reservation.get("SecurityGroups", [])]
        role_arn = ""
        iam_profile = reservation.get("IamInstanceProfile")
        if iam_profile:
            role_arn = self._role_arn_from_instance_profile(iam_profile["Arn"])
        metadata_options = reservation.get("MetadataOptions", {})
        return {
            "id": reservation["InstanceId"],
            "sg_ids": sg_ids,
            "imds_http_tokens": metadata_options.get("HttpTokens", "optional"),
            "role": role_arn,
        }

    def _role_arn_from_instance_profile(self, profile_arn: str) -> str:
        profile_name = profile_arn.rsplit("/", 1)[-1]
        resp = self._iam.get_instance_profile(InstanceProfileName=profile_name)
        roles = resp["InstanceProfile"]["Roles"]
        return roles[0]["Arn"] if roles else ""

    def _describe_security_groups(self, sg_ids: list[str]) -> dict[str, SecurityGroup]:
        if not sg_ids:
            return {}
        resp = self._ec2.describe_security_groups(GroupIds=sg_ids)
        groups: dict[str, SecurityGroup] = {}
        for sg in resp["SecurityGroups"]:
            inbound = []
            for perm in sg.get("IpPermissions", []):
                proto = perm.get("IpProtocol", "tcp")
                from_port = perm.get("FromPort", 0)
                to_port = perm.get("ToPort", 65535)
                for ip_range in perm.get("IpRanges", []):
                    inbound.append(
                        {"proto": proto, "from": from_port, "to": to_port, "cidr": ip_range["CidrIp"]}
                    )
                for ip_range in perm.get("Ipv6Ranges", []):
                    inbound.append(
                        {"proto": proto, "from": from_port, "to": to_port, "cidr": ip_range["CidrIpv6"]}
                    )
            groups[sg["GroupId"]] = SecurityGroup.model_validate({"inbound": inbound})
        return groups

    def _describe_role_permissions(self, role_arn: str) -> list[RolePermission]:
        if not role_arn:
            return []
        role_name = role_arn.rsplit("/", 1)[-1]
        permissions: list[RolePermission] = []
        attached = self._iam.list_attached_role_policies(RoleName=role_name)
        for policy in attached.get("AttachedPolicies", []):
            version_id = self._iam.get_policy(PolicyArn=policy["PolicyArn"])["Policy"]["DefaultVersionId"]
            version = self._iam.get_policy_version(PolicyArn=policy["PolicyArn"], VersionId=version_id)
            document = self._parse_policy_document(version["PolicyVersion"]["Document"])
            permissions.extend(self._statements_to_permissions(document))
        inline = self._iam.list_role_policies(RoleName=role_name)
        for name in inline.get("PolicyNames", []):
            inline_policy = self._iam.get_role_policy(RoleName=role_name, PolicyName=name)
            document = self._parse_policy_document(inline_policy["PolicyDocument"])
            permissions.extend(self._statements_to_permissions(document))
        return permissions

    @staticmethod
    def _parse_policy_document(raw: object) -> dict:
        # IAM returns policy documents as URL-encoded JSON strings, not dicts.
        if isinstance(raw, str):
            return json.loads(unquote(raw))
        return raw  # type: ignore[return-value]

    @staticmethod
    def _statements_to_permissions(document: dict) -> list[RolePermission]:
        statements = document.get("Statement", [])
        if isinstance(statements, dict):
            statements = [statements]
        out = []
        for stmt in statements:
            if stmt.get("Effect") != "Allow":
                continue
            actions = stmt.get("Action", [])
            actions = [actions] if isinstance(actions, str) else actions
            resources = stmt.get("Resource", [])
            resources = [resources] if isinstance(resources, str) else resources
            for action in actions:
                for resource in resources:
                    out.append(RolePermission(action=action, resource=resource))
        return out

    def get_snapshot(self) -> AWSSnapshot:
        instance = self._describe_instance()
        security_groups = self._describe_security_groups(instance["sg_ids"])
        role_permissions = self._describe_role_permissions(instance["role"])
        return AWSSnapshot(
            instance=Instance.model_validate(instance),
            security_groups=security_groups,
            role_permissions=role_permissions,
        )

    def revoke_ingress(self, sg_id: str, port: int, cidr: str) -> None:
        self._ec2.revoke_security_group_ingress(
            GroupId=sg_id,
            IpPermissions=[
                {
                    "IpProtocol": "tcp",
                    "FromPort": port,
                    "ToPort": port,
                    "IpRanges": [{"CidrIp": cidr}] if ":" not in cidr else [],
                    "Ipv6Ranges": [{"CidrIpv6": cidr}] if ":" in cidr else [],
                }
            ],
        )

    def authorize_ingress(self, sg_id: str, port: int, cidr: str) -> None:
        self._ec2.authorize_security_group_ingress(
            GroupId=sg_id,
            IpPermissions=[
                {
                    "IpProtocol": "tcp",
                    "FromPort": port,
                    "ToPort": port,
                    "IpRanges": [{"CidrIp": cidr}] if ":" not in cidr else [],
                    "Ipv6Ranges": [{"CidrIpv6": cidr}] if ":" in cidr else [],
                }
            ],
        )


def get_aws_source(fixtures_dir: Path, scenario: str = "healthy") -> AwsSource:
    mode = os.environ.get("AWS_MODE", "fake")
    if mode == "real":
        instance_id = os.environ["AWS_INSTANCE_ID"]
        region = os.environ.get("AWS_REGION")
        return RealAws(instance_id, region)
    return FakeAws(fixtures_dir, scenario)
