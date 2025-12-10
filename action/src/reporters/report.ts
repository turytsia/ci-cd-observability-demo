/**
 * Report Generator
 * 
 * Generates HTML and JSON reports, and GitHub Job Summary
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { promises as fs } from 'fs';
import path from 'path';
import { ObservabilityData } from '../types';

/**
 * Generate all reports
 */
export async function generateReports(
  data: ObservabilityData,
  format: string
): Promise<{ htmlPath?: string; jsonPath?: string }> {
  const result: { htmlPath?: string; jsonPath?: string } = {};
  
  // Create output directory
  const outputDir = path.join(process.cwd(), 'observability-reports');
  await fs.mkdir(outputDir, { recursive: true });
  
  if (format === 'all' || format === 'json') {
    const jsonPath = path.join(outputDir, 'observability-report.json');
    await fs.writeFile(jsonPath, JSON.stringify(data, null, 2));
    result.jsonPath = jsonPath;
    core.info(`Generated JSON report: ${jsonPath}`);
  }
  
  if (format === 'all' || format === 'html') {
    const htmlPath = path.join(outputDir, 'observability-report.html');
    const html = generateHTMLReport(data);
    await fs.writeFile(htmlPath, html);
    result.htmlPath = htmlPath;
    core.info(`Generated HTML report: ${htmlPath}`);
  }
  
  // Always generate GitHub Job Summary
  await generateGitHubSummary(data);
  
  return result;
}

/**
 * Generate GitHub Job Summary (markdown)
 */
async function generateGitHubSummary(data: ObservabilityData): Promise<void> {
  const lines: string[] = [];
  
  lines.push('# 📊 CI/CD Observability Report');
  lines.push('');
  
  // Metadata section
  lines.push('## 🔍 Build Information');
  lines.push('');
  lines.push('| Property | Value |');
  lines.push('|----------|-------|');
  lines.push(`| Workflow | \`${data.metadata.workflow}\` |`);
  lines.push(`| Job | \`${data.metadata.job}\` |`);
  lines.push(`| Run | [#${data.metadata.runNumber}](https://github.com/${data.metadata.repository}/actions/runs/${data.metadata.runId}) |`);
  lines.push(`| Commit | \`${data.metadata.sha.substring(0, 7)}\` |`);
  lines.push(`| Branch | \`${data.metadata.ref}\` |`);
  lines.push(`| Actor | @${data.metadata.actor} |`);
  lines.push(`| Event | \`${data.metadata.eventName}\` |`);
  lines.push('');
  
  // Metrics section
  if (data.metrics && Object.keys(data.metrics).length > 0) {
    lines.push('## ⏱️ Metrics');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    
    if (data.metrics.workflowDuration !== undefined) {
      lines.push(`| Workflow Duration | ${formatDuration(data.metrics.workflowDuration)} |`);
    }
    if (data.metrics.actionDuration !== undefined) {
      lines.push(`| Action Duration | ${formatDuration(data.metrics.actionDuration)} |`);
    }
    if (data.metrics.queueTime !== undefined) {
      lines.push(`| Queue Time | ${formatDuration(data.metrics.queueTime)} |`);
    }
    if (data.metrics.runnerOs) {
      lines.push(`| Runner OS | ${data.metrics.runnerOs} |`);
    }
    if (data.metrics.runnerArch) {
      lines.push(`| Runner Arch | ${data.metrics.runnerArch} |`);
    }
    lines.push('');
  }
  
  // Test results section
  if (data.testResults) {
    const { total, passed, failed, skipped, duration } = data.testResults;
    const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0';
    const statusIcon = failed > 0 ? '❌' : '✅';
    
    lines.push('## 🧪 Test Results');
    lines.push('');
    lines.push(`${statusIcon} **${passed}/${total}** tests passed (${passRate}%)`);
    lines.push('');
    lines.push('| Status | Count |');
    lines.push('|--------|-------|');
    lines.push(`| ✅ Passed | ${passed} |`);
    lines.push(`| ❌ Failed | ${failed} |`);
    lines.push(`| ⏭️ Skipped | ${skipped} |`);
    lines.push(`| ⏱️ Duration | ${formatDuration(duration)} |`);
    lines.push('');
    
    // Show failed tests
    if (failed > 0 && data.testResults.testSuites) {
      lines.push('### Failed Tests');
      lines.push('');
      for (const suite of data.testResults.testSuites) {
        const failedTests = suite.testCases.filter(tc => tc.status === 'failed' || tc.status === 'error');
        for (const test of failedTests) {
          lines.push(`- ❌ \`${suite.name}\` > \`${test.name}\``);
          if (test.message) {
            lines.push(`  > ${test.message}`);
          }
        }
      }
      lines.push('');
    }
  }
  
  // Coverage section
  if (data.coverage) {
    const { percentage, coveredLines, totalLines } = data.coverage;
    const coverageIcon = percentage >= 80 ? '🟢' : percentage >= 60 ? '🟡' : '🔴';
    
    lines.push('## 📈 Code Coverage');
    lines.push('');
    lines.push(`${coverageIcon} **${percentage.toFixed(1)}%** line coverage (${coveredLines}/${totalLines} lines)`);
    lines.push('');
    
    // Coverage bar
    const filledBlocks = Math.round(percentage / 10);
    const emptyBlocks = 10 - filledBlocks;
    const bar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
    lines.push(`\`${bar}\` ${percentage.toFixed(1)}%`);
    lines.push('');
    
    if (data.coverage.coveredBranches !== undefined && data.coverage.totalBranches) {
      const branchCoverage = (data.coverage.coveredBranches / data.coverage.totalBranches) * 100;
      lines.push(`Branch coverage: **${branchCoverage.toFixed(1)}%** (${data.coverage.coveredBranches}/${data.coverage.totalBranches})`);
      lines.push('');
    }
  }
  
  // Footer
  lines.push('---');
  lines.push(`*Generated by CI/CD Observability Action at ${data.metadata.timestamp}*`);
  
  await core.summary.addRaw(lines.join('\n')).write();
  core.info('Generated GitHub Job Summary');
}

