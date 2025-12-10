/**
 * Metrics Collector
 *
 * Collects CI/CD metrics following OpenTelemetry semantic conventions.
 * https://opentelemetry.io/docs/specs/semconv/attributes/cicd/
 */

import * as github from '@actions/github';
import type {
  CICDMetrics,
  PipelineAttributes,
  WorkerAttributes,
  TaskAttributes,
  TaskMetrics,
  StepMetrics,
  GitHubWorkflowRun,
  GitHubJob,
  GitHubStep,
  TaskType,
  PipelineRunState,
  PipelineResult,
} from '../types';

/**
 * Determines the task type based on job name
 */
function inferTaskType(jobName: string): TaskType {
  const name = jobName.toLowerCase();

  if (name.includes('lint') || name.includes('analysis') || name.includes('format')) {
    return 'lint';
  }
  if (name.includes('test') || name.includes('spec')) {
    return 'test';
  }
  if (name.includes('build') || name.includes('compile') || name.includes('package')) {
    return 'build';
  }
  if (name.includes('deploy') || name.includes('release') || name.includes('publish')) {
    return 'deploy';
  }
  if (name.includes('notify') || name.includes('alert') || name.includes('slack')) {
    return 'notify';
  }

  return 'other';
}

/**
 * Converts GitHub status to normalized status
 */
function normalizeStatus(
  status: string,
  conclusion: string | null
): TaskMetrics['status'] {
  if (status === 'completed') {
    switch (conclusion) {
      case 'success':
        return 'success';
      case 'failure':
        return 'failure';
      case 'cancelled':
        return 'cancelled';
      case 'skipped':
        return 'skipped';
      default:
        return 'failure';
    }
  }

  if (status === 'in_progress') {
    return 'in_progress';
  }

  return 'queued';
}

/**
 * Calculates duration in milliseconds between two ISO timestamps
 */
function calculateDuration(
  startedAt: string | null,
  completedAt: string | null
): number | undefined {
  if (!startedAt || !completedAt) {
    return undefined;
  }

  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();

  return end - start;
}

/**
 * Determines the current pipeline run state
 */
function determinePipelineState(
  status: string,
  jobs: GitHubJob[]
): PipelineRunState {
  if (status === 'queued' || status === 'waiting') {
    return 'pending';
  }

  const hasInProgress = jobs.some((job) => job.status === 'in_progress');
  if (hasInProgress) {
    return 'executing';
  }

  return 'finalizing';
}

/**
 * Converts GitHub step to StepMetrics
 */
function convertStep(step: GitHubStep): StepMetrics {
  return {
    name: step.name,
    number: step.number,
    status: normalizeStatus(step.status, step.conclusion) as StepMetrics['status'],
    duration_ms: calculateDuration(step.started_at, step.completed_at),
    started_at: step.started_at || undefined,
    completed_at: step.completed_at || undefined,
  };
}

/**
 * Converts GitHub job to TaskMetrics
 */
function convertJob(job: GitHubJob, runUrl: string): TaskMetrics {
  const taskAttributes: TaskAttributes = {
    'cicd.pipeline.task.name': job.name,
    'cicd.pipeline.task.run.id': job.id.toString(),
    'cicd.pipeline.task.type': inferTaskType(job.name),
    'cicd.pipeline.task.run.url.full': job.html_url,
  };

  const steps: StepMetrics[] = (job.steps || []).map(convertStep);

  return {
    attributes: taskAttributes,
    status: normalizeStatus(job.status, job.conclusion),
    duration_ms: calculateDuration(job.started_at, job.completed_at),
    started_at: job.started_at || undefined,
    completed_at: job.completed_at || undefined,
    steps,
  };
}

/**
 * Collects CI/CD metrics from GitHub Actions
 */
