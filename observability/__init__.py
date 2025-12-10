"""
Custom Observability Library

A lightweight observability stack for CI/CD pipelines
without any third-party dependencies.
"""

from .metrics import MetricsCollector, Counter, Gauge, Histogram, Timer
from .logger import ObservabilityLogger, LogLevel, MemoryHandler, ConsoleHandler, FileHandler, LogContext
from .tracer import Tracer, Span, SpanContext
from .exporter import ObservabilityExporter

__all__ = [
    "MetricsCollector",
    "Counter", 
    "Gauge",
    "Histogram",
    "Timer",
    "ObservabilityLogger",
    "LogLevel",
    "MemoryHandler",
    "ConsoleHandler",
    "FileHandler",
    "LogContext",
    "Tracer",
    "Span",
    "SpanContext",
    "ObservabilityExporter"
]

__version__ = "1.0.0"
