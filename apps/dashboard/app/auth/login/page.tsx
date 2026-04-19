import { redirect } from 'next/navigation';
import { LoginForm } from '../../../components/login-form';
import { getOptionalCurrentSession } from '../../../lib/auth/current-user';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await getOptionalCurrentSession();

  if (session) {
    redirect('/dashboard');
  }

  return <LoginForm />;
}
