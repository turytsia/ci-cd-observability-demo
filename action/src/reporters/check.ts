/**
 * GitHub Check Run Reporter
 * 
 * Creates GitHub Check Runs with detailed annotations
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { ObservabilityData } from '../types';

/**
 * Create a GitHub Check Run with observability results
 */
export async function createCheckRun(
  token: string,
  data: ObservabilityData
): Promise<void> {
  if (!token) {
    core.warning('No GitHub token provided, skipping Check Run creation');
    return;
  }
  
  try {
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;
    
    // Determine overall status
    let conclusion: 'success' | 'failure' | 'neutral' = 'success';
    const annotations: Array<{
      path: string;
      start_line: number;
      end_line: number;
      annotation_level: 'notice' | 'warning' | 'failure';
      message: string;
      title: string;
    }> = [];
    
    // Check test results
    if (data.testResults && data.testResults.failed > 0) {
      conclusion = 'failure';
      
      // Add annotations for failed tests
      for (const suite of data.testResults.testSuites) {
        for (const test of suite.testCases) {
          if (test.status === 'failed' || test.status === 'error') {
            annotations.push({
              path: test.classname || suite.name,
              start_line: 1,
              end_line: 1,
              annotation_level: 'failure',
              message: test.message || `Test failed: ${test.name}`,
              title: `Failed: ${test.name}`,
            });
          }
        }
      }
    }
    
    // Build summary text
    const summaryLines: string[] = [];
    summaryLines.push('## CI/CD Observability Results\n');
    
    if (data.testResults) {
      const { total, passed, failed, skipped } = data.testResults;
      const icon = failed > 0 ? '❌' : '✅';
      summaryLines.push(`### ${icon} Test Results`);
      summaryLines.push(`- **${passed}/${total}** tests passed`);
      summaryLines.push(`- ${failed} failed, ${skipped} skipped`);
      summaryLines.push('');
    }
    
    if (data.coverage) {
      const { percentage } = data.coverage;
      const icon = percentage >= 80 ? '🟢' : percentage >= 60 ? '🟡' : '🔴';
      summaryLines.push(`### ${icon} Code Coverage`);
      summaryLines.push(`- **${percentage.toFixed(1)}%** line coverage`);
      summaryLines.push('');
    }
    
    if (data.metrics) {
      summaryLines.push('### ⏱️ Metrics');
      if (data.metrics.workflowDuration !== undefined) {
        summaryLines.push(`- Workflow Duration: ${data.metrics.workflowDuration.toFixed(1)}s`);
      }
      if (data.metrics.queueTime !== undefined) {
        summaryLines.push(`- Queue Time: ${data.metrics.queueTime.toFixed(1)}s`);
      }
    }
    
    // Create the check run
    await octokit.rest.checks.create({
      owner,
      repo,
      name: 'CI/CD Observability',
      head_sha: data.metadata.sha,
      status: 'completed',
      conclusion,
      output: {
        title: conclusion === 'success' 
          ? '✅ All checks passed' 
          : '❌ Some checks failed',
        summary: summaryLines.join('\n'),
        annotations: annotations.slice(0, 50), // GitHub limits to 50 annotations per request
      },
    });
    
    core.info(`Created Check Run with conclusion: ${conclusion}`);
  } catch (error) {
    core.warning(`Failed to create Check Run: ${error}`);
  }
}
