import { describe, expect, it } from 'vitest';
import { GET as getHealthLive } from '../app/api/health/live/route.js';

describe('dashboard health live route', () => {
  it('returns 200 without requiring database connectivity', async () => {
    const response = await getHealthLive();
    const payload = await response.json() as {
      service: string;
      status: string;
    };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      service: 'noxivo-dashboard',
      status: 'alive'
    });
  });
});
