"""Explain layer (§6 POST /explain, §7 safety). Bedrock is optional: the backend must
work with zero AI configuration via a deterministic template fallback.

The model only ever receives structured JSON (already-computed engine output) and its
reply is treated as inert display text -- never parsed as commands, never executed,
never fed back into engine/backend/apply.
"""
from __future__ import annotations

import concurrent.futures
import json
import os

from engine import performance as performance_engine

BEDROCK_TIMEOUT_SECONDS = 8


def explain(context: dict) -> dict:
    """context is structured JSON produced by the engine (finding/failure/attack/risk).
    Returns {"source": "template"|"bedrock", "generated_by": "deterministic"|"ai", "text": str}.
    """
    if os.environ.get("BEDROCK_ENABLED", "false").lower() == "true":
        try:
            return _explain_bedrock(context)
        except Exception as exc:  # Bedrock unavailable/misconfigured/timed out -> fall back
            fallback = _explain_template(context)
            fallback["bedrock_error"] = str(exc)
            return fallback
    return _explain_template(context)


def _explain_template(context: dict) -> dict:
    kind = context.get("kind")
    if kind == "finding":
        text = (
            f"{context.get('node')} is {context.get('status')} "
            f"(confidence: {context.get('confidence', 'high')})."
        )
    elif kind == "failure":
        endpoints = context.get("affected_endpoints", {})
        failed = [e for e, s in endpoints.items() if s == "FAILED"]
        degraded = [e for e, s in endpoints.items() if s == "DEGRADED"]
        text = (
            f"Failing {context.get('node')} would fail: {', '.join(failed) or 'none'}; "
            f"degrade: {', '.join(degraded) or 'none'}."
        )
    elif kind == "attack":
        text = (
            f"From {context.get('entry_node')}, {len(context.get('paths', {}))} sensitive "
            f"asset(s) are potentially reachable (blast radius {context.get('blast_radius', 0)})."
        )
    elif kind == "risk":
        text = f"Attack surface {context.get('attack_surface')} ({context.get('band')})."
    elif kind == "performance":
        text = performance_engine.explain(context)
    else:
        text = "No structured context recognized; no explanation generated."
    return {"source": "template", "generated_by": "deterministic", "text": text}


def _explain_bedrock(context: dict) -> dict:
    import boto3  # lazy: only required when BEDROCK_ENABLED=true

    def _invoke() -> str:
        client = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION"))
        model_id = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-3-haiku-20240307-v1:0")
        body = json.dumps(
            {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 300,
                "messages": [
                    {
                        "role": "user",
                        "content": (
                            "Explain this security finding in one or two plain-English "
                            "sentences for an operator. Structured JSON only, no commands:\n"
                            + json.dumps(context)
                        ),
                    }
                ],
            }
        )
        response = client.invoke_model(modelId=model_id, body=body)
        payload = json.loads(response["body"].read())
        return payload["content"][0]["text"]

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        text = pool.submit(_invoke).result(timeout=BEDROCK_TIMEOUT_SECONDS)

    return {"source": "bedrock", "generated_by": "ai", "text": text}
