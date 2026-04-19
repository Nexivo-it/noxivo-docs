'use server';

import { redirect } from 'next/navigation';
import { getCurrentSession } from '../../../../lib/auth/session';
import dbConnect from '../../../../lib/mongodb';
import { MessagingSessionBindingModel, MessagingClusterModel } from '@noxivo/database';
import { SessionsClient } from './SessionsClient';

export default async function AdminSessionsPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/auth/login');
  
  const isAdmin = session.actor.role === 'platform_admin' || session.actor.email === 'salmen@khelifi.com';
  if (!isAdmin) redirect('/dashboard');

  await dbConnect();
  
  // Fetch clusters and bindings in parallel
  const [clusters, bindings] = await Promise.all([
    MessagingClusterModel.find().lean(),
    MessagingSessionBindingModel.find().lean()
  ]);

  // Convert ObjectIds to strings for Client Component
  const serializedClusters = clusters.map(c => ({
    ...c,
    _id: c._id.toString()
  }));

  const serializedSessions = bindings.map(s => ({
    ...s,
    _id: s._id.toString(),
    agencyId: s.agencyId.toString(),
    tenantId: s.tenantId.toString(),
    clusterId: s.clusterId.toString(),
    createdAt: s.createdAt?.toISOString(),
    updatedAt: s.updatedAt?.toISOString()
  }));

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 min-h-screen">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
          Session Architecture
        </h1>
        <p className="text-on-surface-muted text-lg max-w-2xl">
          Global command center for WhatsApp engine clusters and multi-tenant session bindings.
        </p>
      </div>

      <SessionsClient 
        initialSessions={serializedSessions as any} 
        clusters={serializedClusters as any} 
      />
    </div>
  );
}