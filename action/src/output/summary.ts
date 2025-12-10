/**
 * GitHub Summary Output
 *
 * Generates markdown output for GitHub Actions job summary
 */

import * as core from '@actions/core';
import type { CICDMetrics, CICDTraces, TaskMetrics, Span } from '../types';

/**
 * Formats duration in human-readable format
 */
function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return 'N/A';

  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }

  return `${seconds}s`;
}

/**
 * Gets status emoji
 */
function getStatusEmoji(status: string): string {
  switch (status) {
    case 'success':
    case 'ok':
      return '✅';
    case 'failure':
    case 'error':
      return '❌';
    case 'cancelled':
      return '🚫';
    case 'skipped':
      return '⏭️';
    case 'in_progress':
    case 'executing':
      return '🔄';
    case 'queued':
    case 'pending':
      return '⏳';
    default:
      return '⚪';
  }
}

/**
 * Generates metrics summary markdown
 */
function generateMetricsSummary(metrics: CICDMetrics): string {
  const lines: string[] = [];

  lines.push('## 📊 CI/CD Metrics');
  lines.push('');

  // Pipeline Overview
  lines.push('### Pipeline Overview');
  lines.push('');
  lines.push('| Attribute | Value |');
  lines.push('|-----------|-------|');
  lines.push(`| **Pipeline** | ${metrics.pipeline['cicd.pipeline.name']} |`);
  lines.push(`| **Run ID** | ${metrics.pipeline['cicd.pipeline.run.id']} |`);
  lines.push(`| **Run #** | ${metrics.pipeline['cicd.pipeline.run.number']} |`);
  lines.push(`| **Attempt** | ${metrics.pipeline['cicd.pipeline.run.attempt']} |`);
  lines.push(`| **State** | ${getStatusEmoji(metrics.pipeline['cicd.pipeline.run.state'])} ${metrics.pipeline['cicd.pipeline.run.state']} |`);
  if (metrics.pipeline['cicd.pipeline.result']) {
    lines.push(`| **Result** | ${getStatusEmoji(metrics.pipeline['cicd.pipeline.result'])} ${metrics.pipeline['cicd.pipeline.result']} |`);
  }
  lines.push(`| **Trigger** | ${metrics.pipeline['cicd.pipeline.trigger.event']} |`);
  lines.push(`| **Branch** | \`${metrics.pipeline['cicd.pipeline.trigger.ref']}\` |`);
  lines.push(`| **Commit** | \`${metrics.pipeline['cicd.pipeline.trigger.sha'].substring(0, 7)}\` |`);
  lines.push('');

  // Timing Metrics
  lines.push('### ⏱️ Timing');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| **Total Duration** | ${formatDuration(metrics['cicd.pipeline.run.duration_ms'])} |`);
  lines.push(`| **Queue Time** | ${formatDuration(metrics['cicd.pipeline.run.queue_time_ms'])} |`);
  lines.push('');

  // Task Summary
  lines.push('### 📋 Tasks Summary');
  lines.push('');
  lines.push('| Status | Count |');
  lines.push('|--------|-------|');
  lines.push(`| ✅ Success | ${metrics['cicd.pipeline.task.success_count']} |`);
  lines.push(`| ❌ Failed | ${metrics['cicd.pipeline.task.failure_count']} |`);
  lines.push(`| ⏭️ Skipped | ${metrics['cicd.pipeline.task.skipped_count']} |`);
  lines.push(`| 🚫 Cancelled | ${metrics['cicd.pipeline.task.cancelled_count']} |`);
  lines.push(`| 🔄 In Progress | ${metrics['cicd.pipeline.task.in_progress_count']} |`);
  lines.push(`| **Total** | ${metrics['cicd.pipeline.task.count']} |`);
  lines.push('');

  // Error Summary (if any)
  if (metrics['cicd.pipeline.run.errors'].length > 0) {
    lines.push('### ⚠️ Errors');
    lines.push('');
    lines.push('| Error Type | Count |');
    lines.push('|------------|-------|');
    for (const error of metrics['cicd.pipeline.run.errors']) {
      lines.push(`| ${error['error.type']} | ${error.count} |`);
    }
    lines.push('');
  }

  // Individual Tasks
  if (metrics.tasks.length > 0) {
    lines.push('### 📝 Task Details');
    lines.push('');
    lines.push('| Task | Type | Status | Duration |');
    lines.push('|------|------|--------|----------|');

    for (const task of metrics.tasks) {
      const name = task.attributes['cicd.pipeline.task.name'];
      const type = task.attributes['cicd.pipeline.task.type'];
      const status = `${getStatusEmoji(task.status)} ${task.status}`;
      const duration = formatDuration(task.duration_ms);
      lines.push(`| ${name} | ${type} | ${status} | ${duration} |`);
    }
    lines.push('');
  }

  // Worker Info
  if (metrics.worker['cicd.worker.name']) {
    lines.push('### 🖥️ Worker');
    lines.push('');
    lines.push('| Attribute | Value |');
    lines.push('|-----------|-------|');
    lines.push(`| **Name** | ${metrics.worker['cicd.worker.name']} |`);
    lines.push(`| **OS** | ${metrics.worker['cicd.worker.os'] || 'N/A'} |`);
    lines.push(`| **Arch** | ${metrics.worker['cicd.worker.arch'] || 'N/A'} |`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generates traces summary markdown
 */
function generateTracesSummary(traces: CICDTraces): string {
  const lines: string[] = [];

  lines.push('## 🔍 CI/CD Traces');
  lines.push('');

  // Trace Overview
  lines.push('### Trace Overview');
  lines.push('');
  lines.push(`**Trace ID:** \`${traces.trace_id}\``);
  lines.push('');
  lines.push(`**Total Spans:** ${traces.spans.length}`);
  lines.push('');

  // Build trace tree visualization
  lines.push('### 🌳 Trace Tree');
  lines.push('');
  lines.push('```');

  // Group spans by parent
  const rootSpan = traces.root_span;
  const jobSpans = traces.spans.filter(
    (s) => s.parent_span_id === rootSpan.span_id
  );

  // Root span (pipeline)
  const rootDuration = formatDuration(rootSpan.duration_ms);
  const rootStatus = getStatusEmoji(rootSpan.status.code);
  lines.push(`${rootStatus} ${rootSpan.name} (${rootDuration})`);

  // Job spans
  for (const jobSpan of jobSpans) {
    const jobDuration = formatDuration(jobSpan.duration_ms);
    const jobStatus = getStatusEmoji(jobSpan.status.code);
    lines.push(`├── ${jobStatus} ${jobSpan.name} (${jobDuration})`);

    // Step spans for this job
    const stepSpans = traces.spans.filter(
      (s) => s.parent_span_id === jobSpan.span_id
    );

    for (let i = 0; i < stepSpans.length; i++) {
      const stepSpan = stepSpans[i];
      const stepDuration = formatDuration(stepSpan.duration_ms);
      const stepStatus = getStatusEmoji(stepSpan.status.code);
      const isLast = i === stepSpans.length - 1;
      const prefix = isLast ? '│   └──' : '│   ├──';
      lines.push(`${prefix} ${stepStatus} ${stepSpan.name} (${stepDuration})`);
    }
  }

  lines.push('```');
  lines.push('');

  // Span Timeline Table
  lines.push('### ⏱️ Span Timeline');
  lines.push('');
  lines.push('| Span | Kind | Status | Duration |');
  lines.push('|------|------|--------|----------|');

  for (const span of traces.spans) {
    const status = `${getStatusEmoji(span.status.code)} ${span.status.code}`;
    const duration = formatDuration(span.duration_ms);
    const indent = span.parent_span_id ? (
      span.parent_span_id === rootSpan.span_id ? '↳ ' : '  ↳ '
    ) : '';
    lines.push(`| ${indent}${span.name} | ${span.kind} | ${status} | ${duration} |`);
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Writes observability data to GitHub job summary
 */
export async function writeSummary(
  metrics: CICDMetrics | null,
  traces: CICDTraces | null
): Promise<void> {
  const summaryParts: string[] = [];

  summaryParts.push('# 🔭 CI/CD Observability Report');
  summaryParts.push('');
  summaryParts.push(`> Generated at ${new Date().toISOString()}`);
  summaryParts.push('');

  if (metrics) {
    summaryParts.push(generateMetricsSummary(metrics));
  }

  if (traces) {
    summaryParts.push(generateTracesSummary(traces));
  }

  // Write to GitHub summary
  const summary = summaryParts.join('\n');
  await core.summary.addRaw(summary).write();

  core.info('Summary written to GitHub Job Summary');
}

/**
 * Generates a brief text summary for action output
 */
export function generateBriefSummary(
  metrics: CICDMetrics | null,
  traces: CICDTraces | null
): string {
  const parts: string[] = [];

  if (metrics) {
    const taskCount = metrics['cicd.pipeline.task.count'];
    const successCount = metrics['cicd.pipeline.task.success_count'];
    const failureCount = metrics['cicd.pipeline.task.failure_count'];
    const duration = formatDuration(metrics['cicd.pipeline.run.duration_ms']);

    parts.push(`Tasks: ${successCount}/${taskCount} passed`);
    if (failureCount > 0) {
      parts.push(`${failureCount} failed`);
    }
    parts.push(`Duration: ${duration}`);
  }

  if (traces) {
    parts.push(`Spans: ${traces.spans.length}`);
  }

  return parts.join(' | ');
}
