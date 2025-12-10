"""
Custom Structured Logging

Implements structured logging with JSON output, correlation IDs,
and log levels for CI/CD pipeline observability.
"""

import time
import json
import threading
import uuid
import sys
import os
from typing import Dict, Any, Optional, List, TextIO
from enum import IntEnum
from dataclasses import dataclass, field, asdict
from contextlib import contextmanager
from datetime import datetime


class LogLevel(IntEnum):
    """Log levels with numeric values for filtering."""
    DEBUG = 10
    INFO = 20
    WARN = 30
    ERROR = 40
    CRITICAL = 50


@dataclass
class LogEntry:
    """Represents a single log entry with all metadata."""
    timestamp: float
    level: str
    message: str
    logger_name: str
    correlation_id: Optional[str] = None
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)
    source_file: Optional[str] = None
    source_line: Optional[int] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary, excluding None values."""
        data = {
            "timestamp": self.timestamp,
            "datetime": datetime.fromtimestamp(self.timestamp).isoformat(),
            "level": self.level,
            "message": self.message,
            "logger": self.logger_name
        }
        
        if self.correlation_id:
            data["correlation_id"] = self.correlation_id
        if self.trace_id:
            data["trace_id"] = self.trace_id
        if self.span_id:
            data["span_id"] = self.span_id
        if self.extra:
            data["extra"] = self.extra
        if self.source_file:
            data["source"] = {
                "file": self.source_file,
                "line": self.source_line
            }
        
        return data
    
    def to_json(self) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict())


class LogContext:
    """Thread-local context for log correlation."""
    
    _local = threading.local()
    
    @classmethod
    def get_correlation_id(cls) -> Optional[str]:
        """Get the current correlation ID."""
        return getattr(cls._local, 'correlation_id', None)
    
    @classmethod
    def set_correlation_id(cls, correlation_id: str) -> None:
        """Set the correlation ID for the current thread."""
        cls._local.correlation_id = correlation_id
    
    @classmethod
    def get_trace_id(cls) -> Optional[str]:
        """Get the current trace ID."""
        return getattr(cls._local, 'trace_id', None)
    
    @classmethod
    def set_trace_id(cls, trace_id: str) -> None:
        """Set the trace ID for the current thread."""
        cls._local.trace_id = trace_id
    
    @classmethod
    def get_span_id(cls) -> Optional[str]:
        """Get the current span ID."""
        return getattr(cls._local, 'span_id', None)
    
    @classmethod
    def set_span_id(cls, span_id: str) -> None:
        """Set the span ID for the current thread."""
        cls._local.span_id = span_id
    
    @classmethod
    def get_extra(cls) -> Dict[str, Any]:
        """Get extra context data."""
        return getattr(cls._local, 'extra', {})
    
    @classmethod
    def set_extra(cls, key: str, value: Any) -> None:
        """Set an extra context value."""
        if not hasattr(cls._local, 'extra'):
            cls._local.extra = {}
        cls._local.extra[key] = value
    
    @classmethod
    def clear(cls) -> None:
        """Clear all context."""
        cls._local.correlation_id = None
        cls._local.trace_id = None
        cls._local.span_id = None
        cls._local.extra = {}
    
    @classmethod
    @contextmanager
    def scope(cls, correlation_id: str = None, trace_id: str = None, 
              span_id: str = None, **extra):
        """Context manager for scoped logging context."""
        old_correlation = cls.get_correlation_id()
        old_trace = cls.get_trace_id()
        old_span = cls.get_span_id()
        old_extra = cls.get_extra().copy()
        
        if correlation_id:
            cls.set_correlation_id(correlation_id)
        if trace_id:
            cls.set_trace_id(trace_id)
        if span_id:
            cls.set_span_id(span_id)
        for k, v in extra.items():
            cls.set_extra(k, v)
        
        try:
            yield
        finally:
            if old_correlation:
                cls.set_correlation_id(old_correlation)
            else:
                cls._local.correlation_id = None
            
            if old_trace:
                cls.set_trace_id(old_trace)
            else:
                cls._local.trace_id = None
            
            if old_span:
                cls.set_span_id(old_span)
            else:
                cls._local.span_id = None
            
            cls._local.extra = old_extra


class LogHandler:
    """Base class for log handlers."""
    
    def __init__(self, level: LogLevel = LogLevel.DEBUG):
        self.level = level
    
    def should_log(self, level: LogLevel) -> bool:
        """Check if this handler should process the given level."""
        return level >= self.level
    
    def emit(self, entry: LogEntry) -> None:
        """Emit a log entry. Override in subclasses."""
        raise NotImplementedError


class ConsoleHandler(LogHandler):
    """Handler that writes to console with colors."""
    
    COLORS = {
        "DEBUG": "\033[36m",    # Cyan
        "INFO": "\033[32m",     # Green
        "WARN": "\033[33m",     # Yellow
        "ERROR": "\033[31m",    # Red
        "CRITICAL": "\033[35m", # Magenta
    }
    RESET = "\033[0m"
    
    def __init__(self, level: LogLevel = LogLevel.DEBUG, 
                 stream: TextIO = None, use_colors: bool = True):
        super().__init__(level)
        self.stream = stream or sys.stderr
        self.use_colors = use_colors and hasattr(self.stream, 'isatty') and self.stream.isatty()
    
    def emit(self, entry: LogEntry) -> None:
        """Write log entry to console."""
        if not self.should_log(LogLevel[entry.level]):
            return
        
        timestamp = datetime.fromtimestamp(entry.timestamp).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        
        if self.use_colors:
            color = self.COLORS.get(entry.level, "")
            level_str = f"{color}{entry.level:8}{self.RESET}"
        else:
            level_str = f"{entry.level:8}"
        
        parts = [f"[{timestamp}]", level_str, f"[{entry.logger_name}]"]
        
        if entry.correlation_id:
            parts.append(f"[cid:{entry.correlation_id[:8]}]")
        
        parts.append(entry.message)
        
        if entry.extra:
            parts.append(f"| {json.dumps(entry.extra)}")
        
        line = " ".join(parts)
        print(line, file=self.stream)


class JsonHandler(LogHandler):
    """Handler that writes JSON-formatted logs."""
    
    def __init__(self, level: LogLevel = LogLevel.DEBUG, stream: TextIO = None):
        super().__init__(level)
        self.stream = stream or sys.stdout
    
    def emit(self, entry: LogEntry) -> None:
        """Write log entry as JSON."""
        if not self.should_log(LogLevel[entry.level]):
            return
        
        print(entry.to_json(), file=self.stream)


class FileHandler(LogHandler):
    """Handler that writes logs to a file."""
    
    def __init__(self, filepath: str, level: LogLevel = LogLevel.DEBUG, 
                 json_format: bool = True):
        super().__init__(level)
        self.filepath = filepath
        self.json_format = json_format
        self._lock = threading.Lock()
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(filepath) if os.path.dirname(filepath) else '.', exist_ok=True)
    
    def emit(self, entry: LogEntry) -> None:
        """Write log entry to file."""
        if not self.should_log(LogLevel[entry.level]):
            return
        
        with self._lock:
            with open(self.filepath, 'a') as f:
                if self.json_format:
                    f.write(entry.to_json() + "\n")
                else:
                    timestamp = datetime.fromtimestamp(entry.timestamp).isoformat()
                    f.write(f"{timestamp} {entry.level} [{entry.logger_name}] {entry.message}\n")


class MemoryHandler(LogHandler):
    """Handler that stores logs in memory for later retrieval."""
    
    def __init__(self, level: LogLevel = LogLevel.DEBUG, max_entries: int = 10000):
        super().__init__(level)
        self.max_entries = max_entries
        self._entries: List[LogEntry] = []
        self._lock = threading.Lock()
    
    def emit(self, entry: LogEntry) -> None:
        """Store log entry in memory."""
        if not self.should_log(LogLevel[entry.level]):
            return
        
        with self._lock:
            self._entries.append(entry)
            if len(self._entries) > self.max_entries:
                self._entries = self._entries[-self.max_entries:]
    
    def get_entries(self) -> List[LogEntry]:
        """Get all stored entries."""
        return self._entries.copy()
    
    def get_entries_as_dicts(self) -> List[Dict[str, Any]]:
        """Get all entries as dictionaries."""
        return [e.to_dict() for e in self._entries]
    
    def clear(self) -> None:
        """Clear all stored entries."""
        with self._lock:
            self._entries.clear()


class ObservabilityLogger:
    """
    Main logger class for structured logging.
    
    Supports multiple handlers, log levels, and
    automatic context propagation.
    """
    
    _loggers: Dict[str, 'ObservabilityLogger'] = {}
    _global_handlers: List[LogHandler] = []
    _global_level: LogLevel = LogLevel.DEBUG
    _lock = threading.Lock()
    
    def __init__(self, name: str, level: LogLevel = None):
        self.name = name
        self.level = level
        self._handlers: List[LogHandler] = []
    
    @classmethod
    def get_logger(cls, name: str = "root") -> 'ObservabilityLogger':
        """Get or create a logger by name."""
        if name not in cls._loggers:
            with cls._lock:
                if name not in cls._loggers:
                    cls._loggers[name] = cls(name)
        return cls._loggers[name]
    
    @classmethod
    def add_global_handler(cls, handler: LogHandler) -> None:
        """Add a handler to all loggers."""
        cls._global_handlers.append(handler)
    
    @classmethod
    def set_global_level(cls, level: LogLevel) -> None:
        """Set the minimum log level for all loggers."""
        cls._global_level = level
    
    @classmethod
    def reset(cls) -> None:
        """Reset all loggers and handlers."""
        cls._loggers.clear()
        cls._global_handlers.clear()
        cls._global_level = LogLevel.DEBUG
    
    def add_handler(self, handler: LogHandler) -> None:
        """Add a handler to this logger."""
        self._handlers.append(handler)
    
    def _get_effective_level(self) -> LogLevel:
        """Get the effective log level."""
        if self.level is not None:
            return self.level
        return self._global_level
    
    def _should_log(self, level: LogLevel) -> bool:
        """Check if we should log at this level."""
        return level >= self._get_effective_level()
    
    def _log(self, level: LogLevel, message: str, **extra) -> None:
        """Internal log method."""
        if not self._should_log(level):
            return
        
        # Get caller info
        import inspect
        frame = inspect.currentframe()
        source_file = None
        source_line = None
        if frame:
            try:
                # Go up 3 frames: _log -> debug/info/etc -> caller
                caller_frame = frame.f_back.f_back.f_back
                if caller_frame:
                    source_file = os.path.basename(caller_frame.f_code.co_filename)
                    source_line = caller_frame.f_lineno
            except:
                pass
        
        # Merge context extra with call extra
        context_extra = LogContext.get_extra()
        merged_extra = {**context_extra, **extra}
        
        entry = LogEntry(
            timestamp=time.time(),
            level=level.name,
            message=message,
            logger_name=self.name,
            correlation_id=LogContext.get_correlation_id(),
            trace_id=LogContext.get_trace_id(),
            span_id=LogContext.get_span_id(),
            extra=merged_extra if merged_extra else {},
            source_file=source_file,
            source_line=source_line
        )
        
        # Emit to all handlers
        all_handlers = self._handlers + self._global_handlers
        if not all_handlers:
            # Default to console if no handlers configured
            all_handlers = [ConsoleHandler()]
        
        for handler in all_handlers:
            try:
                handler.emit(entry)
            except Exception as e:
                sys.stderr.write(f"Error in log handler: {e}\n")
    
    def debug(self, message: str, **extra) -> None:
        """Log a debug message."""
        self._log(LogLevel.DEBUG, message, **extra)
    
    def info(self, message: str, **extra) -> None:
        """Log an info message."""
        self._log(LogLevel.INFO, message, **extra)
    
    def warn(self, message: str, **extra) -> None:
        """Log a warning message."""
        self._log(LogLevel.WARN, message, **extra)
    
    def warning(self, message: str, **extra) -> None:
        """Alias for warn."""
        self.warn(message, **extra)
    
    def error(self, message: str, **extra) -> None:
        """Log an error message."""
        self._log(LogLevel.ERROR, message, **extra)
    
    def critical(self, message: str, **extra) -> None:
        """Log a critical message."""
        self._log(LogLevel.CRITICAL, message, **extra)
    
    def exception(self, message: str, exc_info: Exception = None, **extra) -> None:
        """Log an error with exception info."""
        import traceback
        if exc_info:
            extra['exception'] = str(exc_info)
            extra['traceback'] = traceback.format_exc()
        self.error(message, **extra)


# Convenience functions
def get_logger(name: str = "root") -> ObservabilityLogger:
    """Get or create a logger."""
    return ObservabilityLogger.get_logger(name)


def new_correlation_id() -> str:
    """Generate a new correlation ID."""
    return str(uuid.uuid4())


@contextmanager
def correlation_scope(correlation_id: str = None, **extra):
    """Context manager for correlation scope."""
    cid = correlation_id or new_correlation_id()
    with LogContext.scope(correlation_id=cid, **extra):
        yield cid
