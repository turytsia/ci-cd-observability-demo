/**
 * SolarWinds APM Exporter
 *
 * Exports traces and metrics to SolarWinds Observability using the solarwinds-apm library.
 * The library provides OpenTelemetry-based instrumentation and handles protocol translation.
 * 
 * When SolarWinds APM is enabled, the action.yml loads it via `--import solarwinds-apm`
 * which registers it as the global OpenTelemetry tracer/meter provider.
 */

import * as core from '@actions/core';
import { trace, context, SpanKind, SpanStatusCode, metrics } from '@opentelemetry/api';

import type { CICDMetrics, CICDTraces, Span } from '../types';

/**
 * SolarWinds exporter configuration
 */
export interface SolarWindsConfig {
  /** Service key in format: token:service-name */
  serviceKey: string;
  /** Collector endpoint (e.g., apm.collector.na-01.st-ssp.solarwinds.com) */
  collector: string;
}

/**
 * Check if SolarWinds APM is available and initialized
 * The module is loaded via --import flag in action.yml
 */
export async function initializeSolarWinds(config: SolarWindsConfig): Promise<boolean> {
  try {
    core.info(`SolarWinds APM configuration:`);
    core.info(`  Collector: ${config.collector}`);
    core.info(`  Service: ${config.serviceKey.split(':')[1] || 'configured'}`);

    // Check if solarwinds-apm was loaded via --import
    // It registers itself in the global symbol registry
    const swoModule = (global as any)[Symbol.for('solarwinds-apm')];
    
    if (swoModule) {
      // Wait for SolarWinds to be ready
      if (swoModule.waitUntilReady) {
        await swoModule.waitUntilReady(10_000);
        core.info('  ✓ SolarWinds APM is ready');
      }
      return true;
    }
    
    // Try dynamic import as fallback
    try {
      const swo = await import('solarwinds-apm');
      if (swo.waitUntilReady) {
        await swo.waitUntilReady(10_000);
        core.info('  ✓ SolarWinds APM initialized');
      }
      return true;
    } catch {
      core.info('  ⚠ SolarWinds APM not available, using standard OTel API');
      return false;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning(`SolarWinds APM check failed: ${message}`);
    return false;
  }
}

/**
 * Force flush any pending telemetry data to SolarWinds
 */
export async function flushSolarWinds(): Promise<void> {
  try {
    // Try to get the module from global symbol
    const swoModule = (global as any)[Symbol.for('solarwinds-apm')];
    
    if (swoModule?.forceFlush) {
      await swoModule.forceFlush();
      core.info('  ✓ Flushed telemetry data to SolarWinds');
      return;
    }
    
    // Try dynamic import
    try {
      const swo = await import('solarwinds-apm');
      if (swo.forceFlush) {
        await swo.forceFlush();
        core.info('  ✓ Flushed telemetry data to SolarWinds');
        return;
      }
    } catch {
      // Module not available
    }
    
    // Fallback: wait for batched data to be sent
    core.info('  Waiting for telemetry data to be sent...');
    await new Promise((resolve) => setTimeout(resolve, 5000));
  } catch (error) {
    core.warning(`Failed to flush SolarWinds data: ${error}`);
  }
}

/**
 * Export traces to SolarWinds using OpenTelemetry API
 */
export async function exportTracesToSolarWinds(
  traces: CICDTraces,
  config: SolarWindsConfig
): Promise<boolean> {
  try {
    core.info(`Exporting ${traces.spans.length} trace spans to SolarWinds...`);

    // Get the tracer from the global API
    // When solarwinds-apm is loaded, it registers itself as the tracer provider
    const tracer = trace.getTracer('cicd-observability', '1.0.0');

    // Create a map to track span relationships
    const spanMap = new Map<string, any>();

    // Sort spans by start time to ensure parents are created first
    const sortedSpans = [...traces.spans].sort(
      (a, b) => a.start_time_unix_nano - b.start_time_unix_nano
    );

    // Create root span first
    const rootSpanData = traces.root_span;
    const rootSpan = tracer.startSpan(rootSpanData.name, {
      kind: mapSpanKind(rootSpanData.kind),
      startTime: new Date(rootSpanData.start_time_unix_nano / 1_000_000),
      attributes: {
        ...rootSpanData.attributes,
        'service.name': 'cicd-observability',
        'deployment.environment': process.env.GITHUB_REF_NAME || 'production',
        'vcs.repository.url.full': `https://github.com/${process.env.GITHUB_REPOSITORY}`,
      },
    });
    spanMap.set(rootSpanData.span_id, rootSpan);

    // Set custom transaction name if SolarWinds APM is available
    try {
      const swo = (global as any)[Symbol.for('solarwinds-apm')];
      if (swo?.setTransactionName) {
        swo.setTransactionName(`pipeline:${rootSpanData.attributes['cicd.pipeline.name']}`);
      }
    } catch {
      // SolarWinds APM not available
    }

    // Create child spans
    for (const spanData of sortedSpans) {
      if (spanData.span_id === rootSpanData.span_id) continue;

      const parentSpan = spanData.parent_span_id
        ? spanMap.get(spanData.parent_span_id)
        : undefined;

      const ctx = parentSpan
        ? trace.setSpan(context.active(), parentSpan)
        : context.active();

      const span = tracer.startSpan(
        spanData.name,
        {
          kind: mapSpanKind(spanData.kind),
          startTime: new Date(spanData.start_time_unix_nano / 1_000_000),
          attributes: spanData.attributes,
        },
        ctx
      );

      spanMap.set(spanData.span_id, span);
    }

    // End all spans in reverse order (children first)
    const reversedSpans = [...sortedSpans].reverse();
    for (const spanData of reversedSpans) {
      const span = spanMap.get(spanData.span_id);
      if (span) {
        // Set status
        if (spanData.status.code === 'error') {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: spanData.status.message,
          });
        } else if (spanData.status.code === 'ok') {
          span.setStatus({ code: SpanStatusCode.OK });
        }

        // End span with proper end time
        const endTime = spanData.end_time_unix_nano
          ? new Date(spanData.end_time_unix_nano / 1_000_000)
          : new Date();
        span.end(endTime);
      }
    }

    core.info(`  ✓ Created ${traces.spans.length} trace spans`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning(`Failed to export traces to SolarWinds: ${message}`);
    return false;
  }
}

