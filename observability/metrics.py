"""
Custom Metrics Collection

Implements counters, gauges, histograms, and timers for
collecting metrics during CI/CD pipeline execution.
"""

import time
import threading
import statistics
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, field
from contextlib import contextmanager
import json


@dataclass
class MetricValue:
    """Represents a single metric value with metadata."""
    name: str
    value: float
    timestamp: float
    labels: Dict[str, str] = field(default_factory=dict)
    metric_type: str = "gauge"


class Counter:
    """
    A counter metric that only increases.
    
    Use for counting events like:
    - Number of tests run
    - Number of errors
    - Number of deployments
    """
    
    def __init__(self, name: str, description: str = "", labels: Dict[str, str] = None):
        self.name = name
        self.description = description
        self.labels = labels or {}
        self._value = 0
        self._lock = threading.Lock()
        self._history: List[MetricValue] = []
    
    def inc(self, amount: int = 1) -> None:
        """Increment the counter by the given amount."""
        with self._lock:
            self._value += amount
            self._history.append(MetricValue(
                name=self.name,
                value=self._value,
                timestamp=time.time(),
                labels=self.labels,
                metric_type="counter"
            ))
    
    def get(self) -> int:
        """Get the current counter value."""
        return self._value
    
    def reset(self) -> None:
        """Reset the counter to zero."""
        with self._lock:
            self._value = 0
    
    def to_dict(self) -> Dict[str, Any]:
        """Export counter data as dictionary."""
        return {
            "name": self.name,
            "description": self.description,
            "type": "counter",
            "value": self._value,
            "labels": self.labels,
            "history": [
                {"value": h.value, "timestamp": h.timestamp}
                for h in self._history
            ]
        }


class Gauge:
    """
    A gauge metric that can increase and decrease.
    
    Use for values that go up and down like:
    - Memory usage
    - CPU usage
    - Active connections
    """
    
    def __init__(self, name: str, description: str = "", labels: Dict[str, str] = None):
        self.name = name
        self.description = description
        self.labels = labels or {}
        self._value = 0.0
        self._lock = threading.Lock()
        self._history: List[MetricValue] = []
    
    def set(self, value: float) -> None:
        """Set the gauge to a specific value."""
        with self._lock:
            self._value = value
            self._history.append(MetricValue(
                name=self.name,
                value=self._value,
                timestamp=time.time(),
                labels=self.labels,
                metric_type="gauge"
            ))
    
    def inc(self, amount: float = 1) -> None:
        """Increment the gauge."""
        with self._lock:
            self._value += amount
            self._history.append(MetricValue(
                name=self.name,
                value=self._value,
                timestamp=time.time(),
                labels=self.labels,
                metric_type="gauge"
            ))
    
    def dec(self, amount: float = 1) -> None:
        """Decrement the gauge."""
        with self._lock:
            self._value -= amount
            self._history.append(MetricValue(
                name=self.name,
                value=self._value,
                timestamp=time.time(),
                labels=self.labels,
                metric_type="gauge"
            ))
    
    def get(self) -> float:
        """Get the current gauge value."""
        return self._value
    
    def to_dict(self) -> Dict[str, Any]:
        """Export gauge data as dictionary."""
        return {
            "name": self.name,
            "description": self.description,
            "type": "gauge",
            "value": self._value,
            "labels": self.labels,
            "history": [
                {"value": h.value, "timestamp": h.timestamp}
                for h in self._history
            ]
        }


