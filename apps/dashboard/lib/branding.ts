import { AgencyModel } from '@noxivo/database';
import { parseWhiteLabelConfig, type WhiteLabelConfig } from '@noxivo/contracts';
import dbConnect from './mongodb';

export interface AgencyBrandingPayload {
  agencyId: string;
  agencyName: string;
  agencySlug: string;
  branding: WhiteLabelConfig;
}

export async function getAgencyBrandingBySlug(agencySlug: string): Promise<AgencyBrandingPayload | null> {
  await dbConnect();
  const agency = await AgencyModel.findOne({ slug: agencySlug }).lean();

  if (!agency) {
    return null;
  }

  return {
    agencyId: agency._id.toString(),
    agencyName: agency.name,
    agencySlug: agency.slug,
    branding: parseWhiteLabelConfig(agency.whiteLabelDefaults)
  };
}
