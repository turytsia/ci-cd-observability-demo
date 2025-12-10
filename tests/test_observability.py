"""
Tests for the custom observability library.
"""

import pytest
import sys
import os
import time
import json
import tempfile

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from observability.metrics import (
    Counter, Gauge, Histogram, Timer, MetricsCollector
)
from observability.logger import (
    ObservabilityLogger, LogLevel, LogContext, MemoryHandler, ConsoleHandler
)
from observability.tracer import (
    Tracer, Span, SpanContext, SpanStatus
)


class TestCounter:
    """Tests for Counter metric."""
    
    def test_initial_value(self):
        counter = Counter("test_counter")
        assert counter.get() == 0
    
    def test_increment(self):
        counter = Counter("test_counter")
        counter.inc()
        assert counter.get() == 1
        counter.inc(5)
        assert counter.get() == 6
    
    def test_reset(self):
        counter = Counter("test_counter")
        counter.inc(10)
        counter.reset()
        assert counter.get() == 0
    
    def test_to_dict(self):
        counter = Counter("test_counter", "A test counter")
        counter.inc(3)
        data = counter.to_dict()
        assert data["name"] == "test_counter"
        assert data["type"] == "counter"
        assert data["value"] == 3


class TestGauge:
    """Tests for Gauge metric."""
    
    def test_set_value(self):
        gauge = Gauge("test_gauge")
        gauge.set(42.5)
        assert gauge.get() == 42.5
    
    def test_increment_decrement(self):
        gauge = Gauge("test_gauge")
        gauge.set(10)
        gauge.inc(5)
        assert gauge.get() == 15
        gauge.dec(3)
        assert gauge.get() == 12
    
    def test_to_dict(self):
        gauge = Gauge("test_gauge", "A test gauge")
        gauge.set(100)
        data = gauge.to_dict()
        assert data["name"] == "test_gauge"
        assert data["type"] == "gauge"
        assert data["value"] == 100


class TestHistogram:
    """Tests for Histogram metric."""
    
    def test_observe(self):
        histogram = Histogram("test_histogram")
        histogram.observe(0.1)
        histogram.observe(0.2)
        histogram.observe(0.3)
        assert histogram.get_count() == 3
    
    def test_statistics(self):
        histogram = Histogram("test_histogram")
        for i in range(100):
            histogram.observe(i)
        
        assert histogram.get_count() == 100
        assert histogram.get_sum() == sum(range(100))
        assert 49 <= histogram.get_mean() <= 50
    
    def test_percentiles(self):
        histogram = Histogram("test_histogram")
        for i in range(100):
            histogram.observe(i)
        
        p50 = histogram.get_percentile(50)
        assert 45 <= p50 <= 55


class TestTimer:
    """Tests for Timer metric."""
    
    def test_context_manager(self):
        timer = Timer("test_timer")
        with timer.time():
            time.sleep(0.05)
        
        histogram = timer.get_histogram()
        assert histogram.get_count() == 1
        assert histogram.get_mean() >= 0.05
    
    def test_manual_timing(self):
        timer = Timer("test_timer")
        timer.start()
        time.sleep(0.02)
        duration = timer.stop()
        
        assert duration >= 0.02
    
    def test_decorator(self):
        timer = Timer("test_timer")
        
        @timer
        def slow_function():
            time.sleep(0.01)
            return "done"
        
        result = slow_function()
        assert result == "done"
        assert timer.get_histogram().get_count() == 1


class TestMetricsCollector:
    """Tests for MetricsCollector."""
    
    def setup_method(self):
        """Reset singleton before each test."""
        MetricsCollector.reset_instance()
    
    def test_singleton(self):
        m1 = MetricsCollector()
        m2 = MetricsCollector()
        assert m1 is m2
    
    def test_create_metrics(self):
        collector = MetricsCollector()
        
        counter = collector.counter("ops")
        gauge = collector.gauge("memory")
        histogram = collector.histogram("latency")
        timer = collector.timer("duration")
        
        assert counter.name == "ops"
        assert gauge.name == "memory"
        assert histogram.name == "latency"
        assert timer.name == "duration"
    
    def test_collect_all(self):
        collector = MetricsCollector()
        collector.counter("test").inc()
        collector.gauge("test").set(1)
        
        data = collector.collect_all()
        assert "counters" in data
        assert "gauges" in data
        assert "metadata" in data


class TestObservabilityLogger:
    """Tests for ObservabilityLogger."""
    
    def setup_method(self):
        """Reset logger before each test."""
        ObservabilityLogger.reset()
        LogContext.clear()
    
    def test_get_logger(self):
        logger = ObservabilityLogger.get_logger("test")
        assert logger.name == "test"
    
    def test_log_levels(self):
        handler = MemoryHandler(level=LogLevel.DEBUG)
        ObservabilityLogger.add_global_handler(handler)
        
        logger = ObservabilityLogger.get_logger("test")
        logger.debug("debug message")
        logger.info("info message")
        logger.warn("warn message")
        logger.error("error message")
        
        entries = handler.get_entries()
        assert len(entries) == 4
        assert entries[0].level == "DEBUG"
        assert entries[3].level == "ERROR"
    
    def test_correlation_id(self):
        handler = MemoryHandler()
        ObservabilityLogger.add_global_handler(handler)
        
        LogContext.set_correlation_id("test-123")
        logger = ObservabilityLogger.get_logger("test")
        logger.info("test message")
        
        entries = handler.get_entries()
        assert entries[0].correlation_id == "test-123"
    
    def test_extra_fields(self):
        handler = MemoryHandler()
        ObservabilityLogger.add_global_handler(handler)
        
        logger = ObservabilityLogger.get_logger("test")
        logger.info("test message", user_id=123, action="login")
        
        entries = handler.get_entries()
        assert entries[0].extra["user_id"] == 123
        assert entries[0].extra["action"] == "login"


