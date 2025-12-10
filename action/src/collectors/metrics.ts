/**
 * Metrics Collector
 * 
 * Collects job-level metrics from the GitHub Actions environment
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
  
  // Get job start time from environment
  const jobStartedAt = process.env.GITHUB_JOB_STARTED_AT;
  if (jobStartedAt) {
    const startTime = new Date(jobStartedAt).getTime();
    const now = Date.now();
    metrics.workflowDuration = (now - startTime) / 1000;
  }
  
  // Try to get more metrics from the API
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
      
      if (run.created_at && run.updated_at) {
        const created = new Date(run.created_at).getTime();
        const updated = new Date(run.updated_at).getTime();
        metrics.workflowDuration = (updated - created) / 1000;
      }
      
      // Calculate queue time if we have run_started_at
      if (run.created_at && run.run_started_at) {
        const created = new Date(run.created_at).getTime();
        const started = new Date(run.run_started_at).getTime();
        metrics.queueTime = (started - created) / 1000;
      }
      
      // Get job details
      const { data: jobs } = await octokit.rest.actions.listJobsForWorkflowRun({
        owner,
        repo,
        run_id: runId,
      });
      
      // Find current job
      const currentJob = jobs.jobs.find((j: WorkflowJob) => j.name === github.context.job);
      if (currentJob && currentJob.started_at) {
        const jobStart = new Date(currentJob.started_at).getTime();
        metrics.actionDuration = (Date.now() - jobStart) / 1000;
      }
      
    } catch (error) {
      core.debug(`Failed to fetch metrics from API: ${error}`);
    }
  }
  
  // Add runner info
  metrics.runnerOs = process.env.RUNNER_OS || 'unknown';
  metrics.runnerArch = process.env.RUNNER_ARCH || 'unknown';
  
  return metrics;
}
