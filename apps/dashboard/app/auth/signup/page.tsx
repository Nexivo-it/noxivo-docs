import { redirect } from 'next/navigation';
import { SignupForm } from '../../../components/signup-form';
import { getOptionalCurrentSession } from '../../../lib/auth/current-user';

export const dynamic = 'force-dynamic';

export default async function SignupPage({
  searchParams
}: {
  searchParams?: Promise<{ invitationToken?: string }>;
}) {
  const session = await getOptionalCurrentSession();

  if (session) {
    redirect('/dashboard');
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  return <SignupForm invitationToken={resolvedSearchParams?.invitationToken ?? null} />;
}
