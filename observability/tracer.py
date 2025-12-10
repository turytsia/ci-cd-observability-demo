"""
Custom Distributed Tracing

Implements traces and spans for tracking execution flow
across CI/CD pipeline stages.
"""

import time
import threading
import uuid
import json
from typing import Dict, Any, Optional, List, Callable
from dataclasses import dataclass, field
from contextlib import contextmanager
from enum import Enum


class SpanStatus(Enum):
    """Status of a span."""
    UNSET = "unset"
    OK = "ok"
    ERROR = "error"


@dataclass
class SpanContext:
    """Context that uniquely identifies a span."""
    trace_id: str
    span_id: str
    parent_span_id: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        data = {
            "trace_id": self.trace_id,
            "span_id": self.span_id
        }
        if self.parent_span_id:
            data["parent_span_id"] = self.parent_span_id
        return data
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'SpanContext':
        """Create from dictionary."""
        return cls(
            trace_id=data["trace_id"],
            span_id=data["span_id"],
            parent_span_id=data.get("parent_span_id")
        )
    
    def to_header(self) -> str:
        """Convert to header string for propagation."""
        return f"{self.trace_id}:{self.span_id}:{self.parent_span_id or ''}"
    
    @classmethod
    def from_header(cls, header: str) -> 'SpanContext':
        """Parse from header string."""
        parts = header.split(":")
        return cls(
            trace_id=parts[0],
            span_id=parts[1],
            parent_span_id=parts[2] if len(parts) > 2 and parts[2] else None
        )


@dataclass
class SpanEvent:
    """An event that occurred during a span."""
    name: str
    timestamp: float
    attributes: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "timestamp": self.timestamp,
            "attributes": self.attributes
        }


