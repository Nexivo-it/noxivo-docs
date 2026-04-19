import { describe, expect, it } from 'vitest';
import { buildAuthPath, buildInvitationSignupPath } from '../lib/auth/paths.js';

describe('auth path helpers', () => {
  it('builds branded auth paths without dropping the agency slug', () => {
    expect(buildAuthPath('/acme-agency/auth', 'login')).toBe('/acme-agency/auth/login');
    expect(buildAuthPath('/acme-agency/auth', 'signup')).toBe('/acme-agency/auth/signup');
  });

  it('falls back to the default auth namespace when no branded base is provided', () => {
    expect(buildAuthPath(undefined, 'login')).toBe('/auth/login');
    expect(buildAuthPath('', 'signup')).toBe('/auth/signup');
  });

  it('builds invite-aware signup paths without losing the branded base', () => {
    expect(buildInvitationSignupPath('/acme-agency/auth', 'invite-token')).toBe('/acme-agency/auth/signup?invitationToken=invite-token');
    expect(buildInvitationSignupPath(undefined, 'invite-token')).toBe('/auth/signup?invitationToken=invite-token');
  });
});
