import mongoose from 'mongoose';
import { AgencyModel } from './models/agency.js';
import { TenantModel } from './models/tenant.js';
import { UserModel } from './models/user.js';
import { hashPassword } from './auth-utils.js';

/**
 * Ensures the platform initial data exists (Agency, Owner, Default Tenant).
 * This is designed to be called on application startup in production environments.
 */
export async function ensurePlatformSeeds() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.warn('⚠️ MONGODB_URI not found. Skipping platform seeds.');
    return;
  }

  // Use existing connection if available, otherwise connect
  const isConnected = mongoose.connection.readyState === 1;
  if (!isConnected) {
    await mongoose.connect(mongoUri);
  }

  try {
    console.log('🌱 Checking platform initial data...');

    // 1. Ensure Platform Agency exists
    const agencyId = new mongoose.Types.ObjectId('67b50e2ddc9943efb3870526'); // Static ID for platform agency
    await AgencyModel.updateOne(
      { _id: agencyId },
      {
        $setOnInsert: {
          name: 'Noxivo Platform',
          slug: 'noxivo-platform',
          plan: 'enterprise',
          status: 'active',
          usageLimits: {
            tenants: 1000,
            activeSessions: 5000
          }
        }
      },
      { upsert: true }
    );
    console.log('✅ Platform Agency ensured');

    // 2. Ensure a default tenant for the platform agency
    const tenantUpdate = await TenantModel.findOneAndUpdate(
      { agencyId, slug: 'platform-main' },
      {
        $setOnInsert: {
          name: 'Main Platform Workspace',
          region: 'us-east-1',
          status: 'active',
          billingMode: 'agency_pays'
        }
      },
      { upsert: true, new: true }
    );
    const tenantId = tenantUpdate!._id;
    console.log('✅ Platform Tenant ensured');

    // 3. Ensure Platform Owner account exists and is correctly configured
    const ownerEmail = process.env.PLATFORM_OWNER_EMAIL || 'owner@example.com';
    const ownerPassword = process.env.PLATFORM_OWNER_PASSWORD || 'StrongPass1!';
    
    const existingOwner = await UserModel.findOne({ email: ownerEmail });

    if (!existingOwner) {
      const passwordHash = await hashPassword(ownerPassword);
      await UserModel.create({
        agencyId,
        email: ownerEmail,
        fullName: 'Platform Owner',
        passwordHash,
        role: 'owner',
        status: 'active',
        defaultTenantId: tenantId,
        tenantIds: [tenantId],
        memberships: [{
          agencyId,
          role: 'platform_admin',
          scopeRole: 'owner',
          tenantIds: [tenantId],
          defaultTenantId: tenantId
        }]
      });
      console.log(`✅ Platform Owner created: ${ownerEmail}`);
    } else {
      // Self-healing: Ensure existing owner has the correct context
      await UserModel.updateOne(
        { _id: existingOwner._id },
        {
          $set: {
            agencyId,
            defaultTenantId: tenantId,
          },
          $addToSet: {
            tenantIds: tenantId
          }
        }
      );

      // Ensure membership exists
      const hasMembership = existingOwner.memberships?.some(m => 
        m.agencyId.toString() === agencyId.toString()
      );

      if (!hasMembership) {
        await UserModel.updateOne(
          { _id: existingOwner._id },
          {
            $push: {
              memberships: {
                agencyId,
                role: 'platform_admin',
                scopeRole: 'owner',
                tenantIds: [tenantId],
                defaultTenantId: tenantId
              }
            }
          }
        );
      }
      console.log(`✅ Platform Owner verified and repaired if necessary: ${ownerEmail}`);
    }
    console.log('🌱 Platform seeding process complete.');
  } catch (error) {
    console.error('❌ Failed to ensure platform seeds:', error);
    // We don't exit the process here to allow the app to potentially start anyway,
    // though most likely it will fail later if DB is unreachable.
  } finally {
    // Only disconnect if we were the ones who connected
    if (!isConnected) {
      await mongoose.disconnect();
    }
  }
}