class Histogram:
    """
    A histogram metric for tracking distributions.
    
    Use for values like:
    - Request latencies
    - Response sizes
    - Processing times
    """
    
    def __init__(self, name: str, description: str = "", 
                 buckets: List[float] = None, labels: Dict[str, str] = None):
        self.name = name
        self.description = description
        self.labels = labels or {}
        self.buckets = buckets or [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
        self._values: List[float] = []
        self._lock = threading.Lock()
        self._timestamps: List[float] = []
    
    def observe(self, value: float) -> None:
        """Record a value in the histogram."""
        with self._lock:
            self._values.append(value)
            self._timestamps.append(time.time())
    
    def get_count(self) -> int:
        """Get the number of observations."""
        return len(self._values)
    
    def get_sum(self) -> float:
        """Get the sum of all observations."""
        return sum(self._values) if self._values else 0.0
    
    def get_mean(self) -> float:
        """Get the mean of all observations."""
        return statistics.mean(self._values) if self._values else 0.0
    
    def get_percentile(self, p: float) -> float:
        """Get a percentile (0-100) of observations."""
        if not self._values:
            return 0.0
        sorted_values = sorted(self._values)
        idx = int(len(sorted_values) * p / 100)
        return sorted_values[min(idx, len(sorted_values) - 1)]
    
    def get_bucket_counts(self) -> Dict[str, int]:
        """Get counts for each bucket."""
        counts = {f"le_{b}": 0 for b in self.buckets}
        counts["le_inf"] = len(self._values)
        
        for value in self._values:
            for bucket in self.buckets:
                if value <= bucket:
                    counts[f"le_{bucket}"] += 1
        
        return counts
    
    def to_dict(self) -> Dict[str, Any]:
        """Export histogram data as dictionary."""
        return {
            "name": self.name,
            "description": self.description,
            "type": "histogram",
            "count": self.get_count(),
            "sum": self.get_sum(),
            "mean": self.get_mean() if self._values else None,
            "min": min(self._values) if self._values else None,
            "max": max(self._values) if self._values else None,
            "p50": self.get_percentile(50) if self._values else None,
            "p90": self.get_percentile(90) if self._values else None,
            "p99": self.get_percentile(99) if self._values else None,
            "buckets": self.get_bucket_counts(),
            "labels": self.labels,
            "values": [
                {"value": v, "timestamp": t}
                for v, t in zip(self._values, self._timestamps)
            ]
        }


class Timer:
    """
    A timer for measuring durations.
    
    Can be used as a context manager or decorator.
    """
    
    def __init__(self, name: str, description: str = "", labels: Dict[str, str] = None):
        self.name = name
        self.description = description
        self.labels = labels or {}
        self._histogram = Histogram(name, description, labels=labels)
        self._start_time: Optional[float] = None
    
    def start(self) -> None:
        """Start the timer."""
        self._start_time = time.time()
    
    def stop(self) -> float:
        """Stop the timer and record the duration."""
        if self._start_time is None:
            raise RuntimeError("Timer was not started")
        
        duration = time.time() - self._start_time
        self._histogram.observe(duration)
        self._start_time = None
        return duration
    
    @contextmanager
    def time(self):
        """Context manager for timing a block of code."""
        self.start()
        try:
            yield self
        finally:
            self.stop()
    
    def __call__(self, func: Callable) -> Callable:
        """Decorator for timing a function."""
        def wrapper(*args, **kwargs):
            with self.time():
                return func(*args, **kwargs)
        wrapper.__name__ = func.__name__
        wrapper.__doc__ = func.__doc__
        return wrapper
    
    def get_histogram(self) -> Histogram:
        """Get the underlying histogram."""
        return self._histogram
    
    def to_dict(self) -> Dict[str, Any]:
        """Export timer data as dictionary."""
        data = self._histogram.to_dict()
        data["type"] = "timer"
        return data


class MetricsCollector:
    """
    Central metrics collector that manages all metrics.
    
    Provides a registry for metrics and methods for
    exporting all collected data.
    """
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        """Singleton pattern for global metrics collection."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self._counters: Dict[str, Counter] = {}
        self._gauges: Dict[str, Gauge] = {}
        self._histograms: Dict[str, Histogram] = {}
        self._timers: Dict[str, Timer] = {}
        self._metadata: Dict[str, Any] = {}
        self._start_time = time.time()
        self._initialized = True
    
    def set_metadata(self, key: str, value: Any) -> None:
        """Set metadata for the metrics collection."""
        self._metadata[key] = value
    
    def counter(self, name: str, description: str = "", 
                labels: Dict[str, str] = None) -> Counter:
        """Get or create a counter metric."""
        if name not in self._counters:
            self._counters[name] = Counter(name, description, labels)
        return self._counters[name]
    
    def gauge(self, name: str, description: str = "",
              labels: Dict[str, str] = None) -> Gauge:
        """Get or create a gauge metric."""
        if name not in self._gauges:
            self._gauges[name] = Gauge(name, description, labels)
        return self._gauges[name]
    
    def histogram(self, name: str, description: str = "",
                  buckets: List[float] = None, labels: Dict[str, str] = None) -> Histogram:
        """Get or create a histogram metric."""
        if name not in self._histograms:
            self._histograms[name] = Histogram(name, description, buckets, labels)
        return self._histograms[name]
    
    def timer(self, name: str, description: str = "",
              labels: Dict[str, str] = None) -> Timer:
        """Get or create a timer metric."""
        if name not in self._timers:
            self._timers[name] = Timer(name, description, labels)
        return self._timers[name]
    
    def collect_all(self) -> Dict[str, Any]:
        """Collect all metrics data."""
        return {
            "metadata": {
                **self._metadata,
                "collection_start": self._start_time,
                "collection_end": time.time(),
                "duration_seconds": time.time() - self._start_time
            },
            "counters": {name: c.to_dict() for name, c in self._counters.items()},
            "gauges": {name: g.to_dict() for name, g in self._gauges.items()},
            "histograms": {name: h.to_dict() for name, h in self._histograms.items()},
            "timers": {name: t.to_dict() for name, t in self._timers.items()}
        }
    
    def export_json(self, filepath: str) -> None:
        """Export all metrics to a JSON file."""
        data = self.collect_all()
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
    
    def reset(self) -> None:
        """Reset all metrics (useful for testing)."""
        self._counters.clear()
        self._gauges.clear()
        self._histograms.clear()
        self._timers.clear()
        self._metadata.clear()
        self._start_time = time.time()
    
    @classmethod
    def reset_instance(cls) -> None:
        """Reset the singleton instance (useful for testing)."""
        cls._instance = None


# Global convenience functions
def get_metrics() -> MetricsCollector:
    """Get the global metrics collector instance."""
    return MetricsCollector()


def counter(name: str, description: str = "", labels: Dict[str, str] = None) -> Counter:
    """Get or create a counter metric."""
    return get_metrics().counter(name, description, labels)


def gauge(name: str, description: str = "", labels: Dict[str, str] = None) -> Gauge:
    """Get or create a gauge metric."""
    return get_metrics().gauge(name, description, labels)


def histogram(name: str, description: str = "", 
              buckets: List[float] = None, labels: Dict[str, str] = None) -> Histogram:
    """Get or create a histogram metric."""
    return get_metrics().histogram(name, description, buckets, labels)


def timer(name: str, description: str = "", labels: Dict[str, str] = None) -> Timer:
    """Get or create a timer metric."""
    return get_metrics().timer(name, description, labels)
