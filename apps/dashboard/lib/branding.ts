import { parseWhiteLabelConfig, type WhiteLabelConfig } from '@noxivo/contracts';
import { workflowEngineFetch } from './api/workflow-engine-client';

export interface AgencyBrandingPayload {
  agencyId: string;
  agencyName: string;
  agencySlug: string;
  branding: WhiteLabelConfig;
}

export async function getAgencyBrandingBySlug(agencySlug: string): Promise<AgencyBrandingPayload | null> {
  const normalizedSlug = agencySlug.trim().toLowerCase();
  if (!normalizedSlug) {
    return null;
  }

  try {
    const payload = await workflowEngineFetch<AgencyBrandingPayload>(
      `/api/v1/dashboard-auth/branding/${encodeURIComponent(normalizedSlug)}`,
    );

    return {
      agencyId: payload.agencyId,
      agencyName: payload.agencyName,
      agencySlug: payload.agencySlug,
      branding: parseWhiteLabelConfig(payload.branding),
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'Not found') {
      return null;
    }

    throw error;
  }
}
