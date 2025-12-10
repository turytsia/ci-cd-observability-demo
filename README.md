# CI/CD Observability Demo

A demonstration project showcasing **custom observability** (metrics, logs, traces) in GitHub Actions CI/CD pipelines **without any third-party observability libraries** like Datadog, New Relic, or OpenTelemetry SDKs.

## 🎯 Project Goals

1. **Custom Observability Stack** - Build metrics, logging, and tracing from scratch
2. **CI/CD Integration** - Instrument GitHub Actions workflows with observability
3. **Self-Hosted Visualization** - View results via GitHub Actions artifacts (no external services)
4. **Educational Demo** - Learn how observability systems work internally

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub Actions Workflow                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐     │
│  │   Lint   │ → │   Test   │ → │  Build   │ → │  Deploy  │     │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘     │
│       │              │              │              │            │
│       ▼              ▼              ▼              ▼            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │            Custom Observability Library                  │   │
│  ├─────────────┬─────────────┬─────────────────────────────┤   │
│  │   Metrics   │   Logging   │        Tracing              │   │
│  │  (counters, │  (structured│  (spans, traces,            │   │
│  │   gauges,   │   JSON,     │   context propagation)      │   │
│  │  histograms)│   levels)   │                             │   │
│  └─────────────┴─────────────┴─────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Exporter (JSON + HTML Report)               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           GitHub Actions Artifacts                       │   │
│  │  • observability_data.json                              │   │
│  │  • report.html (interactive dashboard)                  │   │
│  │  • test_results.xml                                     │   │
│  │  • coverage report                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
.
├── src/
│   └── app.py                      # Sample application to observe
├── observability/
│   ├── __init__.py                 # Package exports
│   ├── metrics.py                  # Custom metrics (Counter, Gauge, Histogram, Timer)
│   ├── logger.py                   # Structured logging with correlation IDs
│   ├── tracer.py                   # Distributed tracing (Spans, Traces)
│   └── exporter.py                 # Export to JSON/HTML reports
├── tests/
│   ├── test_app.py                 # Application tests
│   └── test_observability.py       # Observability library tests
├── scripts/
│   ├── run_with_observability.py   # Run app with full instrumentation
│   ├── generate_report.py          # Generate HTML dashboard
│   ├── parse_test_results.py       # Parse pytest output
│   └── create_github_summary.py    # Create GitHub Actions summary
├── .github/
│   └── workflows/
│       └── ci-observability.yml    # CI/CD pipeline with observability
├── requirements.txt                # Python dependencies
└── README.md                       # This file
```

## 🚀 Quick Start

### Local Development

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/ci-cd-observability-demo.git
cd ci-cd-observability-demo

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run tests
pytest tests/ -v

# Run application with observability
python scripts/run_with_observability.py

# Generate HTML report
python scripts/generate_report.py
```

### View Results

After running, open `observability_output/report.html` in your browser to see:
- 📊 Metrics dashboard (counters, gauges, histograms, timers)
- 🔗 Trace waterfall diagram
- 📝 Structured log viewer

## 🔧 Observability Components

### 📊 Metrics

```python
from observability import MetricsCollector

metrics = MetricsCollector()

# Counter - for counting events
counter = metrics.counter("requests_total", "Total HTTP requests")
counter.inc()

# Gauge - for values that go up and down
gauge = metrics.gauge("memory_usage_mb", "Current memory usage")
gauge.set(256.5)

# Histogram - for distributions
histogram = metrics.histogram("request_latency_seconds")
histogram.observe(0.25)

# Timer - for measuring durations
timer = metrics.timer("operation_duration")
with timer.time():
    do_something()
```

### 📝 Structured Logging

```python
from observability import ObservabilityLogger, LogLevel, MemoryHandler

# Setup
handler = MemoryHandler(level=LogLevel.DEBUG)
ObservabilityLogger.add_global_handler(handler)

# Get logger
logger = ObservabilityLogger.get_logger("my-service")

# Log with extra fields
logger.info("User logged in", user_id=123, ip_address="192.168.1.1")
logger.error("Database connection failed", error="timeout", retry_count=3)
```

### 🔗 Distributed Tracing

```python
from observability import Tracer

tracer = Tracer()
tracer.configure(service_name="my-service")

# Create spans
with tracer.span("http_request") as span:
    span.set_attribute("http.method", "GET")
    span.set_attribute("http.url", "/api/users")
    
    # Child span
    with tracer.span("database_query") as child:
        child.set_attribute("db.statement", "SELECT * FROM users")
        result = query_database()
    
    span.add_event("response_sent")
```

## 📈 GitHub Actions Integration

The CI/CD workflow (`.github/workflows/ci-observability.yml`) includes:

1. **Lint Job** - Code quality checks
2. **Test Job** - Run tests with observability
3. **Build Job** - Create distributable
4. **Deploy Job** - Simulated deployment (on main branch)
5. **Notify Job** - Generate webhook payload

### Viewing Results

After each workflow run:

1. Go to **Actions** tab in your repository
2. Click on the latest workflow run
3. Scroll down to **Artifacts**
4. Download **observability-report**
5. Extract and open `report.html`

### Job Summary

Each run generates a summary visible directly in GitHub Actions with:
- Test results (passed/failed/skipped)
- Coverage percentage
- Observability metrics
- Log level distribution

## 🔌 Webhook Integration (Optional)

The workflow generates a webhook payload that can be sent to any endpoint:

```json
{
  "event": "ci_cd_complete",
  "repository": "owner/repo",
  "sha": "abc1234",
  "jobs": {
    "lint": "success",
    "test": "success",
    "build": "success"
  },
  "observability": {
    "operations": 150,
    "errors": 2
  }
}
```

To enable webhook notifications, add a step:

```yaml
- name: Send webhook
  run: |
    curl -X POST \
      -H "Content-Type: application/json" \
      -d @webhook_payload.json \
      ${{ secrets.WEBHOOK_URL }}
```

## 🎨 Dashboard Preview

The generated HTML report includes:

- **Summary Cards** - Quick overview of metrics, traces, logs
- **Metrics Section** - Interactive tabs for counters, gauges, histograms, timers
- **Traces Section** - Hierarchical span visualization
- **Logs Section** - Filterable log entries by level

## 📚 Learn More

### How Metrics Work

Metrics are collected using thread-safe data structures:
- **Counters** only increase (monotonic)
- **Gauges** can increase or decrease
- **Histograms** track value distributions with configurable buckets
- **Timers** are histograms specialized for duration measurement

### How Tracing Works

The tracer implements:
- **Trace ID** - Unique identifier for a request flow
- **Span ID** - Unique identifier for each operation
- **Parent Span ID** - Links child spans to parents
- **Context Propagation** - Pass trace context via headers

### How Logging Works

Structured logging provides:
- **JSON Format** - Machine-parseable logs
- **Correlation IDs** - Link logs to traces
- **Log Levels** - Filter by severity
- **Thread-Local Context** - Automatic context propagation

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - see LICENSE file for details.

---

**Note**: This project intentionally avoids third-party observability libraries to demonstrate how these systems work internally. For production use, consider using established solutions like OpenTelemetry, Prometheus, or cloud-native observability platforms.
