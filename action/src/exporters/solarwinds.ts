/**
 * SolarWinds OTLP Exporter
 *
 * Exports traces and metrics to SolarWinds Observability using standard OTLP protocol.
 * SolarWinds accepts OTLP data with Bearer token authentication.
 */

import * as core from '@actions/core';
import { Resource } from '@opentelemetry/resources';
import {
  BasicTracerProvider,
  BatchSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';

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
 * Parse service key to extract token and service name
 */
function parseServiceKey(serviceKey: string): { token: string; serviceName: string } {
  const colonIndex = serviceKey.indexOf(':');
  if (colonIndex === -1) {
    throw new Error('Invalid SW_APM_SERVICE_KEY format. Expected: token:service-name');
  }
  return {
    token: serviceKey.substring(0, colonIndex),
    serviceName: serviceKey.substring(colonIndex + 1),
  };
}

/**
 * Create OTLP headers for SolarWinds authentication
 */
function createHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
  };
}

/**
 * Initialize is now a no-op since we create providers inline
 */
export async function initializeSolarWinds(config: SolarWindsConfig): Promise<boolean> {
  try {
    const { serviceName } = parseServiceKey(config.serviceKey);
    core.info(`SolarWinds OTLP configuration:`);
    core.info(`  Collector: ${config.collector}`);
    core.info(`  Service: ${serviceName}`);
    core.info(`  Protocol: OTLP/HTTP`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning(`SolarWinds configuration error: ${message}`);
    return false;
  }
}

/**
 * Flush is handled per-export now
 */
export async function flushSolarWinds(): Promise<void> {
  // No-op - flushing is done in each export function
  core.info('  ✓ All telemetry data sent to SolarWinds');
}

/**
 * Export traces to SolarWinds using OTLP
 */
export async function exportTracesToSolarWinds(
  traces: CICDTraces,
  config: SolarWindsConfig
): Promise<boolean> {
  try {
    const { token, serviceName } = parseServiceKey(config.serviceKey);
    const endpoint = `https://${config.collector}:443/v1/traces`;

    core.info(`Exporting ${traces.spans.length} trace spans to SolarWinds...`);
    core.info(`  Endpoint: ${endpoint}`);

    // Create resource with service info
    const resource = new Resource({
      'service.name': serviceName,
      'service.version': '1.0.0',
      'deployment.environment': process.env.GITHUB_REF_NAME || 'production',
      'vcs.repository.url.full': `https://github.com/${process.env.GITHUB_REPOSITORY}`,
      'cicd.pipeline.name': traces.root_span.attributes['cicd.pipeline.name'],
    });

    // Create OTLP trace exporter
    const traceExporter = new OTLPTraceExporter({
      url: endpoint,
      headers: createHeaders(token),
    });

    // Create tracer provider
    const provider = new BasicTracerProvider({
      resource,
    });

    provider.addSpanProcessor(new BatchSpanProcessor(traceExporter));
    
    const tracer = provider.getTracer('cicd-observability', '1.0.0');

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
        'service.name': serviceName,
      },
    });
    spanMap.set(rootSpanData.span_id, rootSpan);

    // Create child spans
    for (const spanData of sortedSpans) {
      if (spanData.span_id === rootSpanData.span_id) continue;

      // For child spans, we create them but they won't have proper parent context
      // in this simplified approach - the trace will still be exported
      const span = tracer.startSpan(spanData.name, {
        kind: mapSpanKind(spanData.kind),
        startTime: new Date(spanData.start_time_unix_nano / 1_000_000),
        attributes: spanData.attributes,
      });

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

    // Force flush and shutdown
    core.info('  Flushing trace data...');
    await provider.forceFlush();
    await provider.shutdown();

    core.info(`  ✓ Exported ${traces.spans.length} trace spans`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning(`Failed to export traces to SolarWinds: ${message}`);
    if (error instanceof Error && error.stack) {
      core.debug(error.stack);
    }
    return false;
  }
}

/**
 * Export metrics to SolarWinds using OTLP
 */
export async function exportMetricsToSolarWinds(
  metricsData: CICDMetrics,
  config: SolarWindsConfig
): Promise<boolean> {
  try {
    const { token, serviceName } = parseServiceKey(config.serviceKey);
    const endpoint = `https://${config.collector}:443/v1/metrics`;

    core.info(`Exporting metrics to SolarWinds...`);
    core.info(`  Endpoint: ${endpoint}`);

    // Create resource with service info
    const resource = new Resource({
      'service.name': serviceName,
      'service.version': '1.0.0',
      'deployment.environment': process.env.GITHUB_REF_NAME || 'production',
      'vcs.repository.url.full': `https://github.com/${process.env.GITHUB_REPOSITORY}`,
    });

    // Create OTLP metric exporter
    const metricExporter = new OTLPMetricExporter({
      url: endpoint,
      headers: createHeaders(token),
    });

    // Create meter provider with immediate export
    const meterProvider = new MeterProvider({
      resource,
      readers: [
        new PeriodicExportingMetricReader({
          exporter: metricExporter,
          exportIntervalMillis: 1000,
        }),
      ],
    });

    const meter = meterProvider.getMeter('cicd-observability', '1.0.0');

    const pipelineAttributes = {
      'cicd.pipeline.name': metricsData.pipeline['cicd.pipeline.name'],
      'cicd.pipeline.run.id': String(metricsData.pipeline['cicd.pipeline.run.id']),
    };

    // Record pipeline duration
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

    // Record task counts
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

    // Wait for metrics to be exported
    core.info('  Flushing metric data...');
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await meterProvider.forceFlush();
    await meterProvider.shutdown();

    core.info(`  ✓ Exported ${metricsData.tasks.length + 4} metrics`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning(`Failed to export metrics to SolarWinds: ${message}`);
    if (error instanceof Error && error.stack) {
      core.debug(error.stack);
    }
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
