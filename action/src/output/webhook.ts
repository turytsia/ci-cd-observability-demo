/**
 * Webhook Sender
 *
 * Sends observability data to a configured webhook endpoint
 */

import * as crypto from 'crypto';
import * as core from '@actions/core';
import type { ObservabilityData } from '../types';

/**
 * Signs a payload using HMAC-SHA256
 */
function signPayload(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  return `sha256=${hmac.digest('hex')}`;
}

/**
 * Sends observability data to a webhook endpoint
 */
export async function sendWebhook(
  data: ObservabilityData,
  webhookUrl: string,
  webhookSecret?: string
): Promise<boolean> {
  try {
    const payload = JSON.stringify(data, null, 2);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'cicd-observability-action/1.0.0',
    };

    // Add signature if secret is provided
    if (webhookSecret) {
      headers['X-Signature-256'] = signPayload(payload, webhookSecret);
    }

    // Add metadata headers
    headers['X-Pipeline-Run-Id'] = data.metrics?.pipeline['cicd.pipeline.run.id'] || 'unknown';
    headers['X-Trace-Id'] = data.traces?.trace_id || 'unknown';

    core.info(`Sending observability data to webhook: ${webhookUrl}`);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: payload,
    });

    if (!response.ok) {
      core.warning(
        `Webhook responded with status ${response.status}: ${response.statusText}`
      );
      return false;
    }

    core.info(`Webhook sent successfully (status: ${response.status})`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning(`Failed to send webhook: ${message}`);
    return false;
  }
}
