from engine.performance import diagnose, explain, summarize_history


def test_cpu_bottleneck_high_confidence_when_one_process_dominates():
    result = diagnose(
        cpu={"percent": 94.0, "per_core": [], "load_avg": None, "freq_mhz": None},
        memory={"percent": 40.0, "swap_percent": 0.0},
        processes=[{"pid": 1234, "name": "python", "cpu_percent": 81.0}, {"pid": 2, "name": "idle", "cpu_percent": 1.0}],
    )
    finding = next(f for f in result["findings"] if f["type"] == "CPU_BOTTLENECK")
    assert finding["confidence"] == "high"
    assert "CPU utilization = 94%" in finding["evidence"]
    assert any("python" in e and "81%" in e for e in finding["evidence"])
    assert "python" in finding["explanation"] and "1234" in finding["explanation"]


def test_cpu_bottleneck_medium_confidence_when_spread_across_processes():
    result = diagnose(
        cpu={"percent": 90.0, "per_core": [], "load_avg": None, "freq_mhz": None},
        memory=None,
        processes=[{"pid": 1, "name": "a", "cpu_percent": 20.0}, {"pid": 2, "name": "b", "cpu_percent": 20.0}, {"pid": 3, "name": "c", "cpu_percent": 20.0}],
    )
    finding = next(f for f in result["findings"] if f["type"] == "CPU_BOTTLENECK")
    assert finding["confidence"] == "medium"


def test_cpu_below_threshold_produces_no_cpu_finding():
    result = diagnose(cpu={"percent": 40.0, "per_core": [], "load_avg": None, "freq_mhz": None}, memory=None)
    assert not any(f["type"] == "CPU_BOTTLENECK" for f in result["findings"])


def test_memory_pressure_detected_with_evidence():
    result = diagnose(cpu=None, memory={"percent": 95.0, "swap_percent": 0.0})
    finding = next(f for f in result["findings"] if f["type"] == "MEMORY_PRESSURE")
    assert finding["confidence"] == "high"
    assert "memory utilization = 95%" in finding["evidence"]


def test_swap_pressure_detected_separately_from_memory():
    result = diagnose(cpu=None, memory={"percent": 50.0, "swap_percent": 25.0})
    assert not any(f["type"] == "MEMORY_PRESSURE" for f in result["findings"])
    finding = next(f for f in result["findings"] if f["type"] == "SWAP_PRESSURE")
    assert "swap utilization = 25%" in finding["evidence"]


def test_disk_space_pressure_detected_per_mountpoint():
    result = diagnose(cpu=None, memory=None, disks=[{"mountpoint": "/", "percent": 95.0}, {"mountpoint": "/data", "percent": 10.0}])
    findings = [f for f in result["findings"] if f["type"] == "DISK_SPACE_PRESSURE"]
    assert len(findings) == 1
    assert "disk / utilization = 95%" in findings[0]["evidence"]


def test_no_bottleneck_detected_when_nothing_crosses_threshold():
    result = diagnose(cpu={"percent": 10.0, "per_core": [], "load_avg": None, "freq_mhz": None}, memory={"percent": 20.0, "swap_percent": 0.0})
    assert len(result["findings"]) == 1
    assert result["findings"][0]["type"] == "NO_BOTTLENECK_DETECTED"


def test_no_telemetry_at_all_still_returns_a_safe_result():
    result = diagnose(cpu=None, memory=None)
    assert result["observed"] == {}
    assert result["findings"][0]["type"] == "NO_BOTTLENECK_DETECTED"


def test_summarize_history_too_few_samples_has_no_trend():
    result = summarize_history([{"ts": 1, "cpu_percent": 30.0}, {"ts": 2, "cpu_percent": 90.0}])
    assert result["trend"] is None
    assert len(result["series"]) == 2


def test_summarize_history_sharp_rise_produces_trend_sentence():
    samples = [
        {"ts": 1, "cpu_percent": 34.0},
        {"ts": 2, "cpu_percent": 41.0},
        {"ts": 3, "cpu_percent": 89.0},
        {"ts": 4, "cpu_percent": 94.0},
    ]
    result = summarize_history(samples)
    assert result["trend"] is not None
    assert "34%" in result["trend"] and "94%" in result["trend"]


def test_summarize_history_stable_series_has_no_trend():
    samples = [{"ts": i, "cpu_percent": 40.0 + i} for i in range(5)]
    result = summarize_history(samples)
    assert result["trend"] is None


def test_explain_picks_dominant_finding_and_cites_its_evidence():
    diagnosis = diagnose(
        cpu={"percent": 96.0, "per_core": [], "load_avg": None, "freq_mhz": None},
        memory={"percent": 50.0, "swap_percent": 0.0},
        processes=[{"pid": 1234, "name": "python", "cpu_percent": 90.0}],
    )
    text = explain(diagnosis)
    assert "python" in text and "1234" in text


def test_explain_with_no_bottleneck_says_so_plainly():
    diagnosis = diagnose(cpu={"percent": 5.0, "per_core": [], "load_avg": None, "freq_mhz": None}, memory=None)
    assert explain(diagnosis) == "No clear bottleneck detected from the currently observed telemetry."


def test_explain_never_invents_a_diagnosis_when_no_findings_at_all():
    assert explain({"observed": {}, "findings": []}) == "No telemetry was available to diagnose."
