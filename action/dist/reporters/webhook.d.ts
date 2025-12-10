/**
 * Webhook Reporter
 *
 * Sends observability data to external webhooks
 */
import { ObservabilityData } from '../types';
/**
 * Send observability data to a webhook endpoint
 */
export declare function sendWebhook(webhookUrl: string, data: ObservabilityData, secret?: string): Promise<void>;
//# sourceMappingURL=webhook.d.ts.map