import { redirect } from 'next/navigation';

export default function AdminSessionsRedirectPage() {
  redirect('/dashboard/admin/messaging');
}
