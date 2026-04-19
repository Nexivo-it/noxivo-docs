import { CrmActivityEventModel } from '@noxivo/database';
import {
  type CrmActivityEvent,
  CrmActivityEventSchema,
  type CrmActivityType,
  type CrmProvider
} from '@noxivo/contracts';

export interface ProjectCrmActivityInput {
  agencyId: string;
  tenantId: string;
  contactId: string;
  provider: CrmProvider;
  type: CrmActivityType;
  occurredAt?: Date;
  summary: string;
  metadata?: Record<string, unknown>;
}

export class CrmActivityProjectionService {
  async project(input: ProjectCrmActivityInput) {
    const parsed = CrmActivityEventSchema.parse({
      ...input,
      occurredAt: input.occurredAt ?? new Date(),
      metadata: input.metadata ?? {}
    });

    return CrmActivityEventModel.create(parsed as CrmActivityEvent);
  }
}
