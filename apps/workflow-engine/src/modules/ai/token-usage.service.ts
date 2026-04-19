import { UsageCaptureService } from '../metering/capture.service.js';

export class AiTokenUsageService {
  constructor(private readonly usageCapture: Pick<UsageCaptureService, 'captureAiTokenUsage'>) {}

  async recordTokenUsage(input: {
    agencyId: string;
    tokenCount: number;
    usedAt?: Date;
  }): Promise<void> {
    await this.usageCapture.captureAiTokenUsage({
      agencyId: input.agencyId,
      tokenCount: input.tokenCount,
      occurredAt: input.usedAt ?? new Date()
    });
  }
}
