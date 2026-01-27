import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';
import axios from 'axios';

export interface WebhookEvent {
  type: string;
  resource: string;
  resourceId: string;
  data: any;
  timestamp: Date;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(private prisma: PrismaService) {}

  async createWebhook(data: {
    organizationId?: string;
    url: string;
    events: string[];
    headers?: Record<string, string>;
  }) {
    const secret = crypto.randomBytes(32).toString('hex');

    return this.prisma.webhook.create({
      data: {
        ...data,
        secret,
      },
    });
  }

  async triggerWebhook(event: WebhookEvent, organizationId?: string) {
    const webhooks = await this.prisma.webhook.findMany({
      where: {
        isActive: true,
        organizationId: organizationId || undefined,
        events: {
          has: event.type,
        },
      },
    });

    const deliveries = await Promise.allSettled(
      webhooks.map((webhook) => this.deliverWebhook(webhook, event)),
    );

    return deliveries;
  }

  private async deliverWebhook(webhook: any, event: WebhookEvent) {
    const payload = {
      id: crypto.randomUUID(),
      type: event.type,
      resource: event.resource,
      resourceId: event.resourceId,
      data: event.data,
      timestamp: event.timestamp.toISOString(),
    };

    const signature = this.generateSignature(JSON.stringify(payload), webhook.secret);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': signature,
      'X-Webhook-Id': webhook.id,
      ...(webhook.headers as Record<string, string> || {}),
    };

    try {
      const response = await axios.post(webhook.url, payload, {
        headers,
        timeout: 10000,
      });

      await this.prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          event: event.type,
          payload: payload as any,
          status: 'success',
          statusCode: response.status,
          response: JSON.stringify(response.data),
          attempts: 1,
          deliveredAt: new Date(),
        },
      });

      this.logger.log(`Webhook delivered successfully: ${webhook.id}`);
    } catch (error: any) {
      await this.prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          event: event.type,
          payload: payload as any,
          status: 'failed',
          statusCode: error.response?.status,
          response: error.message,
          attempts: 1,
        },
      });

      this.logger.error(`Webhook delivery failed: ${webhook.id}`, error);
      throw error;
    }
  }

  private generateSignature(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  async getWebhooks(organizationId?: string) {
    return this.prisma.webhook.findMany({
      where: {
        organizationId: organizationId || undefined,
      },
      include: {
        deliveries: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async getWebhookDeliveries(webhookId: string, limit = 50) {
    return this.prisma.webhookDelivery.findMany({
      where: { webhookId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
