"""
Observability Data Exporter

Exports collected metrics, logs, and traces to various formats
including JSON and HTML reports.
"""

import json
import os
import time
from typing import Dict, Any, List, Optional
from datetime import datetime

from .metrics import MetricsCollector
from .logger import ObservabilityLogger, MemoryHandler
from .tracer import Tracer


class ObservabilityExporter:
    """
    Exports observability data to various formats.
    
    Collects data from metrics, logs, and traces and
    generates reports in JSON and HTML formats.
    """
    
    def __init__(self, output_dir: str = "observability_output"):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
        
        self._metrics_collector = MetricsCollector()
        self._tracer = Tracer()
        self._memory_handler: Optional[MemoryHandler] = None
    
    def set_memory_handler(self, handler: MemoryHandler) -> None:
        """Set the memory handler for log collection."""
        self._memory_handler = handler
    
    def collect_all(self) -> Dict[str, Any]:
        """Collect all observability data."""
        data = {
            "generated_at": datetime.now().isoformat(),
            "metrics": self._metrics_collector.collect_all(),
            "traces": self._tracer.collect_traces(),
            "logs": []
        }
        
        if self._memory_handler:
            data["logs"] = self._memory_handler.get_entries_as_dicts()
        
        return data
    
    def export_json(self, filename: str = "observability_data.json") -> str:
        """Export all data to JSON file."""
        filepath = os.path.join(self.output_dir, filename)
        data = self.collect_all()
        
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2, default=str)
        
        return filepath
    
    def export_metrics_json(self, filename: str = "metrics.json") -> str:
        """Export only metrics to JSON."""
        filepath = os.path.join(self.output_dir, filename)
        self._metrics_collector.export_json(filepath)
        return filepath
    
    def export_traces_json(self, filename: str = "traces.json") -> str:
        """Export only traces to JSON."""
        filepath = os.path.join(self.output_dir, filename)
        self._tracer.export_json(filepath)
        return filepath
    
    def export_logs_json(self, filename: str = "logs.json") -> str:
        """Export only logs to JSON."""
        filepath = os.path.join(self.output_dir, filename)
        logs = []
        if self._memory_handler:
            logs = self._memory_handler.get_entries_as_dicts()
        
        with open(filepath, 'w') as f:
            json.dump({"logs": logs}, f, indent=2)
        
        return filepath
    
    def export_html_report(self, filename: str = "report.html") -> str:
        """Generate an HTML report with dashboard."""
        filepath = os.path.join(self.output_dir, filename)
        data = self.collect_all()
        
        html = self._generate_html_report(data)
        
        with open(filepath, 'w') as f:
            f.write(html)
        
        return filepath
    
    def _generate_html_report(self, data: Dict[str, Any]) -> str:
        """Generate HTML report content."""
        metrics = data.get("metrics", {})
        traces = data.get("traces", {})
        logs = data.get("logs", [])
        
        # Calculate summary stats
        total_counters = len(metrics.get("counters", {}))
        total_gauges = len(metrics.get("gauges", {}))
        total_histograms = len(metrics.get("histograms", {}))
        total_timers = len(metrics.get("timers", {}))
        total_traces = traces.get("summary", {}).get("total_traces", 0)
        total_spans = traces.get("summary", {}).get("total_spans", 0)
        total_logs = len(logs)
        
        # Count log levels
        log_levels = {"DEBUG": 0, "INFO": 0, "WARN": 0, "ERROR": 0, "CRITICAL": 0}
        for log in logs:
            level = log.get("level", "INFO")
            if level in log_levels:
                log_levels[level] += 1
        
        html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CI/CD Observability Report</title>
    <style>
        :root {{
            --bg-primary: #1a1a2e;
            --bg-secondary: #16213e;
            --bg-card: #0f3460;
            --text-primary: #eee;
            --text-secondary: #aaa;
            --accent-blue: #4da6ff;
            --accent-green: #4ade80;
            --accent-yellow: #fbbf24;
            --accent-red: #f87171;
            --accent-purple: #a78bfa;
        }}
        
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.6;
        }}
        
        .container {{
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }}
        
        header {{
            text-align: center;
            padding: 40px 20px;
            background: linear-gradient(135deg, var(--bg-secondary), var(--bg-card));
            border-radius: 12px;
            margin-bottom: 30px;
        }}
        
        header h1 {{
            font-size: 2.5em;
            margin-bottom: 10px;
            background: linear-gradient(90deg, var(--accent-blue), var(--accent-purple));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }}
        
        header p {{
            color: var(--text-secondary);
        }}
        
        .summary-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }}
        
        .summary-card {{
            background: var(--bg-card);
            padding: 25px;
            border-radius: 12px;
            text-align: center;
            transition: transform 0.2s;
        }}
        
        .summary-card:hover {{
            transform: translateY(-5px);
        }}
        
        .summary-card .value {{
            font-size: 2.5em;
            font-weight: bold;
            color: var(--accent-blue);
        }}
        
        .summary-card .label {{
            color: var(--text-secondary);
            font-size: 0.9em;
            margin-top: 5px;
        }}
        
        .summary-card.green .value {{ color: var(--accent-green); }}
        .summary-card.yellow .value {{ color: var(--accent-yellow); }}
        .summary-card.red .value {{ color: var(--accent-red); }}
        .summary-card.purple .value {{ color: var(--accent-purple); }}
        
        .section {{
            background: var(--bg-secondary);
            border-radius: 12px;
            padding: 25px;
            margin-bottom: 25px;
        }}
        
        .section h2 {{
            color: var(--accent-blue);
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid var(--bg-card);
        }}
        
        .tabs {{
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }}
        
        .tab {{
            padding: 10px 20px;
            background: var(--bg-card);
            border: none;
            border-radius: 8px;
            color: var(--text-primary);
            cursor: pointer;
            transition: background 0.2s;
        }}
        
        .tab:hover, .tab.active {{
            background: var(--accent-blue);
        }}
        
        .tab-content {{
            display: none;
        }}
        
        .tab-content.active {{
            display: block;
        }}
        
        table {{
            width: 100%;
            border-collapse: collapse;
        }}
        
        th, td {{
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid var(--bg-card);
        }}
        
        th {{
            background: var(--bg-card);
            color: var(--accent-blue);
        }}
        
        tr:hover {{
            background: rgba(77, 166, 255, 0.1);
        }}
        
        .log-entry {{
            padding: 10px 15px;
            margin: 5px 0;
            border-radius: 6px;
            font-family: 'Fira Code', 'Courier New', monospace;
            font-size: 0.9em;
            background: var(--bg-card);
        }}
        
        .log-DEBUG {{ border-left: 4px solid #6b7280; }}
        .log-INFO {{ border-left: 4px solid var(--accent-blue); }}
        .log-WARN {{ border-left: 4px solid var(--accent-yellow); }}
        .log-ERROR {{ border-left: 4px solid var(--accent-red); }}
        .log-CRITICAL {{ border-left: 4px solid var(--accent-purple); }}
        
        .log-level {{
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-weight: bold;
            font-size: 0.8em;
            margin-right: 10px;
        }}
        
        .level-DEBUG {{ background: #374151; color: #9ca3af; }}
        .level-INFO {{ background: #1e40af; color: #93c5fd; }}
        .level-WARN {{ background: #92400e; color: #fcd34d; }}
        .level-ERROR {{ background: #991b1b; color: #fca5a5; }}
        .level-CRITICAL {{ background: #581c87; color: #d8b4fe; }}
        
        .trace-span {{
            margin: 10px 0;
            padding: 15px;
            background: var(--bg-card);
            border-radius: 8px;
            border-left: 4px solid var(--accent-green);
        }}
        
        .trace-span.error {{
            border-left-color: var(--accent-red);
        }}
        
        .span-name {{
            font-weight: bold;
            color: var(--accent-blue);
        }}
        
        .span-duration {{
            float: right;
            color: var(--accent-green);
        }}
        
        .span-attrs {{
            margin-top: 10px;
            padding: 10px;
            background: rgba(0,0,0,0.2);
            border-radius: 4px;
            font-family: monospace;
            font-size: 0.85em;
        }}
        
        .metric-card {{
            background: var(--bg-card);
            padding: 20px;
            border-radius: 8px;
            margin: 10px 0;
        }}
        
        .metric-name {{
            font-weight: bold;
            color: var(--accent-blue);
            margin-bottom: 10px;
        }}
        
        .metric-value {{
            font-size: 1.8em;
            font-weight: bold;
        }}
        
        .metric-stats {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
            gap: 10px;
            margin-top: 10px;
        }}
        
        .stat {{
            text-align: center;
            padding: 10px;
            background: rgba(0,0,0,0.2);
            border-radius: 4px;
        }}
        
        .stat-value {{
            font-weight: bold;
            color: var(--accent-green);
        }}
        
        .stat-label {{
            font-size: 0.8em;
            color: var(--text-secondary);
        }}
        
        .no-data {{
            text-align: center;
            padding: 40px;
            color: var(--text-secondary);
        }}
        
        footer {{
            text-align: center;
            padding: 20px;
            color: var(--text-secondary);
            font-size: 0.9em;
        }}
        
        @media (max-width: 768px) {{
            .summary-grid {{
                grid-template-columns: repeat(2, 1fr);
            }}
            
            header h1 {{
                font-size: 1.8em;
            }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🔍 CI/CD Observability Report</h1>
            <p>Generated: {data.get("generated_at", "N/A")}</p>
        </header>
        
        <div class="summary-grid">
            <div class="summary-card">
                <div class="value">{total_counters + total_gauges + total_histograms + total_timers}</div>
                <div class="label">Total Metrics</div>
            </div>
            <div class="summary-card purple">
                <div class="value">{total_traces}</div>
                <div class="label">Traces</div>
            </div>
            <div class="summary-card green">
                <div class="value">{total_spans}</div>
                <div class="label">Spans</div>
            </div>
            <div class="summary-card">
                <div class="value">{total_logs}</div>
                <div class="label">Log Entries</div>
            </div>
            <div class="summary-card yellow">
                <div class="value">{log_levels["WARN"]}</div>
                <div class="label">Warnings</div>
            </div>
            <div class="summary-card red">
                <div class="value">{log_levels["ERROR"] + log_levels["CRITICAL"]}</div>
                <div class="label">Errors</div>
            </div>
        </div>
        
        <div class="section">
            <h2>📊 Metrics</h2>
            <div class="tabs">
                <button class="tab active" onclick="showMetricTab('counters')">Counters ({total_counters})</button>
                <button class="tab" onclick="showMetricTab('gauges')">Gauges ({total_gauges})</button>
                <button class="tab" onclick="showMetricTab('histograms')">Histograms ({total_histograms})</button>
                <button class="tab" onclick="showMetricTab('timers')">Timers ({total_timers})</button>
            </div>
            
            <div id="counters" class="tab-content active">
                {self._render_counters(metrics.get("counters", {}))}
            </div>
            <div id="gauges" class="tab-content">
                {self._render_gauges(metrics.get("gauges", {}))}
            </div>
            <div id="histograms" class="tab-content">
                {self._render_histograms(metrics.get("histograms", {}))}
            </div>
            <div id="timers" class="tab-content">
                {self._render_histograms(metrics.get("timers", {}))}
            </div>
        </div>
        
        <div class="section">
            <h2>🔗 Traces</h2>
            {self._render_traces(traces)}
        </div>
        
        <div class="section">
            <h2>📝 Logs</h2>
            <div class="tabs">
                <button class="tab active" onclick="filterLogs('all')">All ({total_logs})</button>
                <button class="tab" onclick="filterLogs('DEBUG')">Debug ({log_levels["DEBUG"]})</button>
                <button class="tab" onclick="filterLogs('INFO')">Info ({log_levels["INFO"]})</button>
                <button class="tab" onclick="filterLogs('WARN')">Warn ({log_levels["WARN"]})</button>
                <button class="tab" onclick="filterLogs('ERROR')">Error ({log_levels["ERROR"]})</button>
            </div>
            <div id="logs-container">
                {self._render_logs(logs)}
            </div>
        </div>
        
        <footer>
            <p>CI/CD Observability Demo - Custom Implementation (No 3rd Party Libraries)</p>
        </footer>
    </div>
    
    <script>
        function showMetricTab(tabId) {{
            document.querySelectorAll('.section:nth-child(3) .tab-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.section:nth-child(3) .tab').forEach(el => el.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
            event.target.classList.add('active');
        }}
        
        function filterLogs(level) {{
            document.querySelectorAll('.section:nth-child(5) .tab').forEach(el => el.classList.remove('active'));
            event.target.classList.add('active');
            
            document.querySelectorAll('.log-entry').forEach(el => {{
                if (level === 'all' || el.classList.contains('log-' + level)) {{
                    el.style.display = 'block';
                }} else {{
                    el.style.display = 'none';
                }}
            }});
        }}
    </script>
</body>
</html>'''
        
        return html
    
    def _render_counters(self, counters: Dict[str, Any]) -> str:
        """Render counters section."""
        if not counters:
            return '<div class="no-data">No counters recorded</div>'
        
        html = ''
        for name, data in counters.items():
            html += f'''
            <div class="metric-card">
                <div class="metric-name">{name}</div>
                <div class="metric-value">{data.get("value", 0)}</div>
                <div style="color: var(--text-secondary); font-size: 0.9em;">{data.get("description", "")}</div>
            </div>
            '''
        return html
    
    def _render_gauges(self, gauges: Dict[str, Any]) -> str:
        """Render gauges section."""
        if not gauges:
            return '<div class="no-data">No gauges recorded</div>'
        
        html = ''
        for name, data in gauges.items():
            html += f'''
            <div class="metric-card">
                <div class="metric-name">{name}</div>
                <div class="metric-value">{data.get("value", 0):.2f}</div>
                <div style="color: var(--text-secondary); font-size: 0.9em;">{data.get("description", "")}</div>
            </div>
            '''
        return html
    
    def _render_histograms(self, histograms: Dict[str, Any]) -> str:
        """Render histograms/timers section."""
        if not histograms:
            return '<div class="no-data">No histograms/timers recorded</div>'
        
        html = ''
        for name, data in histograms.items():
            mean = data.get("mean")
            mean_str = f"{mean:.4f}" if mean is not None else "N/A"
            p50 = data.get("p50")
            p50_str = f"{p50:.4f}" if p50 is not None else "N/A"
            p90 = data.get("p90")
            p90_str = f"{p90:.4f}" if p90 is not None else "N/A"
            p99 = data.get("p99")
            p99_str = f"{p99:.4f}" if p99 is not None else "N/A"
            min_val = data.get("min")
            min_str = f"{min_val:.4f}" if min_val is not None else "N/A"
            max_val = data.get("max")
            max_str = f"{max_val:.4f}" if max_val is not None else "N/A"
            
            html += f'''
            <div class="metric-card">
                <div class="metric-name">{name}</div>
                <div class="metric-stats">
                    <div class="stat">
                        <div class="stat-value">{data.get("count", 0)}</div>
                        <div class="stat-label">Count</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">{mean_str}</div>
                        <div class="stat-label">Mean</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">{min_str}</div>
                        <div class="stat-label">Min</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">{max_str}</div>
                        <div class="stat-label">Max</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">{p50_str}</div>
                        <div class="stat-label">P50</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">{p90_str}</div>
                        <div class="stat-label">P90</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">{p99_str}</div>
                        <div class="stat-label">P99</div>
                    </div>
                </div>
            </div>
            '''
        return html
    
    def _render_traces(self, traces: Dict[str, Any]) -> str:
        """Render traces section."""
        trace_data = traces.get("traces", {})
        if not trace_data:
            return '<div class="no-data">No traces recorded</div>'
        
        html = ''
        for trace_id, spans in trace_data.items():
            html += f'<h3 style="color: var(--accent-purple); margin: 20px 0 10px;">Trace: {trace_id[:16]}...</h3>'
            
            for span in spans:
                status = span.get("status", "ok")
                error_class = "error" if status == "error" else ""
                duration = span.get("duration_ms")
                duration_str = f"{duration:.2f}ms" if duration else "In Progress"
                
                attrs_html = ""
                if span.get("attributes"):
                    attrs = json.dumps(span["attributes"], indent=2)
                    attrs_html = f'<div class="span-attrs"><pre>{attrs}</pre></div>'
                
                html += f'''
                <div class="trace-span {error_class}">
                    <span class="span-name">{span.get("name", "unknown")}</span>
                    <span class="span-duration">{duration_str}</span>
                    <div style="color: var(--text-secondary); font-size: 0.85em; margin-top: 5px;">
                        Span ID: {span.get("context", {}).get("span_id", "N/A")[:16]}
                        {f' | Parent: {span.get("context", {}).get("parent_span_id", "")[:16]}' if span.get("context", {}).get("parent_span_id") else ''}
                    </div>
                    {attrs_html}
                </div>
                '''
        
        return html
    
    def _render_logs(self, logs: List[Dict[str, Any]]) -> str:
        """Render logs section."""
        if not logs:
            return '<div class="no-data">No logs recorded</div>'
        
        html = ''
        for log in logs:
            level = log.get("level", "INFO")
            timestamp = log.get("datetime", "")[:19]
            message = log.get("message", "")
            logger = log.get("logger", "root")
            
            extra_html = ""
            if log.get("extra"):
                extra_html = f' | <span style="color: var(--text-secondary);">{json.dumps(log["extra"])}</span>'
            
            html += f'''
            <div class="log-entry log-{level}">
                <span class="log-level level-{level}">{level}</span>
                <span style="color: var(--text-secondary);">[{timestamp}]</span>
                <span style="color: var(--accent-blue);">[{logger}]</span>
                {message}{extra_html}
            </div>
            '''
        
        return html


def create_exporter(output_dir: str = "observability_output") -> ObservabilityExporter:
    """Create a new exporter instance."""
    return ObservabilityExporter(output_dir)
