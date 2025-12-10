/**
 * Metrics Collector
 *
 * Collects job-level metrics from the GitHub Actions environment
 * following OpenTelemetry CI/CD Semantic Conventions:
 * https://opentelemetry.io/docs/specs/semconv/registry/attributes/cicd/
 */
import { JobMetrics } from '../types';
export declare function collectMetrics(token: string): Promise<JobMetrics>;
//# sourceMappingURL=metrics.d.ts.map