export async function collectMetrics(token: string): Promise<CICDMetrics> {
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

  // Convert jobs to task metrics
  const tasks = jobs.map((job) => convertJob(job, run.html_url));

  // Calculate task counts by status
  const successCount = tasks.filter((t) => t.status === 'success').length;
  const failureCount = tasks.filter((t) => t.status === 'failure').length;
  const skippedCount = tasks.filter((t) => t.status === 'skipped').length;
  const cancelledCount = tasks.filter((t) => t.status === 'cancelled').length;
  const inProgressCount = tasks.filter((t) => t.status === 'in_progress').length;

  // Determine pipeline result (OTel: cicd.pipeline.result)
  const determinePipelineResult = (): PipelineResult | undefined => {
    if (run.status !== 'completed') {
      return undefined; // Result not yet determined
    }
    switch (run.conclusion) {
      case 'success':
        return 'success';
      case 'failure':
        return 'failure';
      case 'cancelled':
        return 'cancellation';
      case 'timed_out':
        return 'timeout';
      case 'skipped':
        return 'skip';
      case 'action_required':
      case 'neutral':
      case 'stale':
      default:
        return run.conclusion ? 'error' : undefined;
    }
  };

  // Collect error types for failed tasks (OTel: cicd.pipeline.run.errors)
  const collectErrors = (): Array<{ 'error.type': string; count: number }> => {
    const errorMap = new Map<string, number>();
    
    for (const task of tasks) {
      if (task.status === 'failure') {
        // Classify error by task type
        const errorType = `${task.attributes['cicd.pipeline.task.type']}_failure`;
        errorMap.set(errorType, (errorMap.get(errorType) || 0) + 1);
      }
      if (task.status === 'cancelled') {
        errorMap.set('cancellation', (errorMap.get('cancellation') || 0) + 1);
      }
    }

    return Array.from(errorMap.entries()).map(([type, count]) => ({
      'error.type': type,
      count,
    }));
  };

  // Build pipeline attributes
  const pipelineAttributes: PipelineAttributes = {
    'cicd.pipeline.name': run.name || github.context.workflow,
    'cicd.pipeline.run.id': runId.toString(),
    'cicd.pipeline.run.url.full': run.html_url,
    'cicd.pipeline.run.number': run.run_number,
    'cicd.pipeline.run.state': determinePipelineState(run.status, jobs),
    'cicd.pipeline.run.attempt': run.run_attempt,
    'cicd.pipeline.trigger.event': run.event,
    'cicd.pipeline.trigger.ref': run.head_branch || github.context.ref,
    'cicd.pipeline.trigger.sha': run.head_sha,
    'cicd.pipeline.result': determinePipelineResult(),
  };

  // Build worker attributes from current runner
  const workerAttributes: WorkerAttributes = {
    'cicd.worker.name': process.env.RUNNER_NAME,
    'cicd.worker.os': process.env.RUNNER_OS?.toLowerCase(),
    'cicd.worker.arch': process.env.RUNNER_ARCH?.toLowerCase(),
  };

  // Calculate pipeline duration
  const pipelineDuration = calculateDuration(run.run_started_at, run.updated_at);

  // Calculate queue time (time between creation and start)
  const queueTime = calculateDuration(run.created_at, run.run_started_at);

  const metrics: CICDMetrics = {
    pipeline: pipelineAttributes,
    worker: workerAttributes,
    'cicd.pipeline.run.duration_ms': pipelineDuration,
    'cicd.pipeline.run.queue_time_ms': queueTime,
    'cicd.pipeline.task.count': tasks.length,
    'cicd.pipeline.task.success_count': successCount,
    'cicd.pipeline.task.failure_count': failureCount,
    'cicd.pipeline.task.skipped_count': skippedCount,
    'cicd.pipeline.task.cancelled_count': cancelledCount,
    'cicd.pipeline.task.in_progress_count': inProgressCount,
    'cicd.pipeline.run.errors': collectErrors(),
    tasks,
    collected_at: new Date().toISOString(),
  };

  return metrics;
}
