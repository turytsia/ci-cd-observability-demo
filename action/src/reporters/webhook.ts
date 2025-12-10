/**
 * Webhook Reporter
 * 
 * Sends observability data to external webhooks
 */

import * as core from '@actions/core';
import * as crypto from 'crypto';
import { ObservabilityData, WebhookPayload } from '../types';

/**
 * Send observability data to a webhook endpoint
 */
export async function sendWebhook(
  webhookUrl: string,
  data: ObservabilityData,
  secret?: string
): Promise<void> {
  if (!webhookUrl) {
    return;
  }
  
  try {
    const payload: WebhookPayload = {
      event: 'observability_report',
      timestamp: new Date().toISOString(),
      data,
    };
    
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'CI-CD-Observability-Action/1.0',
    };
    
    // Add signature if secret is provided
    if (secret) {
      const signature = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');
      headers['X-Signature-256'] = `sha256=${signature}`;
      payload.signature = signature;
    }
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body,
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    core.info(`Webhook sent successfully to ${new URL(webhookUrl).hostname}`);
  } catch (error) {
    core.warning(`Failed to send webhook: ${error}`);
  }
}
