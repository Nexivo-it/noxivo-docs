import mongoose from 'mongoose';
import { AgencyModel } from '@noxivo/database';

export async function createSpaAgency(seed: { name: string; slug: string }) {
  return AgencyModel.create({
    name: seed.name,
    slug: seed.slug,
    plan: 'reseller_pro',
    billingOwnerUserId: new mongoose.Types.ObjectId(),
    whiteLabelDefaults: {
      customDomain: null,
      logoUrl: null,
      primaryColor: '#ec4899',
      supportEmail: 'ops@spa.local',
      hidePlatformBranding: false,
    },
    usageLimits: {
      tenants: 10,
      activeSessions: 50,
    },
    status: 'active',
  });
}
