/**
 * CI/CD Observability Types
 *
 * Based on OpenTelemetry CI/CD Semantic Conventions:
 * https://opentelemetry.io/docs/specs/semconv/attributes/cicd/
 */
export type PipelineRunState = 'pending' | 'executing' | 'finalizing';
export type PipelineResult = 'success' | 'failure' | 'cancellation' | 'error' | 'skip' | 'timeout';
export type TaskType = 'build' | 'test' | 'deploy' | 'lint' | 'notify' | 'other';
/**
 * Pipeline-level attributes following OTel conventions
 */
export interface PipelineAttributes {
    /** The human readable name of the pipeline (cicd.pipeline.name) */
    'cicd.pipeline.name': string;
    /** The unique identifier of the pipeline run (cicd.pipeline.run.id) */
    'cicd.pipeline.run.id': string;
    /** The full URL of the pipeline run (cicd.pipeline.run.url.full) */
    'cicd.pipeline.run.url.full': string;
    /** The run number of the pipeline (cicd.pipeline.run.number) */
    'cicd.pipeline.run.number': number;
    /** The current state of the pipeline run (cicd.pipeline.run.state) */
    'cicd.pipeline.run.state': PipelineRunState;
    /** The pipeline run attempt number (cicd.pipeline.run.attempt) */
    'cicd.pipeline.run.attempt': number;
    /** The event that triggered the pipeline (cicd.pipeline.trigger.event) */
    'cicd.pipeline.trigger.event': string;
    /** The ref (branch/tag) that triggered the pipeline (cicd.pipeline.trigger.ref) */
    'cicd.pipeline.trigger.ref': string;
    /** The commit SHA that triggered the pipeline (cicd.pipeline.trigger.sha) */
    'cicd.pipeline.trigger.sha': string;
    /** The result of the pipeline run (cicd.pipeline.result) - conditionally required */
    'cicd.pipeline.result'?: PipelineResult;
}
/**
 * Task (Job) attributes following OTel conventions
 */
export interface TaskAttributes {
    /** The human readable name of the task (cicd.pipeline.task.name) */
    'cicd.pipeline.task.name': string;
    /** The unique identifier of the task run (cicd.pipeline.task.run.id) */
    'cicd.pipeline.task.run.id': string;
    /** The type of the task (cicd.pipeline.task.type) */
    'cicd.pipeline.task.type': TaskType;
    /** The URL of the task run (cicd.pipeline.task.run.url.full) */
    'cicd.pipeline.task.run.url.full'?: string;
}
/**
 * Worker (Runner) attributes following OTel conventions
 */
export interface WorkerAttributes {
    /** The name of the CI/CD worker (cicd.worker.name) */
    'cicd.worker.name'?: string;
    /** The operating system of the worker (cicd.worker.os) */
    'cicd.worker.os'?: string;
    /** The architecture of the worker (cicd.worker.arch) */
    'cicd.worker.arch'?: string;
}
/**
 * Metric data point with OTel-compatible structure
 */
export interface MetricDataPoint {
    /** Metric name */
    name: string;
    /** Metric description */
    description: string;
    /** Metric unit */
    unit: string;
    /** Metric value */
    value: number;
    /** Unix timestamp in milliseconds */
    timestamp: number;
    /** OTel-compatible attributes */
    attributes: Record<string, string | number | boolean>;
}
/**
 * Collection of CI/CD metrics
 */
export interface CICDMetrics {
    /** Pipeline-level attributes */
    pipeline: PipelineAttributes;
    /** Worker/runner attributes */
    worker: WorkerAttributes;
    /** Duration of the pipeline run in milliseconds (cicd.pipeline.run.duration) */
    'cicd.pipeline.run.duration_ms'?: number;
    /** Queue time before pipeline started in milliseconds */
    'cicd.pipeline.run.queue_time_ms'?: number;
    /** Total number of tasks in the pipeline */
    'cicd.pipeline.task.count': number;
    /** Number of successful tasks */
    'cicd.pipeline.task.success_count': number;
    /** Number of failed tasks */
    'cicd.pipeline.task.failure_count': number;
    /** Number of skipped tasks */
    'cicd.pipeline.task.skipped_count': number;
    /** Number of cancelled tasks */
    'cicd.pipeline.task.cancelled_count': number;
    /** Number of tasks in progress */
    'cicd.pipeline.task.in_progress_count': number;
    /** Error types encountered (for cicd.pipeline.run.errors metric) */
    'cicd.pipeline.run.errors': Array<{
        'error.type': string;
        count: number;
    }>;
    /** Individual task metrics */
    tasks: TaskMetrics[];
    /** Timestamp when metrics were collected */
    collected_at: string;
}
/**
 * Task-level metrics
 */