@dataclass
class Span:
    """
    Represents a unit of work or operation.
    
    A span has a name, start time, duration, and can have
    attributes, events, and child spans.
    """
    
    name: str
    context: SpanContext
    start_time: float = field(default_factory=time.time)
    end_time: Optional[float] = None
    status: SpanStatus = SpanStatus.UNSET
    status_message: Optional[str] = None
    attributes: Dict[str, Any] = field(default_factory=dict)
    events: List[SpanEvent] = field(default_factory=list)
    _tracer: Optional['Tracer'] = field(default=None, repr=False)
    
    def set_attribute(self, key: str, value: Any) -> 'Span':
        """Set an attribute on the span."""
        self.attributes[key] = value
        return self
    
    def set_attributes(self, attributes: Dict[str, Any]) -> 'Span':
        """Set multiple attributes."""
        self.attributes.update(attributes)
        return self
    
    def add_event(self, name: str, attributes: Dict[str, Any] = None) -> 'Span':
        """Add an event to the span."""
        event = SpanEvent(
            name=name,
            timestamp=time.time(),
            attributes=attributes or {}
        )
        self.events.append(event)
        return self
    
    def set_status(self, status: SpanStatus, message: str = None) -> 'Span':
        """Set the status of the span."""
        self.status = status
        self.status_message = message
        return self
    
    def end(self, end_time: float = None) -> None:
        """End the span."""
        self.end_time = end_time or time.time()
        if self._tracer:
            self._tracer._on_span_end(self)
    
    @property
    def duration_ms(self) -> Optional[float]:
        """Get the duration in milliseconds."""
        if self.end_time:
            return (self.end_time - self.start_time) * 1000
        return None
    
    @property
    def is_recording(self) -> bool:
        """Check if the span is still recording."""
        return self.end_time is None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert span to dictionary."""
        data = {
            "name": self.name,
            "context": self.context.to_dict(),
            "start_time": self.start_time,
            "status": self.status.value,
            "attributes": self.attributes
        }
        
        if self.end_time:
            data["end_time"] = self.end_time
            data["duration_ms"] = self.duration_ms
        
        if self.status_message:
            data["status_message"] = self.status_message
        
        if self.events:
            data["events"] = [e.to_dict() for e in self.events]
        
        return data
    
    def __enter__(self) -> 'Span':
        """Context manager entry."""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        """Context manager exit."""
        if exc_type:
            self.set_status(SpanStatus.ERROR, str(exc_val))
            self.set_attribute("error.type", exc_type.__name__)
            self.set_attribute("error.message", str(exc_val))
        elif self.status == SpanStatus.UNSET:
            self.set_status(SpanStatus.OK)
        
        self.end()


class TracerContext:
    """Thread-local context for the current span."""
    
    _local = threading.local()
    
    @classmethod
    def get_current_span(cls) -> Optional[Span]:
        """Get the current active span."""
        stack = getattr(cls._local, 'span_stack', [])
        return stack[-1] if stack else None
    
    @classmethod
    def push_span(cls, span: Span) -> None:
        """Push a span onto the stack."""
        if not hasattr(cls._local, 'span_stack'):
            cls._local.span_stack = []
        cls._local.span_stack.append(span)
    
    @classmethod
    def pop_span(cls) -> Optional[Span]:
        """Pop a span from the stack."""
        stack = getattr(cls._local, 'span_stack', [])
        return stack.pop() if stack else None
    
    @classmethod
    def clear(cls) -> None:
        """Clear the span stack."""
        cls._local.span_stack = []


class Tracer:
    """
    Main tracer class for distributed tracing.
    
    Manages span creation, context propagation, and
    trace collection.
    """
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        """Singleton pattern for global tracer."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self.service_name: str = "unknown"
        self._traces: Dict[str, List[Span]] = {}
        self._completed_spans: List[Span] = []
        self._lock = threading.Lock()
        self._metadata: Dict[str, Any] = {}
        self._initialized = True
    
    def configure(self, service_name: str, **metadata) -> None:
        """Configure the tracer."""
        self.service_name = service_name
        self._metadata = metadata
    
    def _generate_id(self) -> str:
        """Generate a unique ID."""
        return uuid.uuid4().hex[:16]
    
    def start_span(self, name: str, parent: Span = None, 
                   attributes: Dict[str, Any] = None) -> Span:
        """Start a new span."""
        # Determine parent
        if parent is None:
            parent = TracerContext.get_current_span()
        
        # Generate context
        if parent:
            context = SpanContext(
                trace_id=parent.context.trace_id,
                span_id=self._generate_id(),
                parent_span_id=parent.context.span_id
            )
        else:
            context = SpanContext(
                trace_id=self._generate_id(),
                span_id=self._generate_id()
            )
        
        # Create span
        span = Span(
            name=name,
            context=context,
            attributes=attributes or {},
            _tracer=self
        )
        
        span.set_attribute("service.name", self.service_name)
        
        # Track the trace
        with self._lock:
            if context.trace_id not in self._traces:
                self._traces[context.trace_id] = []
            self._traces[context.trace_id].append(span)
        
        # Push to context
        TracerContext.push_span(span)
        
        return span
    
    def _on_span_end(self, span: Span) -> None:
        """Called when a span ends."""
        TracerContext.pop_span()
        with self._lock:
            self._completed_spans.append(span)
    
    @contextmanager
    def span(self, name: str, attributes: Dict[str, Any] = None):
        """Context manager for creating a span."""
        span = self.start_span(name, attributes=attributes)
        try:
            yield span
        except Exception as e:
            span.set_status(SpanStatus.ERROR, str(e))
            span.set_attribute("error.type", type(e).__name__)
            span.set_attribute("error.message", str(e))
            raise
        finally:
            if span.status == SpanStatus.UNSET:
                span.set_status(SpanStatus.OK)
            span.end()
    
    def trace(self, name: str = None, attributes: Dict[str, Any] = None) -> Callable:
        """Decorator for tracing a function."""
        def decorator(func: Callable) -> Callable:
            span_name = name or func.__name__
            
            def wrapper(*args, **kwargs):
                with self.span(span_name, attributes=attributes) as span:
                    span.set_attribute("function.name", func.__name__)
                    span.set_attribute("function.module", func.__module__)
                    return func(*args, **kwargs)
            
            wrapper.__name__ = func.__name__
            wrapper.__doc__ = func.__doc__
            return wrapper
        
        return decorator
    
    def get_current_span(self) -> Optional[Span]:
        """Get the current active span."""
        return TracerContext.get_current_span()
    
    def get_current_context(self) -> Optional[SpanContext]:
        """Get the current span context."""
        span = self.get_current_span()
        return span.context if span else None
    
    def inject_context(self, headers: Dict[str, str]) -> None:
        """Inject trace context into headers for propagation."""
        context = self.get_current_context()
        if context:
            headers["X-Trace-Context"] = context.to_header()
    
    def extract_context(self, headers: Dict[str, str]) -> Optional[SpanContext]:
        """Extract trace context from headers."""
        header = headers.get("X-Trace-Context")
        if header:
            return SpanContext.from_header(header)
        return None
    
    def start_span_from_context(self, name: str, context: SpanContext,
                                 attributes: Dict[str, Any] = None) -> Span:
        """Start a span using an extracted context as parent."""
        new_context = SpanContext(
            trace_id=context.trace_id,
            span_id=self._generate_id(),
            parent_span_id=context.span_id
        )
        
        span = Span(
            name=name,
            context=new_context,
            attributes=attributes or {},
            _tracer=self
        )
        
        span.set_attribute("service.name", self.service_name)
        
        with self._lock:
            if new_context.trace_id not in self._traces:
                self._traces[new_context.trace_id] = []
            self._traces[new_context.trace_id].append(span)
        
        TracerContext.push_span(span)
        
        return span
    
    def collect_traces(self) -> Dict[str, Any]:
        """Collect all trace data."""
        return {
            "metadata": {
                "service_name": self.service_name,
                **self._metadata
            },
            "traces": {
                trace_id: [s.to_dict() for s in spans]
                for trace_id, spans in self._traces.items()
            },
            "summary": {
                "total_traces": len(self._traces),
                "total_spans": sum(len(s) for s in self._traces.values()),
                "completed_spans": len(self._completed_spans)
            }
        }
    
    def export_json(self, filepath: str) -> None:
        """Export traces to JSON file."""
        data = self.collect_traces()
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
    
    def reset(self) -> None:
        """Reset the tracer (useful for testing)."""
        self._traces.clear()
        self._completed_spans.clear()
        TracerContext.clear()
    
    @classmethod
    def reset_instance(cls) -> None:
        """Reset the singleton instance."""
        cls._instance = None


# Global convenience functions
def get_tracer() -> Tracer:
    """Get the global tracer instance."""
    return Tracer()


def start_span(name: str, attributes: Dict[str, Any] = None) -> Span:
    """Start a new span."""
    return get_tracer().start_span(name, attributes=attributes)


@contextmanager
def span(name: str, attributes: Dict[str, Any] = None):
    """Context manager for creating a span."""
    with get_tracer().span(name, attributes=attributes) as s:
        yield s


def trace(name: str = None, attributes: Dict[str, Any] = None) -> Callable:
    """Decorator for tracing a function."""
    return get_tracer().trace(name, attributes)
