# CI/CD Observability GitHub Action

A GitHub Action for collecting and reporting CI/CD observability metrics, test results, and code coverage without requiring third-party services.

## Features

- 📊 **Job Metrics** - Collect workflow duration, queue time, runner info
- 🧪 **Test Results** - Parse JUnit XML test results from any test framework
- 📈 **Code Coverage** - Parse Cobertura XML, LCOV, or JSON coverage reports
- 📋 **Job Summary** - Beautiful GitHub Actions job summary with all data
- ✅ **Check Runs** - Create GitHub Check Runs with annotations for failures
- 📦 **Artifacts** - Upload reports as downloadable artifacts
- 🔔 **Webhooks** - Send data to external systems via webhook

## Usage

### Basic Usage

```yaml
- name: CI/CD Observability
  uses: ./.github/actions/observability
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
```

### Full Example

```yaml
name: CI with Observability

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: pip install -r requirements.txt
      
      - name: Run tests
        run: pytest --junitxml=test-results.xml --cov=. --cov-report=xml
      
      - name: CI/CD Observability
        uses: ./.github/actions/observability
        if: always()  # Run even if tests fail
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          test-results-path: '**/test-results.xml'
          coverage-path: '**/coverage.xml'
          create-check: true
          upload-artifact: true
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `token` | GitHub token for API access | No | `${{ github.token }}` |
| `collect-job-metrics` | Collect job timing and status metrics | No | `true` |
| `collect-test-results` | Parse and collect test results | No | `true` |
| `test-results-path` | Path to JUnit XML test results | No | `**/test-results.xml` |
| `collect-coverage` | Parse and collect code coverage | No | `true` |
| `coverage-path` | Path to coverage file | No | `**/coverage.xml` |
| `custom-metrics` | JSON string of custom metrics | No | `{}` |
| `output-format` | Report format (html, json, all) | No | `all` |
| `create-check` | Create GitHub Check Run | No | `false` |
| `upload-artifact` | Upload reports as artifact | No | `true` |
| `artifact-name` | Name of the artifact | No | `observability-report` |
| `webhook-url` | URL for webhook notifications | No | |
| `webhook-secret` | Secret for webhook signature | No | |

## Outputs

| Output | Description |
|--------|-------------|
| `report-path` | Path to generated report files |
| `metrics-json` | JSON string with all collected metrics |
| `total-tests` | Total number of tests |
| `passed-tests` | Number of passed tests |
| `failed-tests` | Number of failed tests |
| `coverage-percent` | Code coverage percentage |
| `job-duration` | Action duration in seconds |

## Supported Test Result Formats

- JUnit XML (pytest, Jest, JUnit, NUnit, etc.)

## Supported Coverage Formats

- Cobertura XML (coverage.py, istanbul/nyc, etc.)
- LCOV
- Istanbul/NYC JSON

## Custom Metrics

You can pass custom metrics as a JSON string:

```yaml
- name: CI/CD Observability
  uses: ./.github/actions/observability
  with:
    custom-metrics: |
      {
        "build_size_mb": 42.5,
        "dependency_count": 127,
        "security_vulnerabilities": 0
      }
```

## Webhook Payload

When configured with a webhook URL, the action sends a POST request with:

```json
{
  "event": "observability_report",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "metadata": {
      "repository": "owner/repo",
      "workflow": "CI",
      "runId": 12345,
      ...
    },
    "metrics": { ... },
    "testResults": { ... },
    "coverage": { ... }
  }
}
```

If `webhook-secret` is provided, the payload is signed with HMAC-SHA256 and included in the `X-Signature-256` header.

## Building from Source

```bash
cd action
npm install
npm run build
```

The compiled action will be in `dist/index.js`.

## License

MIT
