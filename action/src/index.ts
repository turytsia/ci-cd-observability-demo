/**
 * CI/CD Observability Action
 *
 * Main entry point for the GitHub Action.
 * Collects CI/CD metrics and traces following OpenTelemetry semantic conventions.
 */

import * as core from '@actions/core';
import { collectMetrics, collectTraces, collectLogs, formatLogsForSummary } from './collectors';
import { writeSummary, generateBriefSummary, sendWebhook } from './output';
import {
  exportTracesToSolarWinds,
  exportMetricsToSolarWinds,
  initializeSolarWinds,
  flushSolarWinds,
  type SolarWindsConfig,
} from './exporters';
import type { ActionConfig, ObservabilityData } from './types';

/**
 * Parse boolean input more flexibly
 */
function parseBooleanInput(name: string, defaultValue: boolean = true): boolean {
  const value = core.getInput(name);
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parses action inputs into configuration
 */
function getConfig(): ActionConfig {
  return {
    token: core.getInput('token', { required: true }),
    webhookUrl: core.getInput('webhook-url') || undefined,
    webhookSecret: core.getInput('webhook-secret') || undefined,
    collectMetrics: parseBooleanInput('collect-metrics', true),
    collectTraces: parseBooleanInput('collect-traces', true),
    collectLogs: parseBooleanInput('collect-logs', false),
    swoServiceKey: core.getInput('swo-service-key') || undefined,
    swoCollector: core.getInput('swo-collector') || undefined,
  };
}

/**
 * Main action runner
 */
async function run(): Promise<void> {
  try {
    core.info('🔭 Starting CI/CD Observability Collection');

    const config = getConfig();

    // Validate at least one collector is enabled
    if (!config.collectMetrics && !config.collectTraces && !config.collectLogs) {
      core.warning('No collectors enabled. Enable at least one of: collect-metrics, collect-traces, collect-logs');
      return;
    }

    // Initialize SolarWinds if configured (before collecting data)
    let swoInitialized = false;
    if (config.swoServiceKey && config.swoCollector) {
      const swoConfig: SolarWindsConfig = {
        serviceKey: config.swoServiceKey,
        collector: config.swoCollector,
      };
      swoInitialized = await initializeSolarWinds(swoConfig);
    }

    // Collect data
    let metrics = null;
    let traces = null;
    let logs = null;

    if (config.collectMetrics) {
      core.info('📊 Collecting metrics...');
      metrics = await collectMetrics(config.token);
      core.info(`   ✓ Collected metrics for ${metrics['cicd.pipeline.task.count']} tasks`);
    }

    if (config.collectTraces) {
      core.info('🔍 Collecting traces...');
      traces = await collectTraces(config.token);
      core.info(`   ✓ Collected ${traces.spans.length} spans`);
    }

    if (config.collectLogs) {
      core.info('📜 Collecting logs...');
      try {
        logs = await collectLogs(config.token);
        if (logs) {
          core.info(`   ✓ Collected logs for ${logs.jobs.length} jobs`);
        } else {
          core.info('   ⚠️ No logs returned (jobs may still be running)');
        }
      } catch (logError) {
        core.warning(`   Failed to collect logs: ${logError instanceof Error ? logError.message : String(logError)}`);
      }
    }

    // Build observability data output
    const observabilityData: ObservabilityData = {
      schema_version: '1.0.0',
      metrics: metrics || undefined,
      traces: traces || undefined,
      metadata: {
        collected_at: new Date().toISOString(),
        collector_version: '1.0.0',
        github_action_ref: process.env.GITHUB_ACTION_REF || 'unknown',
      },
    };

    // Set action outputs
    if (metrics) {
      core.setOutput('metrics-json', JSON.stringify(metrics));
    }
    if (traces) {
      core.setOutput('traces-json', JSON.stringify(traces));
    }
    if (logs) {
      core.setOutput('logs-json', JSON.stringify({
        runId: logs.runId,
        runAttempt: logs.runAttempt,
        jobCount: logs.jobs.length,
        jobs: logs.jobs.map(j => ({ jobId: j.jobId, jobName: j.jobName, logLines: j.logs.split('\n').length })),
      }));
    }

    const briefSummary = generateBriefSummary(metrics, traces);
    core.setOutput('summary', briefSummary);

    // Write to GitHub job summary
    core.info('📝 Writing job summary...');
    await writeSummary(metrics, traces);

    // Write logs to job summary if collected
    if (logs) {
      core.info('📜 Writing logs to job summary...');
      const logsSummary = formatLogsForSummary(logs, 50);
      await core.summary.addRaw(logsSummary).write();
    }

    // Send to webhook if configured
    if (config.webhookUrl) {
      core.info('📤 Sending to webhook...');
      const sent = await sendWebhook(observabilityData, config.webhookUrl, config.webhookSecret);
      if (sent) {
        core.info('   ✓ Webhook sent successfully');
      }
    }

    // Export to SolarWinds if configured
    if (config.swoServiceKey && config.swoCollector) {
      core.info('☀️ Exporting to SolarWinds Observability...');
      
      const swoConfig: SolarWindsConfig = {
        serviceKey: config.swoServiceKey,
        collector: config.swoCollector,
      };

      if (traces) {
        await exportTracesToSolarWinds(traces, swoConfig);
      }
      
      if (metrics) {
        await exportMetricsToSolarWinds(metrics, swoConfig);
      }

      // Flush data to ensure it's sent before action exits
      await flushSolarWinds();
    }

    core.info('');
    core.info('✅ CI/CD Observability Collection Complete');
    core.info(`   ${briefSummary}`);

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(`Action failed: ${message}`);
  }
}

// Run the action
run();
