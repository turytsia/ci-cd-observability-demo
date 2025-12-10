"""
Create GitHub Summary

Generates a markdown summary for GitHub Actions job summary
with observability metrics and test results.
"""

import json
import os
import sys
from datetime import datetime


def load_json_file(filepath: str) -> dict:
    """Load JSON file if it exists."""
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            return json.load(f)
    return {}


def format_duration(seconds: float) -> str:
    """Format duration in human-readable form."""
    if seconds < 1:
        return f"{seconds*1000:.0f}ms"
    elif seconds < 60:
        return f"{seconds:.2f}s"
    else:
        mins = int(seconds // 60)
        secs = seconds % 60
        return f"{mins}m {secs:.0f}s"


def get_status_emoji(passed: int, failed: int) -> str:
    """Get status emoji based on test results."""
    if failed == 0:
        return "✅"
    elif failed < passed:
        return "⚠️"
    else:
        return "❌"


def main():
    output_dir = os.environ.get("OBSERVABILITY_OUTPUT", "observability_output")
    
    # Load data files
    obs_data = load_json_file(os.path.join(output_dir, "observability_data.json"))
    test_data = load_json_file(os.path.join(output_dir, "test_observability.json"))
    
    # Extract metrics
    metrics = obs_data.get("metrics", {})
    counters = metrics.get("counters", {})
    gauges = metrics.get("gauges", {})
    timers = metrics.get("timers", {})
    
    traces = obs_data.get("traces", {})
    logs = obs_data.get("logs", [])
    
    # Count log levels
    log_levels = {"DEBUG": 0, "INFO": 0, "WARN": 0, "ERROR": 0, "CRITICAL": 0}
    for log in logs:
        level = log.get("level", "INFO")
        if level in log_levels:
            log_levels[level] += 1
    
    # Test summary
    test_summary = test_data.get("summary", {})
    total_tests = test_summary.get("total_tests", 0)
    passed_tests = test_summary.get("passed", 0)
    failed_tests = test_summary.get("failed", 0)
    skipped_tests = test_summary.get("skipped", 0)
    test_duration = test_summary.get("duration_seconds", 0)
    coverage = test_summary.get("coverage_percent", 0)
    
    # Workflow metrics
    ops_count = counters.get("workflow.operations", {}).get("value", 0)
    error_count = counters.get("workflow.errors", {}).get("value", 0)
    
    workflow_timer = timers.get("workflow.duration", {})
    workflow_duration = workflow_timer.get("mean", 0)
    
    # System metrics
    memory_percent = gauges.get("system.memory.percent", {}).get("value", 0)
    cpu_percent = gauges.get("system.cpu.percent", {}).get("value", 0)
    
    # Trace summary
    total_traces = traces.get("summary", {}).get("total_traces", 0)
    total_spans = traces.get("summary", {}).get("total_spans", 0)
    
    # Generate markdown
    status_emoji = get_status_emoji(passed_tests, failed_tests)
    
    print(f"""# {status_emoji} CI/CD Observability Report

> Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}

## 🧪 Test Results

| Metric | Value |
|--------|-------|
| Total Tests | {total_tests} |
| ✅ Passed | {passed_tests} |
| ❌ Failed | {failed_tests} |
| ⏭️ Skipped | {skipped_tests} |
| ⏱️ Duration | {format_duration(test_duration)} |
| 📊 Coverage | {coverage:.1f}% |

## 📊 Observability Metrics

### Operations
| Metric | Value |
|--------|-------|
| Total Operations | {ops_count} |
| Errors Encountered | {error_count} |
| Workflow Duration | {format_duration(workflow_duration)} |

### System Resources
| Resource | Usage |
|----------|-------|
| Memory | {memory_percent:.1f}% |
| CPU | {cpu_percent:.1f}% |

### Distributed Tracing
| Metric | Value |
|--------|-------|
| Total Traces | {total_traces} |
| Total Spans | {total_spans} |

## 📝 Log Summary

| Level | Count |
|-------|-------|
| 🔵 DEBUG | {log_levels['DEBUG']} |
| 🟢 INFO | {log_levels['INFO']} |
| 🟡 WARN | {log_levels['WARN']} |
| 🔴 ERROR | {log_levels['ERROR']} |
| 🟣 CRITICAL | {log_levels['CRITICAL']} |

---

<details>
<summary>📁 Artifacts</summary>

Download the **observability-report** artifact for:
- 📊 `report.html` - Interactive dashboard
- 📄 `observability_data.json` - Raw metrics data
- 📋 `test_results.xml` - JUnit test results
- 📈 `coverage_html/` - Coverage report

</details>
""")


if __name__ == "__main__":
    main()
