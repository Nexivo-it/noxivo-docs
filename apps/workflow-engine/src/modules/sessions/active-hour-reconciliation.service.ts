import { UsageCaptureService } from '../metering/capture.service.js';

export class SessionActiveHourReconciliationService {
  constructor(private readonly usageCapture: Pick<UsageCaptureService, 'captureSessionActiveHour'>) {}

  async reconcileActiveSessionHour(input: {
    agencyId: string;
    sessionId: string;
    observedAt?: Date;
  }): Promise<void> {
    await this.usageCapture.captureSessionActiveHour({
      agencyId: input.agencyId,
      occurredAt: input.observedAt ?? new Date()
    });
  }
}
