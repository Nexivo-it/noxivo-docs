export function buildAuthPath(authBasePath: string | undefined, route: 'login' | 'signup'): string {
  const normalizedBasePath = (authBasePath && authBasePath.trim().length > 0 ? authBasePath : '/auth')
    .replace(/\/+$/, '');

  return `${normalizedBasePath}/${route}`;
}

export function buildInvitationSignupPath(authBasePath: string | undefined, invitationToken: string): string {
  const signupPath = buildAuthPath(authBasePath, 'signup');
  const searchParams = new URLSearchParams({ invitationToken });

  return `${signupPath}?${searchParams.toString()}`;
}
