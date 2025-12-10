"""
Tests for the sample application.

These tests demonstrate how observability is integrated
into the test workflow.
"""

import pytest
import sys
import os
import time

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.app import DataProcessor, Calculator, DataFetcher


class TestCalculator:
    """Tests for the Calculator class."""
    
    def test_add(self):
        """Test addition."""
        calc = Calculator()
        assert calc.add(2, 3) == 5
        assert calc.add(-1, 1) == 0
        assert calc.add(0, 0) == 0
    
    def test_subtract(self):
        """Test subtraction."""
        calc = Calculator()
        assert calc.subtract(5, 3) == 2
        assert calc.subtract(3, 5) == -2
        assert calc.subtract(0, 0) == 0
    
    def test_multiply(self):
        """Test multiplication."""
        calc = Calculator()
        assert calc.multiply(3, 4) == 12
        assert calc.multiply(-2, 3) == -6
        assert calc.multiply(0, 100) == 0
    
    def test_divide(self):
        """Test division."""
        calc = Calculator()
        assert calc.divide(10, 2) == 5
        assert calc.divide(7, 2) == 3.5
        assert calc.divide(-10, 2) == -5
    
    def test_divide_by_zero(self):
        """Test division by zero raises error."""
        calc = Calculator()
        with pytest.raises(ZeroDivisionError):
            calc.divide(10, 0)
    
    def test_fibonacci(self):
        """Test fibonacci sequence."""
        calc = Calculator()
        assert calc.fibonacci(0) == 0
        assert calc.fibonacci(1) == 1
        assert calc.fibonacci(2) == 1
        assert calc.fibonacci(10) == 55
        assert calc.fibonacci(15) == 610
    
    def test_fibonacci_negative(self):
        """Test fibonacci with negative input."""
        calc = Calculator()
        with pytest.raises(ValueError):
            calc.fibonacci(-1)


class TestDataProcessor:
    """Tests for the DataProcessor class."""
    
    def test_init(self):
        """Test processor initialization."""
        processor = DataProcessor("test")
        assert processor.name == "test"
        assert processor.processed_count == 0
        assert processor.errors_count == 0
    
    def test_process_batch_numbers(self):
        """Test processing numeric data."""
        processor = DataProcessor("test")
        items = [1, 2, 3, 4, 5]
        result = processor.process_batch(items)
        
        assert result["processor"] == "test"
        assert result["total_items"] == 5
        assert result["successful"] + result["errors"] == 5
        assert result["duration_ms"] > 0
    
    def test_process_batch_strings(self):
        """Test processing string data."""
        processor = DataProcessor("test")
        items = ["hello", "world", "test"]
        result = processor.process_batch(items)
        
        assert result["total_items"] == 3
        assert len(result["results"]) == 3
    
    def test_process_batch_empty(self):
        """Test processing empty batch."""
        processor = DataProcessor("test")
        result = processor.process_batch([])
        
        assert result["total_items"] == 0
        assert result["successful"] == 0
        assert result["errors"] == 0


class TestDataFetcher:
    """Tests for the DataFetcher class."""
    
    def test_init(self):
        """Test fetcher initialization."""
        fetcher = DataFetcher("test.api.com")
        assert fetcher.source_name == "test.api.com"
        assert fetcher.request_count == 0
    
    def test_fetch(self):
        """Test basic fetch operation."""
        fetcher = DataFetcher("test.api.com")
        
        # May occasionally timeout, so we retry a few times
        result = None
        for _ in range(5):
            try:
                result = fetcher.fetch("SELECT * FROM test")
                break
            except TimeoutError:
                continue
        
        if result:
            assert result["source"] == "test.api.com"
            assert result["query"] == "SELECT * FROM test"
            assert "data" in result
            assert result["latency_ms"] > 0
    
    def test_request_count_increments(self):
        """Test that request count increments."""
        fetcher = DataFetcher("test.api.com")
        initial_count = fetcher.request_count
        
        # Try multiple fetches
        for _ in range(3):
            try:
                fetcher.fetch("test")
            except TimeoutError:
                pass
        
        assert fetcher.request_count > initial_count


class TestIntegration:
    """Integration tests for the full workflow."""
    
    def test_workflow_components_work_together(self):
        """Test that all components can work together."""
        # Create components
        processor = DataProcessor("integration-test")
        calculator = Calculator()
        fetcher = DataFetcher("integration.api.com")
        
        # Generate data using calculator
        data = [calculator.fibonacci(i) for i in range(10)]
        
        # Process the data
        result = processor.process_batch(data)
        
        assert result["total_items"] == 10
        assert result["processor"] == "integration-test"
    
    def test_error_handling_chain(self):
        """Test error handling across components."""
        calculator = Calculator()
        
        # Test error propagation
        errors = []
        
        try:
            calculator.divide(1, 0)
        except ZeroDivisionError:
            errors.append("division")
        
        try:
            calculator.fibonacci(-5)
        except ValueError:
            errors.append("fibonacci")
        
        assert len(errors) == 2
        assert "division" in errors
        assert "fibonacci" in errors


# Performance tests
class TestPerformance:
    """Performance-related tests."""
    
    def test_calculator_performance(self):
        """Test calculator operations are reasonably fast."""
        calc = Calculator()
        start = time.time()
        
        for _ in range(100):
            calc.add(10, 20)
            calc.multiply(5, 5)
        
        duration = time.time() - start
        # Should complete 200 operations in under 5 seconds
        assert duration < 5.0
    
    def test_fibonacci_performance(self):
        """Test fibonacci calculation performance."""
        calc = Calculator()
        start = time.time()
        
        # Calculate fibonacci for reasonable values
        for i in range(20):
            calc.fibonacci(i)
        
        duration = time.time() - start
        # Should complete in reasonable time
        assert duration < 10.0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
