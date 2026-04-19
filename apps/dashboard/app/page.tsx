import { redirect } from 'next/navigation';
import { getOptionalCurrentSession } from '../lib/auth/current-user';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await getOptionalCurrentSession();

  if (session) {
    redirect('/dashboard');
  }

  // No landing page exists anymore per USER_REQUEST
  redirect('/auth/login');
}
