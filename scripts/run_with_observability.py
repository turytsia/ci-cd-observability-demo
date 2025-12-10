"""
Run Application with Observability

This script wraps the sample application with full
observability instrumentation.
"""

import sys
import os
import time
import psutil
import platform

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from observability import (
    MetricsCollector, 
    ObservabilityLogger, 
    LogLevel,
    MemoryHandler,
    ConsoleHandler,
    Tracer,
    ObservabilityExporter
)
from observability.logger import LogContext, correlation_scope
from src.app import DataProcessor, Calculator, DataFetcher


def setup_observability():
    """Initialize all observability components."""
    # Setup metrics
    metrics = MetricsCollector()
    metrics.set_metadata("service", "ci-cd-demo")
    metrics.set_metadata("version", "1.0.0")
    metrics.set_metadata("environment", os.environ.get("CI", "local"))
    metrics.set_metadata("platform", platform.system())
    metrics.set_metadata("python_version", platform.python_version())
    
    # Setup logging with both console and memory handlers
    memory_handler = MemoryHandler(level=LogLevel.DEBUG)
    console_handler = ConsoleHandler(level=LogLevel.INFO)
    
    ObservabilityLogger.add_global_handler(memory_handler)
    ObservabilityLogger.add_global_handler(console_handler)
    
    # Setup tracer
    tracer = Tracer()
    tracer.configure(
        service_name="ci-cd-demo",
        version="1.0.0",
        environment=os.environ.get("CI", "local")
    )
    
    return metrics, memory_handler, tracer


def collect_system_metrics(metrics: MetricsCollector):
    """Collect system-level metrics."""
    # Memory metrics
    memory = psutil.virtual_memory()
    metrics.gauge("system.memory.total_mb", "Total system memory").set(memory.total / 1024 / 1024)
    metrics.gauge("system.memory.available_mb", "Available system memory").set(memory.available / 1024 / 1024)
    metrics.gauge("system.memory.percent", "Memory usage percentage").set(memory.percent)
    
    # CPU metrics
    cpu_percent = psutil.cpu_percent(interval=0.1)
    metrics.gauge("system.cpu.percent", "CPU usage percentage").set(cpu_percent)
    metrics.gauge("system.cpu.count", "Number of CPUs").set(psutil.cpu_count())
    
    # Disk metrics
    disk = psutil.disk_usage('/')
    metrics.gauge("system.disk.total_gb", "Total disk space").set(disk.total / 1024 / 1024 / 1024)
    metrics.gauge("system.disk.free_gb", "Free disk space").set(disk.free / 1024 / 1024 / 1024)


