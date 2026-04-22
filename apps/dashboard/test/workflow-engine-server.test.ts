import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { cookiesMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}));

import { workflowEngineServerFetch } from '../lib/api/workflow-engine-server';

describe('workflow-engine-server', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
    cookiesMock.mockResolvedValue({
      getAll: () => [
        { name: 'noxivo_session', value: 'session=value' },
        { name: 'nf_agency_context', value: 'agency 1' },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards request cookies to workflow engine fetches', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ agencies: [] }),
    });

    await workflowEngineServerFetch<{ agencies: [] }>('/api/v1/agencies');

    const call = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Headers }];
    expect(call[0]).toBe('http://localhost:3001/api/v1/agencies');
    expect(call[1].headers.get('cookie')).toBe('noxivo_session=session%3Dvalue; nf_agency_context=agency%201');
    expect(call[1].headers.get('accept')).toBe('application/json');
    expect(call[1].cache).toBe('no-store');
  });
});
