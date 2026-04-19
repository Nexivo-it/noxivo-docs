import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

const PermissionSchema = new Schema({
  resource: {
    type: String,
    enum: ['billing', 'conversations', 'workflows', 'team', 'roles'],
    required: true
  },
  action: {
    type: String,
    enum: ['create', 'read', 'update', 'delete', 'manage'],
    required: true
  }
}, { _id: false });

const RoleSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    type: String,
    enum: ['system', 'custom'],
    required: true,
    default: 'custom'
  },
  agencyId: {
    type: Schema.Types.ObjectId,
    ref: 'Agency',
    required: false,
    index: true
  },
  permissions: {
    type: [PermissionSchema],
    default: []
  }
}, {
  collection: 'roles',
  timestamps: true
});

export type Role = InferSchemaType<typeof RoleSchema>;
export type Permission = InferSchemaType<typeof PermissionSchema>;

export const RoleModel =
  (models.Role as Model<Role> | undefined) ||
  model<Role>('Role', RoleSchema);
