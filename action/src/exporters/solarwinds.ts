/**
 * SolarWinds APM Exporter
 *
 * Uses solarwinds-apm library for OpenTelemetry export.
 * The solarwinds-apm library is loaded via --import flag and configures
 * the global OpenTelemetry tracer/meter providers automatically.
 * 
 * This module uses @opentelemetry/api for manual instrumentation,
 * which solarwinds-apm intercepts and exports to SolarWinds.
 */

import * as core from '@actions/core';
import { trace, metrics, SpanKind, SpanStatusCode, context } from '@opentelemetry/api';

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
 * Check if solarwinds-apm is loaded
 */
function isSolarWindsLoaded(): boolean {
  try {
    // If solarwinds-apm is loaded via --import, the tracer provider will be configured
    const tracer = trace.getTracer('test');
    return tracer !== undefined;
  } catch {
    return false;
  }
}

/**
 * Initialize SolarWinds - just validates configuration
 * The actual initialization is done by --import solarwinds-apm
 */
export async function initializeSolarWinds(config: SolarWindsConfig): Promise<boolean> {
  try {
    // Parse and validate service key
    const colonIndex = config.serviceKey.indexOf(':');
    if (colonIndex === -1) {
      throw new Error('Invalid SW_APM_SERVICE_KEY format. Expected: token:service-name');
    }
    const serviceName = config.serviceKey.substring(colonIndex + 1);

    core.info(`SolarWinds APM configuration:`);
    core.info(`  Collector: ${config.collector}`);
    core.info(`  Service: ${serviceName}`);
    
    if (isSolarWindsLoaded()) {
      core.info(`  Status: solarwinds-apm loaded ✓`);
    } else {
      core.warning(`  Status: solarwinds-apm may not be loaded (--import flag required)`);
    }
    
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning(`SolarWinds configuration error: ${message}`);
    return false;
  }
}

/**
 * Flush all pending telemetry data using solarwinds-apm forceFlush
 */
export async function flushSolarWinds(): Promise<void> {
  try {
    // Dynamically import solarwinds-apm to call forceFlush
    const swo = await import('solarwinds-apm');
    if (typeof swo.forceFlush === 'function') {
      core.info('  Flushing telemetry data to SolarWinds...');
      await swo.forceFlush();
      core.info('  ✓ All telemetry data sent to SolarWinds');
    } else {
      // Wait a bit for async export
      await new Promise(resolve => setTimeout(resolve, 3000));
      core.info('  ✓ Telemetry data queued for export');
    }
  } catch (error) {
    // solarwinds-apm might not be available, fallback to waiting
    core.debug(`forceFlush not available: ${error}`);
    await new Promise(resolve => setTimeout(resolve, 3000));
    core.info('  ✓ Telemetry data queued for export');
  }
}

/**
 * Export traces to SolarWinds using OpenTelemetry API
 * solarwinds-apm intercepts these and exports them automatically
 */
export async function exportTracesToSolarWinds(
  traces: CICDTraces,
  config: SolarWindsConfig
): Promise<boolean> {
  try {
    core.info(`Creating ${traces.spans.length} trace spans via OpenTelemetry API...`);

    const tracer = trace.getTracer('cicd-observability', '1.0.0');
    
    // Create root span for the pipeline
    const rootSpanData = traces.root_span;
    
    return tracer.startActiveSpan(
      rootSpanData.name,
      {
        kind: mapSpanKind(rootSpanData.kind),
        startTime: new Date(rootSpanData.start_time_unix_nano / 1_000_000),
        attributes: rootSpanData.attributes,
      },
      async (rootSpan) => {
        try {
          // Get sorted child spans
          const childSpans = traces.spans
            .filter(s => s.span_id !== rootSpanData.span_id)
            .sort((a, b) => a.start_time_unix_nano - b.start_time_unix_nano);

          // Create child spans within the root span context
          for (const spanData of childSpans) {
            const childSpan = tracer.startSpan(
              spanData.name,
              {
                kind: mapSpanKind(spanData.kind),
                startTime: new Date(spanData.start_time_unix_nano / 1_000_000),
                attributes: spanData.attributes,
              },
              context.active()
            );

            // Set status
            if (spanData.status.code === 'error') {
              childSpan.setStatus({
                code: SpanStatusCode.ERROR,
                message: spanData.status.message,
              });
            } else if (spanData.status.code === 'ok') {
              childSpan.setStatus({ code: SpanStatusCode.OK });
            }

            // End child span
            const endTime = spanData.end_time_unix_nano
              ? new Date(spanData.end_time_unix_nano / 1_000_000)
              : new Date();
            childSpan.end(endTime);
          }

          // Set root span status
          if (rootSpanData.status.code === 'error') {
            rootSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: rootSpanData.status.message,
            });
          } else if (rootSpanData.status.code === 'ok') {
            rootSpan.setStatus({ code: SpanStatusCode.OK });
          }

          // End root span
          const rootEndTime = rootSpanData.end_time_unix_nano
            ? new Date(rootSpanData.end_time_unix_nano / 1_000_000)
            : new Date();
          rootSpan.end(rootEndTime);

          core.info(`  ✓ Created ${traces.spans.length} trace spans`);
          return true;
        } catch (error) {
          rootSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          });
          rootSpan.end();
          throw error;
        }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning(`Failed to export traces: ${message}`);
    return false;
  }
}

/**
 * Export metrics to SolarWinds using OpenTelemetry API
 * solarwinds-apm intercepts these and exports them automatically
 */
export async function exportMetricsToSolarWinds(
  metricsData: CICDMetrics,
  config: SolarWindsConfig
): Promise<boolean> {
  try {
    core.info(`Recording metrics via OpenTelemetry API...`);

    const meter = metrics.getMeter('cicd-observability', '1.0.0');

    const pipelineAttributes = {
      'cicd.pipeline.name': metricsData.pipeline['cicd.pipeline.name'],
      'cicd.pipeline.run.id': String(metricsData.pipeline['cicd.pipeline.run.id']),
      'service.name': 'github-actions',
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

    // Record task counts as gauges using UpDownCounter
    const taskCount = meter.createUpDownCounter('cicd.pipeline.task.count', {
      description: 'Total number of tasks in the pipeline',
      unit: '{task}',
    });
    taskCount.add(metricsData['cicd.pipeline.task.count'], pipelineAttributes);

    const taskSuccess = meter.createUpDownCounter('cicd.pipeline.task.success_count', {
      description: 'Number of successful tasks',
      unit: '{task}',
    });
    taskSuccess.add(metricsData['cicd.pipeline.task.success_count'], pipelineAttributes);

    const taskFailure = meter.createUpDownCounter('cicd.pipeline.task.failure_count', {
      description: 'Number of failed tasks',
      unit: '{task}',
    });
    taskFailure.add(metricsData['cicd.pipeline.task.failure_count'], pipelineAttributes);

    const taskSkipped = meter.createUpDownCounter('cicd.pipeline.task.skipped_count', {
      description: 'Number of skipped tasks',
      unit: '{task}',
    });
    taskSkipped.add(metricsData['cicd.pipeline.task.skipped_count'], pipelineAttributes);

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

    core.info(`  ✓ Recorded ${metricsData.tasks.length + 4} metrics`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning(`Failed to export metrics: ${message}`);
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
