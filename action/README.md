# CI/CD Observability Action

A GitHub Action for collecting CI/CD metrics and traces following [OpenTelemetry CI/CD Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/attributes/cicd/).

## Features

- 📊 **Metrics Collection**: Pipeline duration, task counts, queue time, and more
- 🔍 **Traces Collection**: Hierarchical spans for Pipeline → Jobs → Steps
- 📝 **GitHub Job Summary**: Beautiful markdown output on the workflow page
- 📤 **Webhook Support**: Send data to your observability backend
- 🏷️ **OTel Semantic Conventions**: Industry-standard attribute names

## Usage

### Basic Usage

```yaml
- name: 🔭 Collect CI/CD Observability
  uses: ./action
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
```

### With Webhook

```yaml
- name: 🔭 Collect CI/CD Observability
  uses: ./action
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    webhook-url: 'https://your-server.com/api/observability'
    webhook-secret: ${{ secrets.WEBHOOK_SECRET }}
```

### Full Example

```yaml
observability:
  name: 🔭 Observability
  runs-on: ubuntu-latest
  needs: [lint, test, build, deploy]
  if: always()  # Run even if previous jobs fail
  
  steps:
    - name: 📥 Checkout code
      uses: actions/checkout@v4

    - name: 🔭 Collect CI/CD Observability
      id: observability
      uses: ./action
      with:
        token: ${{ secrets.GITHUB_TOKEN }}
        collect-metrics: 'true'
        collect-traces: 'true'
        webhook-url: ${{ secrets.OBSERVABILITY_WEBHOOK_URL }}
        webhook-secret: ${{ secrets.WEBHOOK_SECRET }}

    - name: 📊 Use Outputs
      run: |
        echo "Summary: ${{ steps.observability.outputs.summary }}"
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `token` | GitHub token for API access | Yes | `${{ github.token }}` |
| `webhook-url` | Webhook URL to send observability data | No | - |
| `webhook-secret` | Secret for signing webhook payloads (HMAC-SHA256) | No | - |
| `collect-metrics` | Enable metrics collection | No | `true` |
| `collect-traces` | Enable traces collection | No | `true` |

## Outputs

| Output | Description |
|--------|-------------|
| `metrics-json` | Collected metrics in JSON format |
| `traces-json` | Collected traces in JSON format |
| `summary` | Brief text summary of observability data |

## OpenTelemetry Semantic Conventions

This action follows the [OTel CI/CD Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/attributes/cicd/) for attribute naming.

### Pipeline Attributes

| Attribute | Description |
|-----------|-------------|
| `cicd.pipeline.name` | Pipeline/workflow name |
| `cicd.pipeline.run.id` | Unique run identifier |
| `cicd.pipeline.run.number` | Run number |
| `cicd.pipeline.run.url.full` | Full URL to the run |
| `cicd.pipeline.run.state` | Current state: `pending`, `executing`, `finalizing` |
| `cicd.pipeline.run.attempt` | Run attempt number |
| `cicd.pipeline.trigger.event` | Trigger event (push, pull_request, etc.) |
| `cicd.pipeline.trigger.ref` | Branch or tag ref |
| `cicd.pipeline.trigger.sha` | Commit SHA |

### Task (Job) Attributes

| Attribute | Description |
|-----------|-------------|
| `cicd.pipeline.task.name` | Job name |
| `cicd.pipeline.task.run.id` | Job run ID |
| `cicd.pipeline.task.type` | Type: `build`, `test`, `deploy`, `lint`, `notify`, `other` |
| `cicd.pipeline.task.run.url.full` | URL to the job |

### Worker (Runner) Attributes

| Attribute | Description |
|-----------|-------------|
| `cicd.worker.name` | Runner name |
| `cicd.worker.os` | Operating system |
| `cicd.worker.arch` | Architecture |

## Webhook Payload

When `webhook-url` is configured, the action sends a POST request with the following structure:

```json
{
  "schema_version": "1.0.0",
  "metrics": {
    "pipeline": { ... },
    "worker": { ... },
    "cicd.pipeline.run.duration_ms": 120000,
    "cicd.pipeline.task.count": 4,
    "cicd.pipeline.task.success_count": 3,
    "cicd.pipeline.task.failure_count": 1,
    "tasks": [ ... ]
  },
  "traces": {
    "trace_id": "abc123...",
    "spans": [ ... ]
  },
  "metadata": {
    "collected_at": "2024-01-15T10:30:00Z",
    "collector_version": "1.0.0"
  }
}
```

### Webhook Headers

| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` |
| `X-Signature-256` | HMAC-SHA256 signature (if secret provided) |
| `X-Pipeline-Run-Id` | Pipeline run ID |
| `X-Trace-Id` | Trace ID |

## GitHub Job Summary

The action automatically writes a comprehensive summary to the GitHub Actions job summary, including:

- Pipeline overview with all OTel attributes
- Timing metrics (duration, queue time)
- Task summary (success/failure counts)
- Task details table
- Trace tree visualization
- Span timeline

## Development

```bash
# Install dependencies
cd action
npm install

# Type check
npm run typecheck

# Build
npm run build
```

## License

MIT
