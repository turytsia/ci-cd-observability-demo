/**
 * Metrics Collector
 *
 * Collects CI/CD metrics following OpenTelemetry semantic conventions.
 * https://opentelemetry.io/docs/specs/semconv/attributes/cicd/
 */
import type { CICDMetrics } from '../types';
/**
 * Collects CI/CD metrics from GitHub Actions
 */
export declare function collectMetrics(token: string): Promise<CICDMetrics>;
//# sourceMappingURL=metrics.d.ts.map