import { notFound, redirect } from 'next/navigation';
import { LoginForm } from '../../../../components/login-form';
import { getOptionalCurrentSession } from '../../../../lib/auth/current-user';
import { getAgencyBrandingBySlug } from '../../../../lib/branding';

export const dynamic = 'force-dynamic';

interface AgencyLoginPageProps {
  params: Promise<{ agencySlug: string }>;
}

export default async function AgencyLoginPage({ params }: AgencyLoginPageProps) {
  const session = await getOptionalCurrentSession();

  if (session) {
    redirect('/dashboard');
  }

  const { agencySlug } = await params;
  const agencyBranding = await getAgencyBrandingBySlug(agencySlug);

  if (!agencyBranding) {
    notFound();
  }

  return (
    <LoginForm
      brandName={agencyBranding.agencyName}
      brandPrimaryColor={agencyBranding.branding.primaryColor}
      supportEmail={agencyBranding.branding.supportEmail}
      authBasePath={`/${agencySlug}/auth`}
    />
  );
}
