"""
Generate Observability Report

Standalone script to generate HTML report from JSON data.
Can be used to regenerate reports or customize output.
"""

import json
import sys
import os
import argparse
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from observability.exporter import ObservabilityExporter


def load_json_data(filepath: str) -> dict:
    """Load observability data from JSON file."""
    with open(filepath, 'r') as f:
        return json.load(f)


def generate_summary_markdown(data: dict) -> str:
    """Generate a markdown summary of the observability data."""
    metrics = data.get("metrics", {})
    traces = data.get("traces", {})
    logs = data.get("logs", [])
    
    # Calculate stats
    total_metrics = (
        len(metrics.get("counters", {})) +
        len(metrics.get("gauges", {})) +
        len(metrics.get("histograms", {})) +
        len(metrics.get("timers", {}))
    )
    
    total_traces = traces.get("summary", {}).get("total_traces", 0)
    total_spans = traces.get("summary", {}).get("total_spans", 0)
    
    log_levels = {"DEBUG": 0, "INFO": 0, "WARN": 0, "ERROR": 0, "CRITICAL": 0}
    for log in logs:
        level = log.get("level", "INFO")
        if level in log_levels:
            log_levels[level] += 1
    
    # Get key metrics
    counters = metrics.get("counters", {})
    ops_count = counters.get("workflow.operations", {}).get("value", 0)
    error_count = counters.get("workflow.errors", {}).get("value", 0)
    
    timers = metrics.get("timers", {})
    workflow_duration = timers.get("workflow.duration", {}).get("mean", 0)
    
    markdown = f"""# CI/CD Observability Summary

**Generated:** {data.get("generated_at", datetime.now().isoformat())}

## 📊 Overview

| Metric | Value |
|--------|-------|
| Total Metrics | {total_metrics} |
| Total Traces | {total_traces} |
| Total Spans | {total_spans} |
| Total Logs | {len(logs)} |

## 🎯 Key Metrics

| Operation | Count |
|-----------|-------|
| Total Operations | {ops_count} |
| Total Errors | {error_count} |
| Workflow Duration | {workflow_duration:.2f}s |

## 📝 Log Summary

| Level | Count |
|-------|-------|
| DEBUG | {log_levels["DEBUG"]} |
| INFO | {log_levels["INFO"]} |
| WARN | {log_levels["WARN"]} |
| ERROR | {log_levels["ERROR"]} |
| CRITICAL | {log_levels["CRITICAL"]} |

## ✅ Status

"""
    
    if error_count == 0:
        markdown += "🟢 **All operations completed successfully**\n"
    elif error_count < 5:
        markdown += f"🟡 **Completed with {error_count} minor errors**\n"
    else:
        markdown += f"🔴 **{error_count} errors detected - review logs**\n"
    
    return markdown


def main():
    parser = argparse.ArgumentParser(description="Generate observability reports")
    parser.add_argument(
        "--input", "-i",
        default="observability_output/observability_data.json",
        help="Input JSON data file"
    )
    parser.add_argument(
        "--output", "-o",
        default="observability_output",
        help="Output directory for reports"
    )
    parser.add_argument(
        "--format", "-f",
        choices=["html", "markdown", "both"],
        default="both",
        help="Output format"
    )
    
    args = parser.parse_args()
    
    # Check if input file exists
    if not os.path.exists(args.input):
        print(f"Error: Input file not found: {args.input}")
        print("Run 'python scripts/run_with_observability.py' first to generate data.")
        sys.exit(1)
    
    # Load data
    print(f"Loading data from: {args.input}")
    data = load_json_data(args.input)
    
    # Ensure output directory exists
    os.makedirs(args.output, exist_ok=True)
    
    # Generate reports
    if args.format in ["html", "both"]:
        exporter = ObservabilityExporter(args.output)
        html_content = exporter._generate_html_report(data)
        html_path = os.path.join(args.output, "report.html")
        with open(html_path, 'w') as f:
            f.write(html_content)
        print(f"Generated HTML report: {html_path}")
    
    if args.format in ["markdown", "both"]:
        md_content = generate_summary_markdown(data)
        md_path = os.path.join(args.output, "SUMMARY.md")
        with open(md_path, 'w') as f:
            f.write(md_content)
        print(f"Generated Markdown summary: {md_path}")
    
    print("\nReport generation complete!")


if __name__ == "__main__":
    main()
