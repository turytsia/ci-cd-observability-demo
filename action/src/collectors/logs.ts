/**
 * Logs Collector
 *
 * Retrieves workflow run logs from the GitHub Actions API.
 * Downloads and extracts the logs archive for analysis.
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { Readable } from 'stream';

/**
 * Log entry for a single job
 */
export interface JobLogs {
  jobId: number;
  jobName: string;
  logs: string;
}

/**
 * Complete workflow logs
 */
export interface WorkflowLogs {
  runId: number;
  runAttempt: number;
  jobs: JobLogs[];
}

/**
 * Extracts text content from a zip archive buffer
 * Simple implementation that parses zip file structure
 */
async function extractTextFromZip(buffer: Buffer): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  
  // ZIP file structure:
  // Local file header signature = 0x04034b50 (PK\x03\x04)
  let offset = 0;
  
  while (offset < buffer.length - 4) {
    // Check for local file header signature
    const signature = buffer.readUInt32LE(offset);
    
    if (signature !== 0x04034b50) {
      // Not a local file header, might be central directory
      break;
    }
    
    // Parse local file header
    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraFieldLength = buffer.readUInt16LE(offset + 28);
    
    const fileNameStart = offset + 30;
    const fileName = buffer.toString('utf8', fileNameStart, fileNameStart + fileNameLength);
    
    const dataStart = fileNameStart + fileNameLength + extraFieldLength;
    const dataEnd = dataStart + compressedSize;
    
    // Only handle uncompressed (stored) files for simplicity
    // GitHub logs are typically stored uncompressed in the zip
    if (compressionMethod === 0 && !fileName.endsWith('/')) {
      const content = buffer.toString('utf8', dataStart, dataEnd);
      files.set(fileName, content);
    }
    
    offset = dataEnd;
  }
  
  return files;
}

/**
 * Collects workflow run logs from GitHub Actions API
 * Note: Logs for the current workflow run may not be fully available
 * while it's still executing. This function attempts to get logs
 * for completed jobs.
 */
export async function collectLogs(token: string): Promise<WorkflowLogs | null> {
  try {
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;
    const runId = github.context.runId;
    const runAttempt = parseInt(process.env.GITHUB_RUN_ATTEMPT || '1', 10);

    core.info(`📜 Fetching logs for run ${runId} (attempt ${runAttempt})...`);

    // First, try to get individual job logs for completed jobs
    // This is more reliable than downloading the full archive during execution
    const jobsResponse = await octokit.rest.actions.listJobsForWorkflowRun({
      owner,
      repo,
      run_id: runId,
      filter: 'latest',
    });

    const completedJobs = jobsResponse.data.jobs.filter(
      job => job.status === 'completed'
    );

    core.info(`   Found ${completedJobs.length} completed jobs out of ${jobsResponse.data.jobs.length} total`);

    if (completedJobs.length === 0) {
      core.info('   No completed jobs yet - logs will be available after jobs finish');
      return null;
    }

    // Fetch logs for each completed job
    const jobLogs: JobLogs[] = [];
    
    for (const job of completedJobs) {
      try {
        core.info(`   Fetching logs for job: ${job.name}...`);
        
        const logResponse = await octokit.rest.actions.downloadJobLogsForWorkflowRun({
          owner,
          repo,
          job_id: job.id,
        });

        // The response is the log content as string
        const logContent = typeof logResponse.data === 'string' 
          ? logResponse.data 
          : Buffer.from(logResponse.data as ArrayBuffer).toString('utf8');

        jobLogs.push({
          jobId: job.id,
          jobName: job.name,
          logs: logContent,
        });

        core.info(`     ✓ Got ${logContent.split('\n').length} lines`);
      } catch (jobError) {
        const jobMsg = jobError instanceof Error ? jobError.message : String(jobError);
        core.warning(`     Failed to get logs for ${job.name}: ${jobMsg}`);
      }
    }

    if (jobLogs.length === 0) {
      core.warning('   Could not retrieve any job logs');
      return null;
    }

    core.info(`   ✓ Collected logs for ${jobLogs.length} jobs`);

    return {
      runId,
      runAttempt,
      jobs: jobLogs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    // Check if it's a 404 - logs might not be available yet
    if (message.includes('404') || message.includes('Not Found')) {
      core.warning('Logs not available yet (workflow still running or logs expired)');
      return null;
    }
    
    core.warning(`Failed to collect logs: ${message}`);
    if (error instanceof Error && error.stack) {
      core.debug(error.stack);
    }
    return null;
  }
}

/**
 * Formats logs for display in GitHub Job Summary
 */
export function formatLogsForSummary(logs: WorkflowLogs, maxLinesPerJob: number = 100): string {
  const lines: string[] = [];
  
  lines.push(`## 📜 Workflow Run Logs`);
  lines.push('');
  lines.push(`**Run ID:** ${logs.runId} | **Attempt:** ${logs.runAttempt}`);
  lines.push('');

  for (const job of logs.jobs) {
    lines.push(`### ${job.jobName}`);
    lines.push('');
    lines.push('<details>');
    lines.push(`<summary>View logs (${job.logs.split('\n').length} lines)</summary>`);
    lines.push('');
    lines.push('```');
    
    // Truncate if too long
    const logLines = job.logs.split('\n');
    if (logLines.length > maxLinesPerJob) {
      lines.push(logLines.slice(0, maxLinesPerJob).join('\n'));
      lines.push(`\n... (truncated ${logLines.length - maxLinesPerJob} lines)`);
    } else {
      lines.push(job.logs);
    }
    
    lines.push('```');
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Gets logs for a specific job by ID
 */
export async function getJobLogs(token: string, jobId: number): Promise<string | null> {
  try {
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    const response = await octokit.rest.actions.downloadJobLogsForWorkflowRun({
      owner,
      repo,
      job_id: jobId,
    });

    // Response is the log content as string (redirected download)
    return response.data as unknown as string;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning(`Failed to get job logs: ${message}`);
    return null;
  }
}
