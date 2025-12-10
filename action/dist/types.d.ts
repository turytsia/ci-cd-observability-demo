/**
 * Type definitions for CI/CD Observability Action
 *
 * Based on OpenTelemetry Semantic Conventions for CI/CD:
 * https://opentelemetry.io/docs/specs/semconv/registry/attributes/cicd/
 */
/**
 * CI/CD Pipeline Attributes (OpenTelemetry Semantic Conventions)
 */
export interface CICDPipelineAttributes {
    'cicd.pipeline.name': string;
    'cicd.pipeline.run.id': string;
    'cicd.pipeline.run.url.full'?: string;
    'cicd.pipeline.run.state'?: 'pending' | 'executing' | 'finalizing';
    'cicd.pipeline.result'?: 'success' | 'failure' | 'cancellation' | 'error' | 'skip' | 'timeout';
    'cicd.pipeline.task.name'?: string;
    'cicd.pipeline.task.run.id'?: string;
    'cicd.pipeline.task.run.url.full'?: string;
    'cicd.pipeline.task.run.result'?: 'success' | 'failure' | 'cancellation' | 'error' | 'skip' | 'timeout';
    'cicd.pipeline.task.type'?: 'build' | 'test' | 'deploy' | string;
    'cicd.worker.name'?: string;
    'cicd.worker.state'?: 'available' | 'busy' | 'offline';
}
/**
 * Extended metadata with semantic convention attributes
 */
export interface Metadata extends CICDPipelineAttributes {
    timestamp: string;
    repository: string;
    actor: string;
    ref: string;
    sha: string;
    eventName: string;
}
export interface JobMetrics {
    'cicd.pipeline.run.duration'?: number;
    'cicd.pipeline.run.queue_time'?: number;
    'cicd.pipeline.task.run.duration'?: number;
    [key: string]: number | string | undefined;
}
export interface TestResults {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    testSuites: TestSuite[];
}
export interface TestSuite {
    name: string;
    tests: number;
    failures: number;
    errors: number;
    skipped: number;
    time: number;
    testCases: TestCase[];
}
export interface TestCase {
    name: string;
    classname: string;
    time: number;
    status: 'passed' | 'failed' | 'skipped' | 'error';
    message?: string;
    stackTrace?: string;
}
export interface CoverageData {
    percentage: number;
    coveredLines: number;
    totalLines: number;
    coveredBranches?: number;
    totalBranches?: number;
    files: FileCoverage[];
}
export interface FileCoverage {
    path: string;
    percentage: number;
    coveredLines: number;
    totalLines: number;
}
export interface ObservabilityData {
    metadata: Metadata;
    metrics: JobMetrics;
    testResults: TestResults | null;
    coverage: CoverageData | null;
    customMetrics: Record<string, unknown>;
}
export interface WebhookPayload {
    event: string;
    timestamp: string;
    data: ObservabilityData;
    signature?: string;
}
