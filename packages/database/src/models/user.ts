import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

export const LegacyUserRoleValues = [
  'platform_admin',
  'agency_owner',
  'agency_admin',
  'agency_member',
  'viewer',
] as const;
export type LegacyUserRole = (typeof LegacyUserRoleValues)[number];

export const ScopeRoleValues = ['owner', 'agency_admin', 'client_admin', 'agent', 'developer'] as const;
export type ScopeRole = (typeof ScopeRoleValues)[number];

export const SupportedUserRoleValues = [...LegacyUserRoleValues, ...ScopeRoleValues] as const;
export type SupportedUserRole = (typeof SupportedUserRoleValues)[number];

export function isSupportedUserRole(value: unknown): value is SupportedUserRole {
  return typeof value === 'string' && (SupportedUserRoleValues as readonly string[]).includes(value);
}

export function normalizeStoredUserRole(role: string | null | undefined): ScopeRole {
  switch (role) {
    case 'owner':
    case 'platform_admin':
      return 'owner';
    case 'agency_owner':
    case 'agency_admin':
      return 'agency_admin';
    case 'client_admin':
      return 'client_admin';
    case 'developer':
      return 'developer';
    case 'agent':
    case 'agency_member':
    case 'viewer':
      return 'agent';
    default:
      return 'agent';
  }
}

export function mapScopeRoleToLegacyRole(scopeRole: ScopeRole): LegacyUserRole {
  switch (scopeRole) {
    case 'owner':
      return 'platform_admin';
    case 'agency_admin':
      return 'agency_admin';
    case 'client_admin':
    case 'agent':
      return 'agency_member';
    default:
      return 'agency_member';
  }
}

function normalizeUniqueObjectIds(values: mongoose.Types.ObjectId[]): mongoose.Types.ObjectId[] {
  const deduped: mongoose.Types.ObjectId[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const key = value.toString();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(value);
  }

  return deduped;
}

const AgencyMembershipSchema = new Schema({
  agencyId: {
    type: Schema.Types.ObjectId,
    ref: 'Agency',
    required: true
  },
  role: {
    type: String,
    required: true,
    enum: SupportedUserRoleValues,
    default: 'agency_member'
  },
  scopeRole: {
    type: String,
    required: false,
    enum: ScopeRoleValues
  },
  tenantIds: {
    type: [{
      type: Schema.Types.ObjectId,
      ref: 'Tenant'
    }],
    default: []
  },
  defaultTenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    required: false
  },
  customRoleId: {
    type: Schema.Types.ObjectId,
    ref: 'Role',
    required: false
  }
}, { _id: false });

const UserSchema = new Schema({
  // Legacy fields (optional now)
  agencyId: {
    type: Schema.Types.ObjectId,
    ref: 'Agency',
    required: false,
    index: true
  },
  defaultTenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    required: false,
    index: true
  },
  tenantIds: {
    type: [{
      type: Schema.Types.ObjectId,
      ref: 'Tenant'
    }],
    default: []
  },
  role: {
    type: String,
    required: false,
    enum: SupportedUserRoleValues,
    default: 'agency_owner'
  },
  
  // New hybrid schema fields
  memberships: {
    type: [AgencyMembershipSchema],
    default: []
  },
  
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    maxlength: 160
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 120
  },
  passwordHash: {
    type: String,
    required: true,
    minlength: 1
  },
  status: {
    type: String,
    required: true,
    enum: ['active', 'suspended', 'pending'],
    default: 'active'
  },
  lastLoginAt: {
    type: Date,
    default: null
  }
}, {
  collection: 'users',
  timestamps: true
});

type UserMembershipDocument = {
  agencyId: mongoose.Types.ObjectId;
  role: SupportedUserRole;
  scopeRole?: ScopeRole;
  tenantIds?: mongoose.Types.ObjectId[];
  defaultTenantId?: mongoose.Types.ObjectId;
  customRoleId?: mongoose.Types.ObjectId;
};

type UserDocumentForNormalization = {
  role?: SupportedUserRole;
  agencyId?: mongoose.Types.ObjectId;
  defaultTenantId?: mongoose.Types.ObjectId;
  tenantIds?: mongoose.Types.ObjectId[];
  memberships?: UserMembershipDocument[];
};

UserSchema.pre('validate', function normalizeMemberships(next) {
  const user = this as unknown as UserDocumentForNormalization;
  const roleScope = normalizeStoredUserRole(user.role ?? null);
  const legacyTenantIds = normalizeUniqueObjectIds(user.tenantIds ?? []);
  const legacyDefaultTenantId = user.defaultTenantId;

  if ((user.memberships?.length ?? 0) === 0 && user.agencyId) {
    const membership: UserMembershipDocument = {
      agencyId: user.agencyId,
      role: user.role ?? 'agency_owner',
      scopeRole: roleScope,
      tenantIds: legacyTenantIds
    };
    if (legacyDefaultTenantId) {
      membership.defaultTenantId = legacyDefaultTenantId;
    }

    user.memberships = [{
      ...membership
    }];
    next();
    return;
  }

  const normalizedMemberships = (user.memberships ?? []).map((membership) => {
    const scopeRole = normalizeStoredUserRole(membership.scopeRole ?? membership.role);
    const membershipRole = isSupportedUserRole(membership.role)
      ? membership.role
      : mapScopeRoleToLegacyRole(scopeRole);

    const rawTenantIds = normalizeUniqueObjectIds(membership.tenantIds ?? []);
    const tenantScoped = scopeRole === 'client_admin' || scopeRole === 'agent';
    
    // Fallback to legacy tenant data if membership-specific data is missing
    let tenantIds = rawTenantIds;
    if (tenantIds.length === 0 && legacyTenantIds.length > 0) {
      tenantIds = legacyTenantIds;
    }

    const defaultTenantId = (() => {
      // If we have an explicit membership default, use it if it is valid for the tenant scope
      if (membership.defaultTenantId) {
        if (tenantIds.length === 0 || tenantIds.some((t) => t.equals(membership.defaultTenantId))) {
          return membership.defaultTenantId;
        }
      }
      
      // Fallback to legacy default if valid
      if (legacyDefaultTenantId) {
        if (tenantIds.length === 0 || tenantIds.some((t) => t.equals(legacyDefaultTenantId))) {
          return legacyDefaultTenantId;
        }
      }

      // Final fallback to the first available tenant in the scoped list
      return tenantIds[0];
    })();

    const normalizedMembership: UserMembershipDocument = {
      ...membership,
      role: membershipRole,
      scopeRole,
      tenantIds
    };

    if (defaultTenantId) {
      normalizedMembership.defaultTenantId = defaultTenantId;
    }

    return normalizedMembership;
  });

  user.memberships = normalizedMemberships;
  next();
});

UserSchema.index({ agencyId: 1, email: 1 });
UserSchema.index({ 'memberships.agencyId': 1, email: 1 });
UserSchema.index({ 'memberships.agencyId': 1, 'memberships.tenantIds': 1 });

export type User = InferSchemaType<typeof UserSchema>;

export const UserModel =
  (models.User as Model<User> | undefined) ||
  model<User>('User', UserSchema);
