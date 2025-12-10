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
  // Pipeline identification
  'cicd.pipeline.name': string;                    // The human readable name of the pipeline
  'cicd.pipeline.run.id': string;                  // The unique identifier of a pipeline run
  'cicd.pipeline.run.url.full'?: string;           // The URL of the pipeline run
  'cicd.pipeline.run.state'?: 'pending' | 'executing' | 'finalizing';
  'cicd.pipeline.result'?: 'success' | 'failure' | 'cancellation' | 'error' | 'skip' | 'timeout';
  
  // Task (job/step) attributes
  'cicd.pipeline.task.name'?: string;              // The human readable name of a task
  'cicd.pipeline.task.run.id'?: string;            // The unique identifier of a task run
  'cicd.pipeline.task.run.url.full'?: string;      // The URL of the pipeline task run
  'cicd.pipeline.task.run.result'?: 'success' | 'failure' | 'cancellation' | 'error' | 'skip' | 'timeout';
  'cicd.pipeline.task.type'?: 'build' | 'test' | 'deploy' | string;
  
  // Worker attributes
  'cicd.worker.name'?: string;                     // The name of a worker (runner)
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
  // Duration metrics (in seconds)
  'cicd.pipeline.run.duration'?: number;           // Total pipeline run duration
  'cicd.pipeline.run.queue_time'?: number;         // Time spent in queue before execution
  'cicd.pipeline.task.run.duration'?: number;      // Current task/job duration
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
