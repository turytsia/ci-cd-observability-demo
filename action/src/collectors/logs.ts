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
  rawArchive?: Buffer;
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
 */
export async function collectLogs(token: string): Promise<WorkflowLogs | null> {
  try {
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;
    const runId = github.context.runId;
    const runAttempt = parseInt(process.env.GITHUB_RUN_ATTEMPT || '1', 10);

    core.info(`📜 Fetching logs for run ${runId} (attempt ${runAttempt})...`);

    // Get the logs archive URL
    // The API returns a 302 redirect to the actual download URL
    const response = await octokit.rest.actions.downloadWorkflowRunLogs({
      owner,
      repo,
      run_id: runId,
    });

    // The response data is the archive content (ArrayBuffer)
    const archiveBuffer = Buffer.from(response.data as ArrayBuffer);
    
    core.info(`   Downloaded ${(archiveBuffer.length / 1024).toFixed(1)} KB of logs`);

    // Extract files from zip
    const files = await extractTextFromZip(archiveBuffer);
    
    // Parse job logs from extracted files
    // GitHub log files are named like: "Job Name/Step Name.txt"
    const jobLogs: JobLogs[] = [];
    const jobContents = new Map<string, string[]>();
    
    for (const [fileName, content] of files) {
      // Extract job name from path (first directory)
      const parts = fileName.split('/');
      if (parts.length >= 1) {
        const jobName = parts[0];
        if (!jobContents.has(jobName)) {
          jobContents.set(jobName, []);
        }
        jobContents.get(jobName)!.push(`=== ${fileName} ===\n${content}`);
      }
    }

    // Convert to JobLogs array
    let jobIndex = 0;
    for (const [jobName, contents] of jobContents) {
      jobLogs.push({
        jobId: jobIndex++,
        jobName,
        logs: contents.join('\n\n'),
      });
    }

    core.info(`   Extracted logs for ${jobLogs.length} jobs`);

    return {
      runId,
      runAttempt,
      jobs: jobLogs,
      rawArchive: archiveBuffer,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    // Check if it's a 404 - logs might not be available yet
    if (message.includes('404') || message.includes('Not Found')) {
      core.warning('Logs not available yet (workflow still running or logs expired)');
      return null;
    }
    
    core.warning(`Failed to collect logs: ${message}`);
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
