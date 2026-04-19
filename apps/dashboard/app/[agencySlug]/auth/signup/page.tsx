import { notFound, redirect } from 'next/navigation';
import { SignupForm } from '../../../../components/signup-form';
import { getOptionalCurrentSession } from '../../../../lib/auth/current-user';
import { getAgencyBrandingBySlug } from '../../../../lib/branding';

export const dynamic = 'force-dynamic';

interface AgencySignupPageProps {
  params: Promise<{ agencySlug: string }>;
  searchParams?: Promise<{ invitationToken?: string }>;
}

export default async function AgencySignupPage({ params, searchParams }: AgencySignupPageProps) {
  const session = await getOptionalCurrentSession();

  if (session) {
    redirect('/dashboard');
  }

  const { agencySlug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const agencyBranding = await getAgencyBrandingBySlug(agencySlug);

  if (!agencyBranding) {
    notFound();
  }

  return (
    <SignupForm
      brandName={agencyBranding.agencyName}
      brandPrimaryColor={agencyBranding.branding.primaryColor}
      supportEmail={agencyBranding.branding.supportEmail}
      authBasePath={`/${agencySlug}/auth`}
      invitationToken={resolvedSearchParams?.invitationToken ?? null}
    />
  );
}
