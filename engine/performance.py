"""Performance diagnosis (live-monitoring extension §6/§7/§15). Pure: raw telemetry
dicts -> observed facts + evidence-backed findings. No I/O, no LLM, no invented score
-- every finding cites the exact observed numbers it's based on and carries an
explicit confidence level, never a hidden/arbitrary "AI score".
"""
from __future__ import annotations

CPU_BOTTLENECK_THRESHOLD = 85.0
DOMINANT_PROCESS_SHARE = 0.6  # a process explains "most of" CPU use above this share
MEMORY_PRESSURE_THRESHOLD = 90.0
SWAP_PRESSURE_THRESHOLD = 10.0
DISK_SPACE_THRESHOLD = 90.0

Finding = dict  # {"type", "evidence": list[str], "confidence", "explanation"}

_SEVERITY_RANK = {"CPU_BOTTLENECK": 3, "MEMORY_PRESSURE": 3, "SWAP_PRESSURE": 2, "DISK_SPACE_PRESSURE": 2, "NO_BOTTLENECK_DETECTED": 0}
_CONFIDENCE_RANK = {"high": 2, "medium": 1, "low": 0}


def _top_process(processes: list[dict]) -> dict | None:
    if not processes:
        return None
    return max(processes, key=lambda p: p.get("cpu_percent") or 0.0)


def diagnose(
    cpu: dict | None,
    memory: dict | None,
    disks: list[dict] | None = None,
    processes: list[dict] | None = None,
) -> dict:
    disks = disks or []
    processes = processes or []
    observed: dict = {}
    findings: list[Finding] = []

    if cpu is not None and cpu.get("percent") is not None:
        cpu_percent = cpu["percent"]
        observed["cpu_percent"] = cpu_percent
        top = _top_process(processes)
        if top is not None:
            observed["top_process"] = {"pid": top.get("pid"), "name": top.get("name"), "cpu_percent": top.get("cpu_percent")}
        if cpu_percent >= CPU_BOTTLENECK_THRESHOLD:
            evidence = [f"CPU utilization = {cpu_percent:.0f}%"]
            confidence = "medium"
            explanation = f"CPU utilization is at {cpu_percent:.0f}%, above the {CPU_BOTTLENECK_THRESHOLD:.0f}% threshold."
            if top is not None and (top.get("cpu_percent") or 0.0) >= cpu_percent * DOMINANT_PROCESS_SHARE:
                evidence.append(f"process {top.get('name')} (pid {top.get('pid')}) = {top.get('cpu_percent'):.0f}%")
                confidence = "high"
                explanation = f"Process {top.get('name')} (pid {top.get('pid')}) is the dominant observed CPU consumer at {top.get('cpu_percent'):.0f}%."
            findings.append({"type": "CPU_BOTTLENECK", "evidence": evidence, "confidence": confidence, "explanation": explanation})

    if memory is not None and memory.get("percent") is not None:
        mem_percent = memory["percent"]
        observed["memory_percent"] = mem_percent
        if mem_percent >= MEMORY_PRESSURE_THRESHOLD:
            findings.append(
                {
                    "type": "MEMORY_PRESSURE",
                    "evidence": [f"memory utilization = {mem_percent:.0f}%"],
                    "confidence": "high",
                    "explanation": f"Memory utilization is at {mem_percent:.0f}%, above the {MEMORY_PRESSURE_THRESHOLD:.0f}% threshold.",
                }
            )
        swap_percent = memory.get("swap_percent")
        if swap_percent is not None:
            observed["swap_percent"] = swap_percent
            if swap_percent >= SWAP_PRESSURE_THRESHOLD:
                findings.append(
                    {
                        "type": "SWAP_PRESSURE",
                        "evidence": [f"swap utilization = {swap_percent:.0f}%"],
                        "confidence": "medium",
                        "explanation": f"Swap is {swap_percent:.0f}% used, indicating memory pressure severe enough to spill to disk.",
                    }
                )

    if disks:
        observed["disks"] = [{"mountpoint": d.get("mountpoint"), "percent": d.get("percent")} for d in disks]
        for d in disks:
            percent = d.get("percent")
            if percent is not None and percent >= DISK_SPACE_THRESHOLD:
                findings.append(
                    {
                        "type": "DISK_SPACE_PRESSURE",
                        "evidence": [f"disk {d.get('mountpoint')} utilization = {percent:.0f}%"],
                        "confidence": "high",
                        "explanation": f"Disk {d.get('mountpoint')} is {percent:.0f}% full.",
                    }
                )

    if not findings:
        findings.append(
            {
                "type": "NO_BOTTLENECK_DETECTED",
                "evidence": [f"{k} = {v}" for k, v in observed.items() if not isinstance(v, (list, dict))],
                "confidence": "high",
                "explanation": "No observed resource crossed a pressure threshold.",
            }
        )

    return {"observed": observed, "findings": findings}


def summarize_history(samples: list[dict]) -> dict:
    """samples: [{"ts", "cpu_percent", "memory_percent"}, ...], oldest-first."""
    series = [s for s in samples if s.get("cpu_percent") is not None]
    result: dict = {"series": series, "trend": None}
    if len(series) < 3:
        return result  # not enough data to honestly claim a trend

    first, last = series[0], series[-1]
    delta = (last["cpu_percent"] or 0) - (first["cpu_percent"] or 0)
    if abs(delta) >= 30:
        direction = "rose sharply" if delta > 0 else "dropped sharply"
        result["trend"] = (
            f"CPU usage {direction} from {first['cpu_percent']:.0f}% to {last['cpu_percent']:.0f}% "
            f"over the observed window."
        )
    return result


def explain(diagnosis: dict) -> str:
    """Deterministic 'WHY SLOW?' narrative. Never an LLM guess (§15) -- picks the
    dominant finding by confidence then severity and cites its own evidence."""
    findings = diagnosis.get("findings", [])
    if not findings:
        return "No telemetry was available to diagnose."

    def rank(f: dict) -> tuple:
        confidence = f.get("confidence") or ""
        ftype = f.get("type") or ""
        return (_CONFIDENCE_RANK.get(confidence, 0), _SEVERITY_RANK.get(ftype, 0))

    dominant = max(findings, key=rank)
    if dominant["type"] == "NO_BOTTLENECK_DETECTED":
        return "No clear bottleneck detected from the currently observed telemetry."
    return dominant["explanation"]
