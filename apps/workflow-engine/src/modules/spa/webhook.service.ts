import mongoose from 'mongoose';
import { createHmac } from 'crypto';
import { SpaWebhookModel, type SpaWebhook } from '@noxivo/database';

export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface WebhookTriggerResult {
  success: boolean;
  webhookId: string;
  status: number | null;
  error: string | null;
}

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export async function triggerWebhooks(
  agencyId: mongoose.Types.ObjectId,
  event: string,
  data: Record<string, unknown>,
): Promise<WebhookTriggerResult[]> {
  const webhooks = await SpaWebhookModel.find({
    agencyId,
    isActive: true,
    events: event,
  }).lean();

  if (webhooks.length === 0) {
    return [];
  }

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  const payloadString = JSON.stringify(payload);
  const results: WebhookTriggerResult[] = [];

  await Promise.all(
    webhooks.map(async (webhook) => {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Spa-Webhook-Event': event,
          'X-Spa-Webhook-Timestamp': payload.timestamp,
        };

        if (webhook.secret) {
          headers['X-Spa-Webhook-Signature'] = signPayload(payloadString, webhook.secret);
        }

        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: payloadString,
        });

        const success = response.ok;
        const status = response.status;
        let error: string | null = null;

        if (!success) {
          const errorText = await response.text();
          error = `HTTP ${status}: ${errorText.slice(0, 200)}`;
        }

        await SpaWebhookModel.findByIdAndUpdate(webhook._id, {
          $set: {
            lastTriggeredAt: new Date(),
            lastStatus: success ? 'success' : 'failed',
            lastError: error,
          },
        });

        results.push({
          success,
          webhookId: String(webhook._id),
          status,
          error,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';

        await SpaWebhookModel.findByIdAndUpdate(webhook._id, {
          $set: {
            lastTriggeredAt: new Date(),
            lastStatus: 'failed',
            lastError: errorMessage,
          },
        });

        results.push({
          success: false,
          webhookId: String(webhook._id),
          status: null,
          error: errorMessage,
        });
      }
    }),
  );

  return results;
}

export async function triggerBookingCreated(
  agencyId: mongoose.Types.ObjectId,
  booking: {
    id: string;
    customerName: string;
    customerEmail: string | null;
    customerPhone: string | null;
    appointmentDateLabel: string;
    appointmentTime: string;
    services: Array<{ name: string; price: number }>;
    totalPrice: number;
    status: string;
  },
): Promise<WebhookTriggerResult[]> {
  return triggerWebhooks(agencyId, 'booking.created', {
    id: booking.id,
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    customerPhone: booking.customerPhone,
    appointmentDate: booking.appointmentDateLabel,
    appointmentTime: booking.appointmentTime,
    services: booking.services,
    totalPrice: booking.totalPrice,
    status: booking.status,
  });
}

export async function triggerBookingUpdated(
  agencyId: mongoose.Types.ObjectId,
  booking: {
    id: string;
    status: string;
    updatedAt: string;
  },
): Promise<WebhookTriggerResult[]> {
  return triggerWebhooks(agencyId, 'booking.updated', {
    id: booking.id,
    status: booking.status,
    updatedAt: booking.updatedAt,
  });
}

export async function triggerBookingCancelled(
  agencyId: mongoose.Types.ObjectId,
  booking: {
    id: string;
    customerName: string;
    cancelledAt: string;
  },
): Promise<WebhookTriggerResult[]> {
  return triggerWebhooks(agencyId, 'booking.cancelled', {
    id: booking.id,
    customerName: booking.customerName,
    cancelledAt: booking.cancelledAt,
  });
}

export async function triggerCustomerCreated(
  agencyId: mongoose.Types.ObjectId,
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  },
): Promise<WebhookTriggerResult[]> {
  return triggerWebhooks(agencyId, 'customer.created', {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
  });
}

export async function triggerServiceCreated(
  agencyId: mongoose.Types.ObjectId,
  service: {
    id: string;
    name: string;
    price: number;
    category: string;
  },
): Promise<WebhookTriggerResult[]> {
  return triggerWebhooks(agencyId, 'service.created', {
    id: service.id,
    name: service.name,
    price: service.price,
    category: service.category,
  });
}