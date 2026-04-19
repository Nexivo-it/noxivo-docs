import { UsageCaptureService } from '../metering/capture.service.js';

export class MediaDownloadService {
  constructor(private readonly usageCapture: Pick<UsageCaptureService, 'captureMediaDownload'>) {}

  async recordDownload(input: {
    agencyId: string;
    mediaUrl: string;
    downloadedAt?: Date;
  }): Promise<void> {
    await this.usageCapture.captureMediaDownload({
      agencyId: input.agencyId,
      occurredAt: input.downloadedAt ?? new Date()
    });
  }
}