class TestTracer:
    """Tests for distributed tracing."""
    
    def setup_method(self):
        """Reset tracer before each test."""
        Tracer.reset_instance()
    
    def test_singleton(self):
        t1 = Tracer()
        t2 = Tracer()
        assert t1 is t2
    
    def test_create_span(self):
        tracer = Tracer()
        tracer.configure(service_name="test-service")
        
        span = tracer.start_span("test-span")
        assert span.name == "test-span"
        assert span.context.trace_id is not None
        assert span.context.span_id is not None
        span.end()
    
    def test_child_span(self):
        tracer = Tracer()
        tracer.configure(service_name="test-service")
        
        with tracer.span("parent") as parent:
            with tracer.span("child") as child:
                assert child.context.trace_id == parent.context.trace_id
                assert child.context.parent_span_id == parent.context.span_id
    
    def test_span_attributes(self):
        tracer = Tracer()
        
        span = tracer.start_span("test")
        span.set_attribute("key", "value")
        span.set_attributes({"num": 123, "flag": True})
        span.end()
        
        assert span.attributes["key"] == "value"
        assert span.attributes["num"] == 123
    
    def test_span_events(self):
        tracer = Tracer()
        
        span = tracer.start_span("test")
        span.add_event("event1", {"detail": "value"})
        span.end()
        
        assert len(span.events) == 1
        assert span.events[0].name == "event1"
    
    def test_span_status(self):
        tracer = Tracer()
        
        span = tracer.start_span("test")
        span.set_status(SpanStatus.ERROR, "Something failed")
        span.end()
        
        assert span.status == SpanStatus.ERROR
        assert span.status_message == "Something failed"
    
    def test_context_propagation(self):
        tracer = Tracer()
        
        with tracer.span("request") as span:
            headers = {}
            tracer.inject_context(headers)
            
            assert "X-Trace-Context" in headers
            
            extracted = tracer.extract_context(headers)
            assert extracted.trace_id == span.context.trace_id
    
    def test_collect_traces(self):
        tracer = Tracer()
        tracer.configure(service_name="test")
        
        with tracer.span("trace1"):
            with tracer.span("child1"):
                pass
        
        data = tracer.collect_traces()
        assert data["summary"]["total_traces"] == 1
        assert data["summary"]["total_spans"] == 2


class TestSpanContext:
    """Tests for SpanContext."""
    
    def test_to_dict(self):
        context = SpanContext(
            trace_id="trace123",
            span_id="span456",
            parent_span_id="parent789"
        )
        data = context.to_dict()
        assert data["trace_id"] == "trace123"
        assert data["span_id"] == "span456"
        assert data["parent_span_id"] == "parent789"
    
    def test_header_serialization(self):
        context = SpanContext(
            trace_id="trace123",
            span_id="span456",
            parent_span_id="parent789"
        )
        
        header = context.to_header()
        restored = SpanContext.from_header(header)
        
        assert restored.trace_id == context.trace_id
        assert restored.span_id == context.span_id
        assert restored.parent_span_id == context.parent_span_id


class TestIntegration:
    """Integration tests for observability components."""
    
    def setup_method(self):
        """Reset all components."""
        MetricsCollector.reset_instance()
        Tracer.reset_instance()
        ObservabilityLogger.reset()
        LogContext.clear()
    
    def test_full_observability_flow(self):
        """Test all observability components working together."""
        # Setup
        metrics = MetricsCollector()
        tracer = Tracer()
        tracer.configure(service_name="integration-test")
        
        handler = MemoryHandler()
        ObservabilityLogger.add_global_handler(handler)
        logger = ObservabilityLogger.get_logger("test")
        
        # Run workflow
        ops_counter = metrics.counter("operations")
        timer = metrics.timer("duration")
        
        with tracer.span("main") as span:
            LogContext.set_trace_id(span.context.trace_id)
            LogContext.set_span_id(span.context.span_id)
            
            logger.info("Starting operation")
            
            with timer.time():
                for i in range(5):
                    with tracer.span(f"operation_{i}"):
                        ops_counter.inc()
                        time.sleep(0.01)
            
            logger.info("Completed operations", count=ops_counter.get())
        
        # Verify
        assert ops_counter.get() == 5
        assert timer.get_histogram().get_count() == 1
        
        logs = handler.get_entries()
        assert len(logs) >= 2
        assert logs[0].trace_id == span.context.trace_id
        
        trace_data = tracer.collect_traces()
        assert trace_data["summary"]["total_spans"] == 6  # 1 main + 5 operations
    
    def test_export_to_file(self):
        """Test exporting observability data to files."""
        metrics = MetricsCollector()
        tracer = Tracer()
        tracer.configure(service_name="export-test")
        
        metrics.counter("test").inc(10)
        
        with tracer.span("test"):
            pass
        
        with tempfile.TemporaryDirectory() as tmpdir:
            metrics_path = os.path.join(tmpdir, "metrics.json")
            traces_path = os.path.join(tmpdir, "traces.json")
            
            metrics.export_json(metrics_path)
            tracer.export_json(traces_path)
            
            assert os.path.exists(metrics_path)
            assert os.path.exists(traces_path)
            
            with open(metrics_path) as f:
                data = json.load(f)
                assert "counters" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
