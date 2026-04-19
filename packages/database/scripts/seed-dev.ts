import process from 'process';
import mongoose from 'mongoose';
import { AgencyModel } from '../src/models/agency.js';
import { TenantModel } from '../src/models/tenant.js';
import { ConversationModel } from '../src/models/conversation.js';
import { MessageModel } from '../src/models/message.js';
import { UserModel } from '../src/models/user.js';

const MONGODB_URI_DEFAULT = process.env.MONGODB_URI || 'mongodb://localhost:27017/noxivo';

// Static IDs for consistent dev testing
export const MOCK_AGENCY_ID = new mongoose.Types.ObjectId('67ab1234567890abcdef1111');
export const MOCK_TENANT_ID = new mongoose.Types.ObjectId('67ab1234567890abcdef2222');
export const MOCK_USER_ID = new mongoose.Types.ObjectId('67ab1234567890abcdef3333');

export async function seed(uri: string = MONGODB_URI_DEFAULT) {
  console.log(`🌱 Seeding database at ${uri}...`);
  const conn = await mongoose.connect(uri);

  try {
    // 1. Clean up existing dev data
    await AgencyModel.deleteOne({ _id: MOCK_AGENCY_ID });
    await TenantModel.deleteOne({ _id: MOCK_TENANT_ID });
    await ConversationModel.deleteMany({ tenantId: MOCK_TENANT_ID });
    await MessageModel.deleteMany({ tenantId: MOCK_TENANT_ID });
    // Delete all seeded users so re-runs are fully idempotent
    await UserModel.deleteMany({
      _id: {
        $in: [
          MOCK_USER_ID,
          new mongoose.Types.ObjectId('67ab1234567890abcdef4444'),
          new mongoose.Types.ObjectId('67ab1234567890abcdef5555'),
        ],
      },
    });

    // 2. Create Agency
    await AgencyModel.create({
      _id: MOCK_AGENCY_ID,
      name: 'Noxivo Dev Agency',
      slug: 'dev-agency',
      plan: 'enterprise',
      billingOwnerUserId: MOCK_USER_ID,
      status: 'active',
      whiteLabelDefaults: {
        customDomain: null,
        logoUrl: null,
        primaryColor: '#00D1FF',
        supportEmail: 'support@dev.noxivo.saas',
        hidePlatformBranding: false,
      },
      usageLimits: {
        tenants: 10,
        activeSessions: 50,
      },
    });
    console.log('✅ Agency created');

    // 3. Create Tenant
    await TenantModel.create({
      _id: MOCK_TENANT_ID,
      agencyId: MOCK_AGENCY_ID,
      name: 'Acme Corp Sample Tenant',
      slug: 'acme-corp',
      region: 'eu-west-1',
      status: 'active',
      billingMode: 'agency_pays',
    });
    console.log('✅ Tenant created');

    // 4. Create Users
    // Dynamically generate the hash to ensure it matches current app logic
    const { scrypt } = await import('crypto');
    const { promisify } = await import('util');
    const scryptAsync = promisify(scrypt);
    const salt = '56c078044733475f458e38f97b45f430'; 
    const derivedKey = await scryptAsync('StrongPass1!', salt, 64) as Buffer;
    const dynamicHash = `${salt}:${derivedKey.toString('hex')}`;

    console.log(`🔑 Generating hashes...`);
    
    // Platform Admin (Main Owner)
    await UserModel.create({
      _id: MOCK_USER_ID,
      agencyId: MOCK_AGENCY_ID,
      defaultTenantId: MOCK_TENANT_ID,
      tenantIds: [MOCK_TENANT_ID],
      email: 'owner@example.com',
      fullName: 'Platform Admin',
      passwordHash: dynamicHash,
      role: 'platform_admin', // Updated from agency_owner
      status: 'active',
      lastLoginAt: new Date(),
    });
    console.log('✅ User created: owner@example.com (Platform Admin)');

    // Agency Admin
    await UserModel.create({
      _id: new mongoose.Types.ObjectId('67ab1234567890abcdef4444'),
      agencyId: MOCK_AGENCY_ID,
      defaultTenantId: MOCK_TENANT_ID,
      tenantIds: [MOCK_TENANT_ID],
      email: 'admin@example.com',
      fullName: 'Agency Admin',
      passwordHash: dynamicHash,
      role: 'agency_admin',
      status: 'active',
    });
    console.log('✅ User created: admin@example.com (Agency Admin)');

    // Normal User
    await UserModel.create({
      _id: new mongoose.Types.ObjectId('67ab1234567890abcdef5555'),
      agencyId: MOCK_AGENCY_ID,
      defaultTenantId: MOCK_TENANT_ID,
      tenantIds: [MOCK_TENANT_ID],
      email: 'user@example.com',
      fullName: 'Normal User',
      passwordHash: dynamicHash,
      role: 'agency_member',
      status: 'active',
    });
    console.log('✅ User created: user@example.com (Normal User)');
    console.log(`   Internal DB: ${conn.connection.db?.databaseName}`);
    console.log(`   Collection: ${UserModel.collection.name}`);


    console.log('\n🚀 Database seeding complete!');
    console.log(`Agency ID: ${MOCK_AGENCY_ID}`);
    console.log(`Tenant ID: ${MOCK_TENANT_ID}`);

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    await conn.disconnect();
  }
}

// Support standalone execution
if (process.argv[1]?.includes('seed-dev.ts')) {
  seed().catch(console.error);
}
