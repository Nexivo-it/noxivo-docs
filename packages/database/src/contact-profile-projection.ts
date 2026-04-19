import { ContactProfileModel } from './models/contact-profile.js';

export interface ContactProfileProjectionInput {
  agencyId: string;
  tenantId: string;
  contactId: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: Date;
  contactName?: string | null;
  contactPhone?: string | null;
}

export async function projectContactProfileFromMessage(input: ContactProfileProjectionInput) {
  const timestampField = input.role === 'user' ? 'lastInboundAt' : 'lastOutboundAt';
  const counterField = input.role === 'user' ? 'inboundMessages' : 'outboundMessages';

  return ContactProfileModel.findOneAndUpdate(
    {
      tenantId: input.tenantId,
      contactId: input.contactId
    },
    {
      $setOnInsert: {
        agencyId: input.agencyId,
        tenantId: input.tenantId,
        contactId: input.contactId,
        firstSeenAt: input.timestamp
      },
      $set: {
        ...(input.contactName ? { contactName: input.contactName } : {}),
        ...(input.contactPhone ? { contactPhone: input.contactPhone } : {}),
        [timestampField]: input.timestamp
      },
      $inc: {
        totalMessages: 1,
        [counterField]: 1
      }
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  ).lean();
}
