import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { RoleModel, UserModel, AgencyModel, TenantModel } from '../src/index';
import { connectDatabaseTestDb, disconnectDatabaseTestDb, resetDatabaseTestDb } from './helpers/mongo-memory';

describe('RBAC Data Models', () => {
  beforeAll(async () => {
    await connectDatabaseTestDb({ dbName: 'rbac-models-test' });
  });

  afterAll(async () => {
    await disconnectDatabaseTestDb();
  });

  beforeEach(async () => {
    await resetDatabaseTestDb();
  });

  describe('RoleModel', () => {
    it('should create a custom role with permissions', async () => {
      const agencyId = new mongoose.Types.ObjectId();
      const role = await RoleModel.create({
        name: 'Support Agent',
        type: 'custom',
        agencyId,
        permissions: [
          { resource: 'conversations', action: 'read' },
          { resource: 'conversations', action: 'update' }
        ]
      });

      expect(role.name).toBe('Support Agent');
      expect(role.type).toBe('custom');
      expect(role.permissions).toHaveLength(2);
      expect(role.permissions[0].resource).toBe('conversations');
    });

    it('should allow system roles without agencyId', async () => {
      const role = await RoleModel.create({
        name: 'Platform Auditor',
        type: 'system',
        permissions: [{ resource: 'billing', action: 'read' }]
      });

      expect(role.agencyId).toBeUndefined();
      expect(role.type).toBe('system');
    });
  });

  describe('UserModel memberships', () => {
    it('should support multiple agency memberships', async () => {
      const agency1Id = new mongoose.Types.ObjectId();
      const agency2Id = new mongoose.Types.ObjectId();
      const tenantId = new mongoose.Types.ObjectId();
      const customRoleId = new mongoose.Types.ObjectId();

      const user = await UserModel.create({
        email: 'multi@example.com',
        fullName: 'Multi User',
        passwordHash: 'hash',
        status: 'active',
        memberships: [
          { agencyId: agency1Id, role: 'agency_owner' },
          { agencyId: agency2Id, role: 'agency_admin', customRoleId }
        ]
      });

      expect(user.memberships).toHaveLength(2);
      expect(user.memberships[0].agencyId.toString()).toBe(agency1Id.toString());
      expect(user.memberships[1].role).toBe('agency_admin');
      expect(user.memberships[1].customRoleId?.toString()).toBe(customRoleId.toString());
    });

    it('should maintain backward compatibility with legacy fields', async () => {
      const agencyId = new mongoose.Types.ObjectId();
      const tenantId = new mongoose.Types.ObjectId();

      const user = await UserModel.create({
        email: 'legacy@example.com',
        fullName: 'Legacy User',
        passwordHash: 'hash',
        status: 'active',
        agencyId,
        defaultTenantId: tenantId,
        role: 'agency_member'
      });

      const found = await UserModel.findOne({ email: 'legacy@example.com' });
      expect(found?.agencyId?.toString()).toBe(agencyId.toString());
      expect(found?.role).toBe('agency_member');
    });

    it('should index memberships for efficient lookup', async () => {
      const agencyId = new mongoose.Types.ObjectId();
      
      await UserModel.create({
        email: 'search@example.com',
        fullName: 'Search User',
        passwordHash: 'hash',
        memberships: [{ agencyId, role: 'agency_admin' }]
      });

      const found = await UserModel.findOne({
        'memberships.agencyId': agencyId,
        email: 'search@example.com'
      });

      expect(found).not.toBeNull();
      expect(found?.fullName).toBe('Search User');
    });

    it('supports tier-2 client scoped memberships with tenantIds', async () => {
      const agencyId = new mongoose.Types.ObjectId();
      const tenantId = new mongoose.Types.ObjectId();

      const user = await UserModel.create({
        email: 'client-admin@example.com',
        fullName: 'Client Admin',
        passwordHash: 'hash',
        status: 'active',
        role: 'client_admin',
        memberships: [
          {
            agencyId,
            role: 'client_admin',
            tenantIds: [tenantId],
            defaultTenantId: tenantId,
          },
        ],
      });

      expect(user.role).toBe('client_admin');
      expect(user.memberships).toHaveLength(1);
      expect(user.memberships[0].role).toBe('client_admin');
      expect(user.memberships[0].tenantIds.map((id) => id.toString())).toEqual([tenantId.toString()]);
      expect(user.memberships[0].defaultTenantId?.toString()).toBe(tenantId.toString());
    });

    it('supports owner + agency admin + agent normalized roles', async () => {
      const agencyId = new mongoose.Types.ObjectId();
      const tenantId = new mongoose.Types.ObjectId();

      const user = await UserModel.create({
        email: 'owner-role@example.com',
        fullName: 'Owner Role',
        passwordHash: 'hash',
        status: 'active',
        role: 'owner',
        memberships: [
          { agencyId, role: 'agency_admin' },
          { agencyId, role: 'agent', tenantIds: [tenantId], defaultTenantId: tenantId },
        ],
      });

      expect(user.role).toBe('owner');
      expect(user.memberships[0].role).toBe('agency_admin');
      expect(user.memberships[1].role).toBe('agent');
    });
  });
});
