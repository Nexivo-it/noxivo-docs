import { type MeteringCounterService } from './counter.service.js';

export class UsageCaptureService {
  constructor(private readonly counterService: Pick<MeteringCounterService, 'increment'>) {}

  private async incrementMetric(input: {
    agencyId: string;
    metric: 'inbound_message' | 'outbound_message' | 'plugin_execution' | 'ai_token_usage' | 'session_active_hour' | 'media_download';
    amount: number;
    occurredAt: Date | undefined;
  }): Promise<void> {
    await this.counterService.increment({
      agencyId: input.agencyId,
      metric: input.metric,
      amount: input.amount,
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {})
    });
  }

  async captureInboundMessage(input: { agencyId: string; occurredAt?: Date }): Promise<void> {
    await this.incrementMetric({
      agencyId: input.agencyId,
      metric: 'inbound_message',
      amount: 1,
      occurredAt: input.occurredAt
    });
  }

  async captureOutboundMessage(input: { agencyId: string; occurredAt?: Date }): Promise<void> {
    await this.incrementMetric({
      agencyId: input.agencyId,
      metric: 'outbound_message',
      amount: 1,
      occurredAt: input.occurredAt
    });
  }

  async capturePluginExecution(input: { agencyId: string; occurredAt?: Date }): Promise<void> {
    await this.incrementMetric({
      agencyId: input.agencyId,
      metric: 'plugin_execution',
      amount: 1,
      occurredAt: input.occurredAt
    });
  }

  async captureAiTokenUsage(input: { agencyId: string; tokenCount: number; occurredAt?: Date }): Promise<void> {
    await this.incrementMetric({
      agencyId: input.agencyId,
      metric: 'ai_token_usage',
      amount: Math.max(1, Math.floor(input.tokenCount)),
      occurredAt: input.occurredAt
    });
  }

  async captureSessionActiveHour(input: { agencyId: string; occurredAt?: Date }): Promise<void> {
    await this.incrementMetric({
      agencyId: input.agencyId,
      metric: 'session_active_hour',
      amount: 1,
      occurredAt: input.occurredAt
    });
  }

  async captureMediaDownload(input: { agencyId: string; occurredAt?: Date }): Promise<void> {
    await this.incrementMetric({
      agencyId: input.agencyId,
      metric: 'media_download',
      amount: 1,
      occurredAt: input.occurredAt
    });
  }
}
