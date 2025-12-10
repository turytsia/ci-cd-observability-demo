"""
Sample Application to Observe

This is a simple application that performs various operations
which we will monitor using our custom observability stack.
"""

import random
import time
import math
from typing import List, Dict, Any


class DataProcessor:
    """A sample data processor class that we'll observe."""
    
    def __init__(self, name: str = "default"):
        self.name = name
        self.processed_count = 0
        self.errors_count = 0
    
    def process_batch(self, items: List[Any]) -> Dict[str, Any]:
        """Process a batch of items with simulated work."""
        results = []
        start_time = time.time()
        
        for item in items:
            try:
                result = self._process_item(item)
                results.append(result)
                self.processed_count += 1
            except Exception as e:
                self.errors_count += 1
                results.append({"error": str(e), "item": item})
        
        duration = time.time() - start_time
        
        return {
            "processor": self.name,
            "total_items": len(items),
            "successful": self.processed_count,
            "errors": self.errors_count,
            "duration_ms": duration * 1000,
            "results": results
        }
    
    def _process_item(self, item: Any) -> Dict[str, Any]:
        """Process a single item with simulated latency."""
        # Simulate processing time
        processing_time = random.uniform(0.01, 0.05)
        time.sleep(processing_time)
        
        # Simulate occasional failures (10% chance)
        if random.random() < 0.1:
            raise ValueError(f"Failed to process item: {item}")
        
        # Perform some computation
        if isinstance(item, (int, float)):
            result = {
                "input": item,
                "squared": item ** 2,
                "sqrt": math.sqrt(abs(item)),
                "processed_at": time.time()
            }
        else:
            result = {
                "input": item,
                "length": len(str(item)),
                "hash": hash(str(item)),
                "processed_at": time.time()
            }
        
        return result


class Calculator:
    """A simple calculator for demonstration."""
    
    @staticmethod
    def add(a: float, b: float) -> float:
        time.sleep(random.uniform(0.001, 0.01))
        return a + b
    
    @staticmethod
    def subtract(a: float, b: float) -> float:
        time.sleep(random.uniform(0.001, 0.01))
        return a - b
    
    @staticmethod
    def multiply(a: float, b: float) -> float:
        time.sleep(random.uniform(0.001, 0.01))
        return a * b
    
    @staticmethod
    def divide(a: float, b: float) -> float:
        time.sleep(random.uniform(0.001, 0.01))
        if b == 0:
            raise ZeroDivisionError("Cannot divide by zero")
        return a / b
    
    @staticmethod
    def fibonacci(n: int) -> int:
        """Calculate fibonacci number (intentionally slow for observability demo)."""
        if n < 0:
            raise ValueError("n must be non-negative")
        if n <= 1:
            return n
        
        a, b = 0, 1
        for _ in range(2, n + 1):
            a, b = b, a + b
            time.sleep(0.001)  # Small delay to simulate work
        return b


class DataFetcher:
    """Simulates fetching data from external sources."""
    
    def __init__(self, source_name: str):
        self.source_name = source_name
        self.request_count = 0
    
    def fetch(self, query: str) -> Dict[str, Any]:
        """Simulate fetching data with network latency."""
        self.request_count += 1
        
        # Simulate network latency
        latency = random.uniform(0.05, 0.2)
        time.sleep(latency)
        
        # Simulate occasional timeouts (5% chance)
        if random.random() < 0.05:
            raise TimeoutError(f"Request to {self.source_name} timed out")
        
        # Generate fake response
        return {
            "source": self.source_name,
            "query": query,
            "request_id": self.request_count,
            "latency_ms": latency * 1000,
            "data": [random.randint(1, 100) for _ in range(10)],
            "timestamp": time.time()
        }


def run_sample_workflow():
    """Run a sample workflow demonstrating various operations."""
    print("Starting sample workflow...")
    
    # Initialize components
    processor = DataProcessor("main-processor")
    calculator = Calculator()
    fetcher = DataFetcher("api.example.com")
    
    # Step 1: Fetch some data
    print("Step 1: Fetching data...")
    try:
        data = fetcher.fetch("SELECT * FROM users")
        print(f"  Fetched {len(data['data'])} items")
    except TimeoutError as e:
        print(f"  Fetch failed: {e}")
        data = {"data": [1, 2, 3, 4, 5]}
    
    # Step 2: Process the data
    print("Step 2: Processing data...")
    result = processor.process_batch(data["data"])
    print(f"  Processed {result['successful']} items, {result['errors']} errors")
    
    # Step 3: Perform calculations
    print("Step 3: Running calculations...")
    calc_results = []
    for i in range(5):
        a, b = random.randint(1, 100), random.randint(1, 100)
        calc_results.append({
            "add": calculator.add(a, b),
            "subtract": calculator.subtract(a, b),
            "multiply": calculator.multiply(a, b),
            "divide": calculator.divide(a, max(b, 1))
        })
    print(f"  Completed {len(calc_results)} calculation sets")
    
    # Step 4: Compute fibonacci
    print("Step 4: Computing Fibonacci sequence...")
    fib_results = [calculator.fibonacci(i) for i in range(20)]
    print(f"  Computed Fibonacci up to F(19) = {fib_results[-1]}")
    
    print("Workflow complete!")
    
    return {
        "fetch_result": data,
        "process_result": result,
        "calc_results": calc_results,
        "fib_results": fib_results
    }


if __name__ == "__main__":
    result = run_sample_workflow()
    print(f"\nFinal result summary:")
    print(f"  - Items processed: {result['process_result']['successful']}")
    print(f"  - Errors: {result['process_result']['errors']}")
    print(f"  - Processing time: {result['process_result']['duration_ms']:.2f}ms")
