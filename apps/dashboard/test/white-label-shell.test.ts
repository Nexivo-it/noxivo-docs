import { describe, expect, it } from 'vitest';
import {
  resolveEffectiveBranding
} from '../lib/white-label.js';
import {
  assertProxyAccess,
  createProxyRequestInit
} from '../lib/messaging-proxy-utils.js';

describe('White-label shell and MessagingProvider proxy', () => {
  it('agency branding defaults are applied to the layout', () => {
    const branding = resolveEffectiveBranding({
      agencyDefaults: {
        customDomain: 'Brand.Example.com',
        logoUrl: 'https://cdn.example.com/logo.png',
        primaryColor: '#6366F1',
        supportEmail: 'help@agency.example',
        hidePlatformBranding: false
      }
    });

    expect(branding).toMatchObject({
      customDomain: 'brand.example.com',
      logoUrl: 'https://cdn.example.com/logo.png',
      primaryColor: '#6366F1',
      supportEmail: 'help@agency.example',
      hidePlatformBranding: false
    });
  });

  it('tenant overrides win over agency defaults for supported fields', () => {
    const branding = resolveEffectiveBranding({
      agencyDefaults: {
        logoUrl: 'https://cdn.example.com/default-logo.png',
        primaryColor: '#6366F1',
        supportEmail: 'help@agency.example',
        hidePlatformBranding: false
      },
      tenantOverrides: {
        logoUrl: 'https://cdn.example.com/tenant-logo.png',
        primaryColor: '#4F46E5',
        hidePlatformBranding: true
      }
    });

    expect(branding.logoUrl).toBe('https://cdn.example.com/tenant-logo.png');
    expect(branding.primaryColor).toBe('#4F46E5');
    expect(branding.hidePlatformBranding).toBe(true);
  });

  it('MessagingProvider proxy rejects cross-agency and cross-tenant access', () => {
    expect(() => {
      assertProxyAccess({
        actorAgencyId: 'agency-a',
        actorTenantId: 'tenant-a',
        resourceAgencyId: 'agency-b',
        resourceTenantId: 'tenant-a'
      });
    }).toThrow(/cross-agency/i);

    expect(() => {
      assertProxyAccess({
        actorAgencyId: 'agency-a',
        actorTenantId: 'tenant-a',
        resourceAgencyId: 'agency-a',
        resourceTenantId: 'tenant-b'
      });
    }).toThrow(/cross-tenant/i);
  });

  it('proxied dashboard and swagger requests inject server-side auth only', () => {
    const dashboardProxy = createProxyRequestInit({
      baseUrl: 'http://messaging.test',
      instanceId: 'instance-1',
      path: ['dashboard'],
      method: 'GET',
      incomingHeaders: new Headers({
        authorization: 'Bearer client-token',
        'x-trace-id': 'trace-dashboard'
      }),
      serverAuthToken: 'server-basic-token'
    });

    const swaggerProxy = createProxyRequestInit({
      baseUrl: 'https://messaging.internal',
      instanceId: 'instance-1',
      path: ['swagger'],
      method: 'GET',
      incomingHeaders: new Headers({
        authorization: 'Bearer client-token',
        'x-trace-id': 'trace-swagger'
      }),
      serverAuthToken: 'server-basic-token'
    });

    expect(dashboardProxy.init.headers).toBeInstanceOf(Headers);
    expect(swaggerProxy.init.headers).toBeInstanceOf(Headers);

    const dashboardHeaders = dashboardProxy.init.headers as Headers;
    const swaggerHeaders = swaggerProxy.init.headers as Headers;

    expect(dashboardHeaders.get('authorization')).toBe('Basic server-basic-token');
    expect(swaggerHeaders.get('authorization')).toBe('Basic server-basic-token');
    expect(dashboardHeaders.get('authorization')).not.toContain('client-token');
    expect(swaggerHeaders.get('authorization')).not.toContain('client-token');
    expect(dashboardHeaders.get('x-trace-id')).toBe('trace-dashboard');
    expect(swaggerHeaders.get('x-trace-id')).toBe('trace-swagger');
  });
});
