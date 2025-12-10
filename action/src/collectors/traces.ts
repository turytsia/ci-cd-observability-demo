/**
 * Traces Collector
 *
 * Collects CI/CD traces (spans) following OpenTelemetry semantic conventions.
 * Creates a trace hierarchy: Pipeline -> Jobs -> Steps
 */

import * as github from '@actions/github';
import type {
  CICDTraces,
  Span,
  GitHubWorkflowRun,
  GitHubJob,
  GitHubStep,
} from '../types';

/**
 * Generates a random hex string for span/trace IDs
 */
function generateId(length: number): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Generates a trace ID (32 hex chars)
 */
function generateTraceId(): string {
  return generateId(32);
}

/**
 * Generates a span ID (16 hex chars)
 */
function generateSpanId(): string {
  return generateId(16);
}

/**
 * Converts ISO timestamp to Unix nanoseconds
 */
function toUnixNano(isoTimestamp: string | null): number {
  if (!isoTimestamp) {
    return Date.now() * 1_000_000;
  }
  return new Date(isoTimestamp).getTime() * 1_000_000;
}

/**
 * Calculates duration in milliseconds
 */
function calculateDurationMs(
  startNano: number,
  endNano: number | undefined
): number | undefined {
  if (!endNano) return undefined;
  return Math.round((endNano - startNano) / 1_000_000);
}

/**
 * Determines span status from GitHub conclusion
 */
function getSpanStatus(conclusion: string | null): Span['status'] {
  if (!conclusion) {
    return { code: 'unset' };
  }

  switch (conclusion) {
    case 'success':
      return { code: 'ok' };
    case 'failure':
      return { code: 'error', message: 'Job/Step failed' };
    case 'cancelled':
      return { code: 'error', message: 'Cancelled' };
    case 'skipped':
      return { code: 'unset', message: 'Skipped' };
    default:
      return { code: 'unset' };
  }
}

/**
 * Creates a span for a pipeline step
 */
function createStepSpan(
  step: GitHubStep,
  traceId: string,
  parentSpanId: string,
  jobName: string
): Span {
  const spanId = generateSpanId();
  const startTime = toUnixNano(step.started_at);
  const endTime = step.completed_at ? toUnixNano(step.completed_at) : undefined;

  return {
    span_id: spanId,
    trace_id: traceId,
    parent_span_id: parentSpanId,
    name: step.name,
    kind: 'internal',
    start_time_unix_nano: startTime,
    end_time_unix_nano: endTime,
    duration_ms: calculateDurationMs(startTime, endTime),
    status: getSpanStatus(step.conclusion),
    attributes: {
      'cicd.pipeline.task.name': jobName,
      'cicd.step.name': step.name,
      'cicd.step.number': step.number,
      'cicd.step.status': step.status,
      'cicd.step.conclusion': step.conclusion || 'pending',
    },
  };
}

/**
 * Creates a span for a pipeline job (task)
 */
function createJobSpan(
  job: GitHubJob,
  traceId: string,
  parentSpanId: string
): { jobSpan: Span; stepSpans: Span[] } {
  const spanId = generateSpanId();
  const startTime = toUnixNano(job.started_at);
  const endTime = job.completed_at ? toUnixNano(job.completed_at) : undefined;

  // Determine task type from job name
  const jobNameLower = job.name.toLowerCase();
  let taskType = 'other';
  if (jobNameLower.includes('lint') || jobNameLower.includes('analysis')) {
    taskType = 'lint';
  } else if (jobNameLower.includes('test')) {
    taskType = 'test';
  } else if (jobNameLower.includes('build')) {
    taskType = 'build';
  } else if (jobNameLower.includes('deploy')) {
    taskType = 'deploy';
  } else if (jobNameLower.includes('notify')) {
    taskType = 'notify';
  }

  const jobSpan: Span = {
    span_id: spanId,
    trace_id: traceId,
    parent_span_id: parentSpanId,
    name: job.name,
    kind: 'internal',
    start_time_unix_nano: startTime,
    end_time_unix_nano: endTime,
    duration_ms: calculateDurationMs(startTime, endTime),
    status: getSpanStatus(job.conclusion),
    attributes: {
      'cicd.pipeline.task.name': job.name,
      'cicd.pipeline.task.run.id': job.id.toString(),
      'cicd.pipeline.task.type': taskType,
      'cicd.pipeline.task.status': job.status,
      'cicd.pipeline.task.conclusion': job.conclusion || 'pending',
      'cicd.pipeline.task.run.url.full': job.html_url,
      'cicd.worker.name': job.runner_name || 'unknown',
    },
  };

  // Create step spans
  const stepSpans = (job.steps || [])
    .filter((step) => step.started_at) // Only include steps that have started
    .map((step) => createStepSpan(step, traceId, spanId, job.name));

  return { jobSpan, stepSpans };
}

/**
 * Collects CI/CD traces from GitHub Actions
 */
export async function collectTraces(token: string): Promise<CICDTraces> {
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  const runId = github.context.runId;

  // Fetch workflow run details
  const { data: workflowRun } = await octokit.rest.actions.getWorkflowRun({
    owner,
    repo,
    run_id: runId,
  });

  // Fetch all jobs for this run
  const { data: jobsResponse } = await octokit.rest.actions.listJobsForWorkflowRun({
    owner,
    repo,
    run_id: runId,
    filter: 'latest',
  });

  const jobs = jobsResponse.jobs as GitHubJob[];
  const run = workflowRun as unknown as GitHubWorkflowRun;

  // Generate trace ID (consistent for entire pipeline)
  const traceId = generateTraceId();
  const rootSpanId = generateSpanId();

  // Calculate pipeline timing
  const pipelineStartTime = toUnixNano(run.run_started_at);
  const pipelineEndTime = run.status === 'completed'
    ? toUnixNano(run.updated_at)
    : undefined;

  // Create root span (pipeline)
  const rootSpan: Span = {
    span_id: rootSpanId,
    trace_id: traceId,
    parent_span_id: undefined,
    name: run.name || github.context.workflow,
    kind: 'server',
    start_time_unix_nano: pipelineStartTime,
    end_time_unix_nano: pipelineEndTime,
    duration_ms: calculateDurationMs(pipelineStartTime, pipelineEndTime),
    status: getSpanStatus(run.conclusion),
    attributes: {
      'cicd.pipeline.name': run.name || github.context.workflow,
      'cicd.pipeline.run.id': runId.toString(),
      'cicd.pipeline.run.number': run.run_number,
      'cicd.pipeline.run.attempt': run.run_attempt,
      'cicd.pipeline.run.url.full': run.html_url,
      'cicd.pipeline.trigger.event': run.event,
      'cicd.pipeline.trigger.ref': run.head_branch || github.context.ref,
      'cicd.pipeline.trigger.sha': run.head_sha,
      'cicd.pipeline.status': run.status,
      'cicd.pipeline.conclusion': run.conclusion || 'pending',
    },
  };

  // Collect all spans
  const allSpans: Span[] = [rootSpan];

  // Create job and step spans
  for (const job of jobs) {
    if (!job.started_at) continue; // Skip jobs that haven't started

    const { jobSpan, stepSpans } = createJobSpan(job, traceId, rootSpanId);
    allSpans.push(jobSpan);
    allSpans.push(...stepSpans);
  }

  // Sort spans by start time
  allSpans.sort((a, b) => a.start_time_unix_nano - b.start_time_unix_nano);

  const traces: CICDTraces = {
    trace_id: traceId,
    root_span: rootSpan,
    spans: allSpans,
    collected_at: new Date().toISOString(),
  };

  return traces;
}
