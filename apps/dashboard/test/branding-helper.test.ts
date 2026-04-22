import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAgencyBrandingBySlug } from '../lib/branding';

describe('branding helper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads branding from workflow-engine dashboard-auth endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          agencyId: 'agency-id',
          agencyName: 'Acme Agency',
          agencySlug: 'acme',
          branding: {
            customDomain: null,
            logoUrl: null,
            primaryColor: '#4F46E5',
            supportEmail: 'support@acme.test',
            hidePlatformBranding: false,
          },
        }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await getAgencyBrandingBySlug('acme');

    expect(result).toMatchObject({
      agencyId: 'agency-id',
      agencyName: 'Acme Agency',
      agencySlug: 'acme',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/dashboard-auth/branding/acme',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('returns null when workflow-engine says slug is not found', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => JSON.stringify({ error: 'Not found' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await getAgencyBrandingBySlug('missing');

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/dashboard-auth/branding/missing',
      expect.objectContaining({ credentials: 'include' }),
    );
  });
});
