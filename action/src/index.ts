/**
 * CI/CD Observability GitHub Action
 * 
 * Main entry point for the action. Collects metrics, logs, and traces
 * from CI/CD workflows and generates reports.
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { collectMetrics } from './collectors/metrics';
import { collectTestResults } from './collectors/tests';
import { collectCoverage } from './collectors/coverage';
import { generateReports } from './reporters/report';
import { createCheckRun } from './reporters/check';
import { uploadArtifacts } from './reporters/artifact';
import { sendWebhook } from './reporters/webhook';
import { ObservabilityData } from './types';

async function run(): Promise<void> {
  const startTime = Date.now();
  
  try {
    core.info('🔍 Starting CI/CD Observability collection...');
    
    // Get inputs
    const token = core.getInput('token');
    const collectJobMetrics = core.getBooleanInput('collect-job-metrics');
    const collectTests = core.getBooleanInput('collect-test-results');
    const testResultsPath = core.getInput('test-results-path');
    const collectCov = core.getBooleanInput('collect-coverage');
    const coveragePath = core.getInput('coverage-path');
    const customMetricsInput = core.getInput('custom-metrics');
    const outputFormat = core.getInput('output-format') || 'all';
    const createCheck = core.getBooleanInput('create-check');
    const shouldUploadArtifact = core.getBooleanInput('upload-artifact');
    const artifactName = core.getInput('artifact-name');
    const webhookUrl = core.getInput('webhook-url');
    const webhookSecret = core.getInput('webhook-secret');
    
    // Initialize observability data
    const data: ObservabilityData = {
      metadata: {
        timestamp: new Date().toISOString(),
        repository: github.context.repo.owner + '/' + github.context.repo.repo,
        workflow: github.context.workflow,
        job: github.context.job,
        runId: github.context.runId,
        runNumber: github.context.runNumber,
        actor: github.context.actor,
        ref: github.context.ref,
        sha: github.context.sha,
        eventName: github.context.eventName,
      },
      metrics: {},
      testResults: null,
      coverage: null,
      customMetrics: {},
    };
    
    // Collect job metrics
    if (collectJobMetrics) {
      core.info('📊 Collecting job metrics...');
      data.metrics = await collectMetrics(token);
    }
    
    // Collect test results
    if (collectTests) {
      core.info('🧪 Collecting test results...');
      data.testResults = await collectTestResults(testResultsPath);
    }
    
    // Collect coverage
    if (collectCov) {
      core.info('📈 Collecting coverage data...');
      data.coverage = await collectCoverage(coveragePath);
    }
    
    // Parse custom metrics
    if (customMetricsInput && customMetricsInput !== '{}') {
      try {
        data.customMetrics = JSON.parse(customMetricsInput);
        core.info('📝 Added custom metrics');
      } catch (e) {
        core.warning(`Failed to parse custom metrics: ${e}`);
      }
    }
    
    // Calculate duration
    const duration = (Date.now() - startTime) / 1000;
    data.metrics.actionDuration = duration;
    
    // Generate reports (includes GitHub Job Summary)
    core.info('📄 Generating reports...');
    const { htmlPath, jsonPath } = await generateReports(data, outputFormat);
    const reportFiles: string[] = [];
    if (htmlPath) reportFiles.push(htmlPath);
    if (jsonPath) reportFiles.push(jsonPath);
    
    // Create check run
    if (createCheck && token) {
      core.info('✅ Creating check run...');
      await createCheckRun(token, data);
    }
    
    // Upload artifacts
    if (shouldUploadArtifact && reportFiles.length > 0) {
      core.info('📦 Uploading artifacts...');
      await uploadArtifacts(artifactName, reportFiles);
    }
    
    // Send webhook
    if (webhookUrl) {
      core.info('🔔 Sending webhook...');
      await sendWebhook(webhookUrl, data, webhookSecret);
    }
    
    // Set outputs
    core.setOutput('report-path', reportFiles.join(','));
    core.setOutput('metrics-json', JSON.stringify(data));
    core.setOutput('job-duration', duration.toFixed(2));
    
    if (data.testResults) {
      core.setOutput('total-tests', data.testResults.total);
      core.setOutput('passed-tests', data.testResults.passed);
      core.setOutput('failed-tests', data.testResults.failed);
    }
    
    if (data.coverage) {
      core.setOutput('coverage-percent', data.coverage.percentage.toFixed(1));
    }
    
    core.info(`✅ Observability collection complete in ${duration.toFixed(2)}s`);
    
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`Action failed: ${error.message}`);
    } else {
      core.setFailed('Action failed with unknown error');
    }
  }
}

run();
