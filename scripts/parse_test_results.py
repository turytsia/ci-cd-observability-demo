"""
Parse Test Results

Parses pytest output and test results XML to generate
observability metrics for the test run.
"""

import json
import os
import sys
import xml.etree.ElementTree as ET
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def parse_junit_xml(filepath: str) -> dict:
    """Parse JUnit XML test results."""
    if not os.path.exists(filepath):
        return {"error": "File not found", "filepath": filepath}
    
    try:
        tree = ET.parse(filepath)
        root = tree.getroot()
        
        # Get testsuite attributes
        testsuite = root.find('.//testsuite') or root
        
        results = {
            "name": testsuite.get("name", "unknown"),
            "tests": int(testsuite.get("tests", 0)),
            "errors": int(testsuite.get("errors", 0)),
            "failures": int(testsuite.get("failures", 0)),
            "skipped": int(testsuite.get("skipped", 0)),
            "time": float(testsuite.get("time", 0)),
            "timestamp": testsuite.get("timestamp", datetime.now().isoformat()),
            "testcases": []
        }
        
        results["passed"] = results["tests"] - results["errors"] - results["failures"] - results["skipped"]
        
        # Parse individual test cases
        for testcase in testsuite.findall(".//testcase"):
            tc = {
                "classname": testcase.get("classname", ""),
                "name": testcase.get("name", ""),
                "time": float(testcase.get("time", 0)),
                "status": "passed"
            }
            
            # Check for failures
            failure = testcase.find("failure")
            if failure is not None:
                tc["status"] = "failed"
                tc["message"] = failure.get("message", "")
                tc["details"] = failure.text or ""
            
            # Check for errors
            error = testcase.find("error")
            if error is not None:
                tc["status"] = "error"
                tc["message"] = error.get("message", "")
                tc["details"] = error.text or ""
            
            # Check for skipped
            skipped = testcase.find("skipped")
            if skipped is not None:
                tc["status"] = "skipped"
                tc["message"] = skipped.get("message", "")
            
            results["testcases"].append(tc)
        
        return results
    
    except Exception as e:
        return {"error": str(e), "filepath": filepath}


def parse_coverage_json(filepath: str) -> dict:
    """Parse coverage JSON report."""
    if not os.path.exists(filepath):
        return {"error": "File not found", "filepath": filepath}
    
    try:
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        totals = data.get("totals", {})
        
        return {
            "covered_lines": totals.get("covered_lines", 0),
            "num_statements": totals.get("num_statements", 0),
            "percent_covered": totals.get("percent_covered", 0),
            "missing_lines": totals.get("missing_lines", 0),
            "excluded_lines": totals.get("excluded_lines", 0),
            "files": len(data.get("files", {}))
        }
    
    except Exception as e:
        return {"error": str(e), "filepath": filepath}


def main():
    output_dir = os.environ.get("OBSERVABILITY_OUTPUT", "observability_output")
    
    # Parse test results
    test_results_path = os.path.join(output_dir, "test_results.xml")
    test_results = parse_junit_xml(test_results_path)
    
    # Parse coverage
    coverage_path = os.path.join(output_dir, "coverage.json")
    coverage_results = parse_coverage_json(coverage_path)
    
    # Combine results
    combined = {
        "generated_at": datetime.now().isoformat(),
        "test_results": test_results,
        "coverage": coverage_results,
        "summary": {
            "total_tests": test_results.get("tests", 0),
            "passed": test_results.get("passed", 0),
            "failed": test_results.get("failures", 0) + test_results.get("errors", 0),
            "skipped": test_results.get("skipped", 0),
            "duration_seconds": test_results.get("time", 0),
            "coverage_percent": coverage_results.get("percent_covered", 0)
        }
    }
    
    # Save combined results
    output_path = os.path.join(output_dir, "test_observability.json")
    with open(output_path, 'w') as f:
        json.dump(combined, f, indent=2)
    
    print(f"Test observability data saved to: {output_path}")
    print(f"\nSummary:")
    print(f"  Total tests: {combined['summary']['total_tests']}")
    print(f"  Passed: {combined['summary']['passed']}")
    print(f"  Failed: {combined['summary']['failed']}")
    print(f"  Skipped: {combined['summary']['skipped']}")
    print(f"  Duration: {combined['summary']['duration_seconds']:.2f}s")
    print(f"  Coverage: {combined['summary']['coverage_percent']:.1f}%")
    
    return combined


if __name__ == "__main__":
    main()