def run_with_observability():
    """Run the sample application with full observability."""
    # Initialize
    metrics, memory_handler, tracer = setup_observability()
    logger = ObservabilityLogger.get_logger("main")
    
    # Start main trace
    with tracer.span("main_workflow", attributes={"workflow": "demo"}) as main_span:
        with correlation_scope() as correlation_id:
            logger.info("Starting observed workflow", correlation_id=correlation_id)
            
            # Collect initial system metrics
            collect_system_metrics(metrics)
            
            # Counter for overall operations
            ops_counter = metrics.counter("workflow.operations", "Total operations performed")
            errors_counter = metrics.counter("workflow.errors", "Total errors encountered")
            
            # Timer for overall workflow
            workflow_timer = metrics.timer("workflow.duration", "Total workflow duration")
            
            with workflow_timer.time():
                # Stage 1: Data Fetching
                with tracer.span("stage_fetch", attributes={"stage": "fetch"}) as fetch_span:
                    logger.info("Stage 1: Fetching data")
                    fetch_timer = metrics.timer("fetch.duration", "Data fetch duration")
                    
                    fetcher = DataFetcher("api.example.com")
                    
                    with fetch_timer.time():
                        for i in range(3):
                            try:
                                with tracer.span(f"fetch_request_{i}"):
                                    result = fetcher.fetch(f"query_{i}")
                                    ops_counter.inc()
                                    metrics.histogram("fetch.latency_ms").observe(result["latency_ms"])
                                    logger.debug(f"Fetch {i} completed", latency=result["latency_ms"])
                            except TimeoutError as e:
                                errors_counter.inc()
                                logger.warn(f"Fetch {i} timed out", error=str(e))
                    
                    fetch_span.set_attribute("requests_made", fetcher.request_count)
                    logger.info(f"Stage 1 complete: {fetcher.request_count} requests made")
                
                # Stage 2: Data Processing
                with tracer.span("stage_process", attributes={"stage": "process"}) as process_span:
                    logger.info("Stage 2: Processing data")
                    process_timer = metrics.timer("process.duration", "Data processing duration")
                    
                    processor = DataProcessor("main")
                    test_data = list(range(20))
                    
                    with process_timer.time():
                        with tracer.span("batch_process"):
                            result = processor.process_batch(test_data)
                    
                    ops_counter.inc(result["successful"])
                    errors_counter.inc(result["errors"])
                    
                    metrics.histogram("process.batch_duration_ms").observe(result["duration_ms"])
                    metrics.gauge("process.success_rate").set(
                        result["successful"] / result["total_items"] * 100 if result["total_items"] > 0 else 0
                    )
                    
                    process_span.set_attributes({
                        "items_processed": result["successful"],
                        "items_failed": result["errors"],
                        "duration_ms": result["duration_ms"]
                    })
                    
                    logger.info(f"Stage 2 complete: {result['successful']}/{result['total_items']} processed")
                
                # Stage 3: Calculations
                with tracer.span("stage_calculate", attributes={"stage": "calculate"}) as calc_span:
                    logger.info("Stage 3: Running calculations")
                    calc_timer = metrics.timer("calc.duration", "Calculation duration")
                    
                    calculator = Calculator()
                    calc_results = []
                    
                    with calc_timer.time():
                        # Basic operations
                        for i in range(10):
                            with tracer.span(f"calc_set_{i}"):
                                a, b = i * 10, i + 1
                                calc_results.append({
                                    "add": calculator.add(a, b),
                                    "sub": calculator.subtract(a, b),
                                    "mul": calculator.multiply(a, b),
                                    "div": calculator.divide(a, b) if b != 0 else None
                                })
                                ops_counter.inc(4)
                        
                        # Fibonacci calculations
                        with tracer.span("fibonacci_calculations"):
                            for n in range(15):
                                fib = calculator.fibonacci(n)
                                ops_counter.inc()
                    
                    calc_span.set_attribute("calculation_sets", len(calc_results))
                    logger.info(f"Stage 3 complete: {len(calc_results)} calculation sets")
                
                # Stage 4: Error simulation
                with tracer.span("stage_error_handling", attributes={"stage": "errors"}) as error_span:
                    logger.info("Stage 4: Testing error handling")
                    
                    # Test division by zero
                    try:
                        with tracer.span("divide_by_zero_test"):
                            calculator.divide(10, 0)
                    except ZeroDivisionError as e:
                        errors_counter.inc()
                        logger.error("Division by zero caught", error=str(e))
                    
                    # Test negative fibonacci
                    try:
                        with tracer.span("negative_fibonacci_test"):
                            calculator.fibonacci(-1)
                    except ValueError as e:
                        errors_counter.inc()
                        logger.error("Invalid fibonacci input caught", error=str(e))
                    
                    error_span.set_attribute("errors_tested", 2)
                    logger.info("Stage 4 complete: Error handling verified")
            
            # Collect final system metrics
            collect_system_metrics(metrics)
            
            # Log summary
            main_span.set_attributes({
                "total_operations": ops_counter.get(),
                "total_errors": errors_counter.get()
            })
            
            logger.info(
                "Workflow complete",
                total_operations=ops_counter.get(),
                total_errors=errors_counter.get()
            )
    
    # Export results
    output_dir = os.environ.get("OBSERVABILITY_OUTPUT", "observability_output")
    exporter = ObservabilityExporter(output_dir)
    exporter.set_memory_handler(memory_handler)
    
    # Export all formats
    json_path = exporter.export_json()
    html_path = exporter.export_html_report()
    
    print(f"\n{'='*60}")
    print("Observability Report Generated:")
    print(f"  JSON: {json_path}")
    print(f"  HTML: {html_path}")
    print(f"{'='*60}")
    
    return {
        "json_path": json_path,
        "html_path": html_path,
        "operations": ops_counter.get(),
        "errors": errors_counter.get()
    }


if __name__ == "__main__":
    result = run_with_observability()
    print(f"\nTotal operations: {result['operations']}")
    print(f"Total errors: {result['errors']}")