export interface TaskMetrics {
    /** Task attributes */
    attributes: TaskAttributes;
    /** Task status */
    status: 'success' | 'failure' | 'cancelled' | 'skipped' | 'in_progress' | 'queued';
    /** Duration in milliseconds */
    duration_ms?: number;
    /** Start time (ISO 8601) */
    started_at?: string;
    /** End time (ISO 8601) */
    completed_at?: string;
    /** Step metrics within this task */
    steps: StepMetrics[];
}
/**
 * Step-level metrics (within a task/job)
 */
export interface StepMetrics {
    /** Step name */
    name: string;
    /** Step number (1-indexed) */
    number: number;
    /** Step status */
    status: 'success' | 'failure' | 'skipped' | 'in_progress';
    /** Duration in milliseconds */
    duration_ms?: number;
    /** Start time (ISO 8601) */
    started_at?: string;
    /** End time (ISO 8601) */
    completed_at?: string;
}
/**
 * Span representing a unit of work (OTel-compatible structure)
 */
export interface Span {
    /** Unique span identifier */
    span_id: string;
    /** Trace identifier (shared across all spans in a trace) */
    trace_id: string;
    /** Parent span ID (undefined for root spans) */
    parent_span_id?: string;
    /** Span name */
    name: string;
    /** Span kind */
    kind: 'internal' | 'server' | 'client' | 'producer' | 'consumer';
    /** Start time in Unix nanoseconds */
    start_time_unix_nano: number;
    /** End time in Unix nanoseconds */
    end_time_unix_nano?: number;
    /** Duration in milliseconds (computed) */
    duration_ms?: number;
    /** Span status */
    status: {
        code: 'unset' | 'ok' | 'error';
        message?: string;
    };
    /** OTel-compatible attributes */
    attributes: Record<string, string | number | boolean>;
}
/**
 * Collection of traces for a pipeline run
 */
export interface CICDTraces {
    /** Trace identifier (same as pipeline run ID) */
    trace_id: string;
    /** Root span (pipeline) */
    root_span: Span;
    /** All spans in the trace */
    spans: Span[];
    /** Timestamp when traces were collected */
    collected_at: string;
}
/**
 * GitHub workflow run from API
 */
export interface GitHubWorkflowRun {
    id: number;
    name: string;
    run_number: number;
    run_attempt: number;
    event: string;
    status: string;
    conclusion: string | null;
    html_url: string;
    head_sha: string;
    head_branch: string;
    created_at: string;
    updated_at: string;
    run_started_at: string;
}
/**
 * GitHub job from API
 */
export interface GitHubJob {
    id: number;
    run_id: number;
    name: string;
    status: string;
    conclusion: string | null;
    started_at: string | null;
    completed_at: string | null;
    html_url: string;
    runner_name: string | null;
    runner_group_name: string | null;
    labels: string[];
    steps?: GitHubStep[];
}
/**
 * GitHub step from API
 */
export interface GitHubStep {
    name: string;
    number: number;
    status: string;
    conclusion: string | null;
    started_at: string | null;
    completed_at: string | null;
}
/**
 * Complete observability data output
 */
export interface ObservabilityData {
    /** Schema version for future compatibility */
    schema_version: '1.0.0';
    /** Collected metrics (if enabled) */
    metrics?: CICDMetrics;
    /** Collected traces (if enabled) */
    traces?: CICDTraces;
    /** Collection metadata */
    metadata: {
        collected_at: string;
        collector_version: string;
        github_action_ref: string;
    };
}
/**
 * Action input configuration
 */
export interface ActionConfig {
    /** GitHub token */
    token: string;
    /** Webhook URL for sending data */
    webhookUrl?: string;
    /** Webhook secret for signing */
    webhookSecret?: string;
    /** Enable metrics collection */
    collectMetrics: boolean;
    /** Enable traces collection */
    collectTraces: boolean;
    /** Enable logs collection */
    collectLogs: boolean;
    /** SolarWinds APM Service Key */
    swoServiceKey?: string;
    /** SolarWinds APM Collector endpoint */
    swoCollector?: string;
}