/**
 * Generate HTML report
 */
function generateHTMLReport(data: ObservabilityData): string {
  const testStatus = data.testResults 
    ? (data.testResults.failed > 0 ? 'failed' : 'passed')
    : 'unknown';
  
  const coverageStatus = data.coverage
    ? (data.coverage.percentage >= 80 ? 'good' : data.coverage.percentage >= 60 ? 'warning' : 'poor')
    : 'unknown';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CI/CD Observability Report - ${data.metadata.workflow}</title>
  <style>
    :root {
      --bg-color: #0d1117;
      --card-bg: #161b22;
      --text-color: #c9d1d9;
      --text-muted: #8b949e;
      --border-color: #30363d;
      --success: #3fb950;
      --warning: #d29922;
      --error: #f85149;
      --info: #58a6ff;
    }
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      background: var(--bg-color);
      color: var(--text-color);
      line-height: 1.6;
      padding: 2rem;
    }
    
    .container { max-width: 1200px; margin: 0 auto; }
    
    header {
      text-align: center;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--border-color);
    }
    
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    .subtitle { color: var(--text-muted); }
    
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 1.5rem;
    }
    
    .card h2 {
      font-size: 1.2rem;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
    }
    
    .stat {
      text-align: center;
      padding: 1rem;
      background: var(--bg-color);
      border-radius: 6px;
    }
    
    .stat-value {
      font-size: 2rem;
      font-weight: bold;
    }
    
    .stat-label {
      color: var(--text-muted);
      font-size: 0.85rem;
    }
    
    .success { color: var(--success); }
    .warning { color: var(--warning); }
    .error { color: var(--error); }
    .info { color: var(--info); }
    
    .progress-bar {
      height: 8px;
      background: var(--border-color);
      border-radius: 4px;
      overflow: hidden;
      margin: 1rem 0;
    }
    
    .progress-fill {
      height: 100%;
      transition: width 0.3s ease;
    }
    
    .meta-list {
      list-style: none;
    }
    
    .meta-list li {
      display: flex;
      justify-content: space-between;
      padding: 0.5rem 0;
      border-bottom: 1px solid var(--border-color);
    }
    
    .meta-list li:last-child { border-bottom: none; }
    
    .meta-key { color: var(--text-muted); }
    .meta-value { font-family: monospace; }
    
    footer {
      text-align: center;
      color: var(--text-muted);
      font-size: 0.85rem;
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border-color);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>📊 CI/CD Observability Report</h1>
      <p class="subtitle">${data.metadata.workflow} - Run #${data.metadata.runNumber}</p>
    </header>
    
    <div class="grid">
      <div class="card">
        <h2>🔍 Build Information</h2>
        <ul class="meta-list">
          <li><span class="meta-key">Repository</span><span class="meta-value">${data.metadata.repository}</span></li>
          <li><span class="meta-key">Branch</span><span class="meta-value">${data.metadata.ref}</span></li>
          <li><span class="meta-key">Commit</span><span class="meta-value">${data.metadata.sha.substring(0, 7)}</span></li>
          <li><span class="meta-key">Actor</span><span class="meta-value">${data.metadata.actor}</span></li>
          <li><span class="meta-key">Event</span><span class="meta-value">${data.metadata.eventName}</span></li>
        </ul>
      </div>
      
      ${data.metrics ? `
      <div class="card">
        <h2>⏱️ Metrics</h2>
        <div class="stat-grid">
          ${data.metrics.workflowDuration !== undefined ? `
          <div class="stat">
            <div class="stat-value info">${formatDuration(data.metrics.workflowDuration)}</div>
            <div class="stat-label">Workflow Duration</div>
          </div>` : ''}
          ${data.metrics.queueTime !== undefined ? `
          <div class="stat">
            <div class="stat-value">${formatDuration(data.metrics.queueTime)}</div>
            <div class="stat-label">Queue Time</div>
          </div>` : ''}
        </div>
      </div>` : ''}
      
      ${data.testResults ? `
      <div class="card">
        <h2>🧪 Test Results</h2>
        <div class="stat-grid">
          <div class="stat">
            <div class="stat-value ${testStatus === 'passed' ? 'success' : 'error'}">${data.testResults.passed}/${data.testResults.total}</div>
            <div class="stat-label">Tests Passed</div>
          </div>
          <div class="stat">
            <div class="stat-value">${formatDuration(data.testResults.duration)}</div>
            <div class="stat-label">Duration</div>
          </div>
          <div class="stat">
            <div class="stat-value error">${data.testResults.failed}</div>
            <div class="stat-label">Failed</div>
          </div>
          <div class="stat">
            <div class="stat-value warning">${data.testResults.skipped}</div>
            <div class="stat-label">Skipped</div>
          </div>
        </div>
      </div>` : ''}
      
      ${data.coverage ? `
      <div class="card">
        <h2>📈 Code Coverage</h2>
        <div class="stat">
          <div class="stat-value ${coverageStatus === 'good' ? 'success' : coverageStatus === 'warning' ? 'warning' : 'error'}">${data.coverage.percentage.toFixed(1)}%</div>
          <div class="stat-label">Line Coverage</div>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${coverageStatus === 'good' ? 'success' : coverageStatus === 'warning' ? 'warning' : 'error'}" style="width: ${data.coverage.percentage}%; background: var(--${coverageStatus === 'good' ? 'success' : coverageStatus === 'warning' ? 'warning' : 'error'})"></div>
        </div>
        <p style="text-align: center; color: var(--text-muted)">${data.coverage.coveredLines} / ${data.coverage.totalLines} lines covered</p>
      </div>` : ''}
    </div>
    
    <footer>
      Generated by CI/CD Observability Action at ${data.metadata.timestamp}
    </footer>
  </div>
</body>
</html>`;
}

/**
 * Format duration in seconds to human readable string
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs.toFixed(0)}s`;
}
