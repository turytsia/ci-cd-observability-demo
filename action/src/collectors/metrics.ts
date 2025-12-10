/**
 * Metrics Collector
 * 
 * Collects job-level metrics from the GitHub Actions environment
 * following OpenTelemetry CI/CD Semantic Conventions:
 * https://opentelemetry.io/docs/specs/semconv/registry/attributes/cicd/
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { JobMetrics } from '../types';

type WorkflowJob = {
  name: string;
  started_at: string | null;
  status: string;
  steps?: Array<{ status: string }>;
};

export async function collectMetrics(token: string): Promise<JobMetrics> {
  const metrics: JobMetrics = {};
  
  // Try to get metrics from the GitHub API
  if (token) {
    try {
      const octokit = github.getOctokit(token);
      const { owner, repo } = github.context.repo;
      const runId = github.context.runId;
      
      // Get workflow run details
      const { data: run } = await octokit.rest.actions.getWorkflowRun({
        owner,
        repo,
        run_id: runId,
      });
      
      // cicd.pipeline.run.duration - Total pipeline run duration
      if (run.created_at && run.updated_at) {
        const created = new Date(run.created_at).getTime();
        const updated = new Date(run.updated_at).getTime();
        metrics['cicd.pipeline.run.duration'] = (updated - created) / 1000;
      }
      
      // cicd.pipeline.run.queue_time - Time spent in queue before execution
      if (run.created_at && run.run_started_at) {
        const created = new Date(run.created_at).getTime();
        const started = new Date(run.run_started_at).getTime();
        metrics['cicd.pipeline.run.queue_time'] = (started - created) / 1000;
      }
      
      // Get job details for task-level metrics
      const { data: jobs } = await octokit.rest.actions.listJobsForWorkflowRun({
        owner,
        repo,
        run_id: runId,
      });
      
      // Find current job and get cicd.pipeline.task.run.duration
      const currentJob = jobs.jobs.find((j: WorkflowJob) => j.name === github.context.job);
      if (currentJob && currentJob.started_at) {
        const jobStart = new Date(currentJob.started_at).getTime();
        metrics['cicd.pipeline.task.run.duration'] = (Date.now() - jobStart) / 1000;
      }
      
    } catch (error) {
      core.debug(`Failed to fetch metrics from API: ${error}`);
    }
  }
  
  // Add worker info using semantic conventions
  metrics['cicd.worker.name'] = process.env.RUNNER_NAME || 'unknown';
  metrics['cicd.worker.os'] = process.env.RUNNER_OS || 'unknown';
  metrics['cicd.worker.arch'] = process.env.RUNNER_ARCH || 'unknown';
  
  return metrics;
}
