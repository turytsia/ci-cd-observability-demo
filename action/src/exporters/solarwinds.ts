/**
 * SolarWinds OTLP Exporter
 *
 * Exports metrics and traces to SolarWinds Observability using OTLP protocol.
 */

import * as core from '@actions/core';
import { Resource } from '@opentelemetry/resources';
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  ReadableSpan,
} from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import {
  SpanKind,
  SpanStatusCode,
  context,
  trace,
  Span as OTelSpan,
} from '@opentelemetry/api';

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
  const parts = serviceKey.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid SW_APM_SERVICE_KEY format. Expected: token:service-name');
  }
  return {
    token: parts[0],
    serviceName: parts[1],
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
 * Export traces to SolarWinds
 */
export async function exportTracesToSolarWinds(
  traces: CICDTraces,
  config: SolarWindsConfig
): Promise<boolean> {
  try {
    const { token, serviceName } = parseServiceKey(config.serviceKey);
    const endpoint = `https://${config.collector}:443/v1/traces`;

    core.info(`Exporting traces to SolarWinds: ${config.collector}`);
    core.info(`Service name: ${serviceName}`);

    // Create resource with service info
    const resource = new Resource({
      'service.name': serviceName,
      'service.version': '1.0.0',
      'deployment.environment': process.env.GITHUB_REF_NAME || 'unknown',
      'vcs.repository.url.full': `https://github.com/${process.env.GITHUB_REPOSITORY}`,
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
    provider.register();

    const tracer = provider.getTracer('cicd-observability', '1.0.0');

    // Convert our spans to OTel spans
    // We need to recreate the span hierarchy
    const spanMap = new Map<string, OTelSpan>();

    // Sort spans by start time to ensure parents are created first
    const sortedSpans = [...traces.spans].sort(
      (a, b) => a.start_time_unix_nano - b.start_time_unix_nano
    );

    // Create root span first
    const rootSpanData = traces.root_span;
    const rootSpan = tracer.startSpan(rootSpanData.name, {
      kind: mapSpanKind(rootSpanData.kind),
      startTime: new Date(rootSpanData.start_time_unix_nano / 1_000_000),
      attributes: rootSpanData.attributes,
    });

    spanMap.set(rootSpanData.span_id, rootSpan);

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

    // Force flush and shutdown
    await provider.forceFlush();
    await provider.shutdown();

    core.info(`✓ Exported ${traces.spans.length} spans to SolarWinds`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning(`Failed to export traces to SolarWinds: ${message}`);
    return false;
  }
}

/**
 * Export metrics to SolarWinds
 */
export async function exportMetricsToSolarWinds(
  metrics: CICDMetrics,
  config: SolarWindsConfig
): Promise<boolean> {
  try {
    const { token, serviceName } = parseServiceKey(config.serviceKey);
    const endpoint = `https://${config.collector}:443/v1/metrics`;

    core.info(`Exporting metrics to SolarWinds: ${config.collector}`);

    // Create resource with service info
    const resource = new Resource({
      'service.name': serviceName,
      'service.version': '1.0.0',
      'deployment.environment': process.env.GITHUB_REF_NAME || 'unknown',
      'vcs.repository.url.full': `https://github.com/${process.env.GITHUB_REPOSITORY}`,
    });

    // Create OTLP metric exporter
    const metricExporter = new OTLPMetricExporter({
      url: endpoint,
      headers: createHeaders(token),
    });

    // Create meter provider
    const meterProvider = new MeterProvider({
      resource,
      readers: [
        new PeriodicExportingMetricReader({
          exporter: metricExporter,
          exportIntervalMillis: 1000, // Export immediately
        }),
      ],
    });

    const meter = meterProvider.getMeter('cicd-observability', '1.0.0');

    // Record pipeline duration as histogram
    const pipelineDuration = meter.createHistogram('cicd.pipeline.run.duration', {
      description: 'Duration of pipeline run',
      unit: 's',
    });

    if (metrics['cicd.pipeline.run.duration_ms']) {
      pipelineDuration.record(metrics['cicd.pipeline.run.duration_ms'] / 1000, {
        'cicd.pipeline.name': metrics.pipeline['cicd.pipeline.name'],
        'cicd.pipeline.run.state': metrics.pipeline['cicd.pipeline.run.state'],
        'cicd.pipeline.result': metrics.pipeline['cicd.pipeline.result'] || 'unknown',
      });
    }

    // Record task counts
    const taskCounter = meter.createCounter('cicd.pipeline.tasks', {
      description: 'Count of pipeline tasks by status',
      unit: '{task}',
    });

    taskCounter.add(metrics['cicd.pipeline.task.success_count'], {
      'cicd.pipeline.name': metrics.pipeline['cicd.pipeline.name'],
      status: 'success',
    });
    taskCounter.add(metrics['cicd.pipeline.task.failure_count'], {
      'cicd.pipeline.name': metrics.pipeline['cicd.pipeline.name'],
      status: 'failure',
    });
    taskCounter.add(metrics['cicd.pipeline.task.skipped_count'], {
      'cicd.pipeline.name': metrics.pipeline['cicd.pipeline.name'],
      status: 'skipped',
    });
    taskCounter.add(metrics['cicd.pipeline.task.cancelled_count'], {
      'cicd.pipeline.name': metrics.pipeline['cicd.pipeline.name'],
      status: 'cancelled',
    });

    // Record errors
    if (metrics['cicd.pipeline.run.errors'].length > 0) {
      const errorCounter = meter.createCounter('cicd.pipeline.run.errors', {
        description: 'Count of pipeline errors by type',
        unit: '{error}',
      });

      for (const error of metrics['cicd.pipeline.run.errors']) {
        errorCounter.add(error.count, {
          'cicd.pipeline.name': metrics.pipeline['cicd.pipeline.name'],
          'error.type': error['error.type'],
        });
      }
    }

    // Record queue time
    if (metrics['cicd.pipeline.run.queue_time_ms']) {
      const queueTime = meter.createHistogram('cicd.pipeline.run.queue_time', {
        description: 'Queue time before pipeline started',
        unit: 's',
      });
      queueTime.record(metrics['cicd.pipeline.run.queue_time_ms'] / 1000, {
        'cicd.pipeline.name': metrics.pipeline['cicd.pipeline.name'],
      });
    }

    // Record individual task durations
    for (const task of metrics.tasks) {
      if (task.duration_ms) {
        const taskDuration = meter.createHistogram('cicd.pipeline.task.duration', {
          description: 'Duration of individual tasks',
          unit: 's',
        });
        taskDuration.record(task.duration_ms / 1000, {
          'cicd.pipeline.name': metrics.pipeline['cicd.pipeline.name'],
          'cicd.pipeline.task.name': task.attributes['cicd.pipeline.task.name'],
          'cicd.pipeline.task.type': task.attributes['cicd.pipeline.task.type'],
          status: task.status,
        });
      }
    }

    // Force flush and shutdown
    await meterProvider.forceFlush();
    await meterProvider.shutdown();

    core.info('✓ Exported metrics to SolarWinds');
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
