import mongoose from 'mongoose';
import { MessagingClusterModel, MessagingSessionBindingModel, AgencyModel, TenantModel } from '@noxivo/database';

await mongoose.connect('mongodb://localhost:27017/noxivo');

const agency = await AgencyModel.findOne({ slug: 'platform' });
const tenant = await TenantModel.findOne({ agencyId: agency._id });

console.log('Agency:', agency._id);
console.log('Tenant:', tenant._id);

const cluster = await MessagingClusterModel.findOneAndUpdate(
  { name: 'prod-messaging' },
  {
    name: 'prod-messaging',
    region: 'eu-west-1',
    baseUrl: 'https://api-workflow-engine.noxivo.app',
    dashboardUrl: 'https://noxivo.app',
    swaggerUrl: 'https://api-workflow-engine.noxivo.app/api',
    capacity: 100,
    activeSessionCount: 0,
    status: 'active',
    secretRefs: { webhookSecretVersion: 'v1' }
  },
  { upsert: true, new: true }
);
console.log('Cluster:', cluster._id);

const binding = await MessagingSessionBindingModel.findOneAndUpdate(
  { messagingSessionName: 'dev-agency-whatsapp' },
  {
    agencyId: agency._id,
    tenantId: tenant._id,
    accountName: 'dev-agency',
    clusterId: cluster._id,
    sessionName: 'dev-agency-whatsapp',
    messagingSessionName: 'dev-agency-whatsapp',
    status: 'active'
  },
  { upsert: true, new: true }
);
console.log('Binding:', binding._id);

console.log('✅ Setup complete!');
process.exit(0);