/**
 * Export metrics to SolarWinds using OpenTelemetry API
 */
export async function exportMetricsToSolarWinds(
  metricsData: CICDMetrics,
  config: SolarWindsConfig
): Promise<boolean> {
  try {
    core.info('Exporting metrics to SolarWinds...');

    // Get the meter from the global API
    const meter = metrics.getMeter('cicd-observability', '1.0.0');

    const pipelineAttributes = {
      'cicd.pipeline.name': metricsData.pipeline['cicd.pipeline.name'],
      'cicd.pipeline.run.id': String(metricsData.pipeline['cicd.pipeline.run.id']),
      'service.name': 'cicd-observability',
      'deployment.environment': process.env.GITHUB_REF_NAME || 'production',
    };

    // Record pipeline duration as histogram
    const pipelineDuration = meter.createHistogram('cicd.pipeline.run.duration', {
      description: 'Duration of pipeline run in seconds',
      unit: 's',
    });

    if (metricsData['cicd.pipeline.run.duration_ms']) {
      pipelineDuration.record(
        metricsData['cicd.pipeline.run.duration_ms'] / 1000,
        {
          ...pipelineAttributes,
          'cicd.pipeline.run.state': metricsData.pipeline['cicd.pipeline.run.state'],
          'cicd.pipeline.result': metricsData.pipeline['cicd.pipeline.result'] || 'unknown',
        }
      );
    }

    // Record total task count
    const taskCountGauge = meter.createUpDownCounter('cicd.pipeline.task.count', {
      description: 'Total number of tasks in the pipeline',
      unit: '{task}',
    });
    taskCountGauge.add(metricsData['cicd.pipeline.task.count'], pipelineAttributes);

    // Record task counts by status
    const taskSuccessGauge = meter.createUpDownCounter('cicd.pipeline.task.success_count', {
      description: 'Number of successful tasks',
      unit: '{task}',
    });
    taskSuccessGauge.add(metricsData['cicd.pipeline.task.success_count'], pipelineAttributes);

    const taskFailureGauge = meter.createUpDownCounter('cicd.pipeline.task.failure_count', {
      description: 'Number of failed tasks',
      unit: '{task}',
    });
    taskFailureGauge.add(metricsData['cicd.pipeline.task.failure_count'], pipelineAttributes);

    const taskSkippedGauge = meter.createUpDownCounter('cicd.pipeline.task.skipped_count', {
      description: 'Number of skipped tasks',
      unit: '{task}',
    });
    taskSkippedGauge.add(metricsData['cicd.pipeline.task.skipped_count'], pipelineAttributes);

    const taskCancelledGauge = meter.createUpDownCounter('cicd.pipeline.task.cancelled_count', {
      description: 'Number of cancelled tasks',
      unit: '{task}',
    });
    taskCancelledGauge.add(metricsData['cicd.pipeline.task.cancelled_count'], pipelineAttributes);

    // Record errors
    if (metricsData['cicd.pipeline.run.errors'].length > 0) {
      const errorCounter = meter.createCounter('cicd.pipeline.run.errors', {
        description: 'Count of pipeline errors by type',
        unit: '{error}',
      });

      for (const error of metricsData['cicd.pipeline.run.errors']) {
        errorCounter.add(error.count, {
          ...pipelineAttributes,
          'error.type': error['error.type'],
        });
      }
    }

    // Record queue time
    if (metricsData['cicd.pipeline.run.queue_time_ms']) {
      const queueTime = meter.createHistogram('cicd.pipeline.run.queue_time', {
        description: 'Queue time before pipeline started',
        unit: 's',
      });
      queueTime.record(
        metricsData['cicd.pipeline.run.queue_time_ms'] / 1000,
        pipelineAttributes
      );
    }

    // Record individual task durations
    const taskDuration = meter.createHistogram('cicd.pipeline.task.duration', {
      description: 'Duration of individual tasks',
      unit: 's',
    });

    for (const task of metricsData.tasks) {
      if (task.duration_ms) {
        taskDuration.record(task.duration_ms / 1000, {
          ...pipelineAttributes,
          'cicd.pipeline.task.name': task.attributes['cicd.pipeline.task.name'],
          'cicd.pipeline.task.type': task.attributes['cicd.pipeline.task.type'],
          'cicd.pipeline.task.run.state': task.status,
        });
      }
    }

    core.info(`  ✓ Recorded ${metricsData.tasks.length + 5} metrics`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning(`Failed to export metrics to SolarWinds: ${message}`);
    return false;
  }
}

/**
 * Map our span kind to OTel SpanKind
 */
function mapSpanKind(kind: string): SpanKind {
  switch (kind) {
    case 'server':
      return SpanKind.SERVER;
    case 'client':
      return SpanKind.CLIENT;
    case 'producer':
      return SpanKind.PRODUCER;
    case 'consumer':
      return SpanKind.CONSUMER;
    default:
      return SpanKind.INTERNAL;
  }
}
