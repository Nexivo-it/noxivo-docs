import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

// Category Schema
const CategorySchema = new Schema({
  name: { type: String, required: true },
  description: { type: String },
  sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

export type Category = InferSchemaType<typeof CategorySchema>;
export const CategoryModel = (models.Category as Model<Category> | undefined) || model<Category>('Category', CategorySchema);

// Catalog Schema
const CatalogSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  title: { type: String, required: true },
  version: { type: String, required: true },
  status: { type: String, default: 'draft', enum: ['draft', 'published', 'archived'] }
}, { timestamps: true });

export type Catalog = InferSchemaType<typeof CatalogSchema>;
export const CatalogModel = (models.Catalog as Model<Catalog> | undefined) || model<Catalog>('Catalog', CatalogSchema);

// CatalogItem Schema
const CatalogItemSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  catalogId: { type: Schema.Types.ObjectId, ref: 'Catalog', index: true },
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category', index: true },
  name: { type: String, required: true },
  slug: { type: String },
  priceAmount: { type: Number },
  priceCurrency: { type: String, default: 'USD' },
  isVariablePrice: { type: Boolean, default: false },
  durationMinutes: { type: Number },
  shortDescription: { type: String },
  longDescription: { type: String },
  status: { type: String, default: 'needs_review' },
  itemType: { type: String, default: 'service' },
  mediaPath: { type: String },
  
  // JSON Blobs/Mixed fields
  variations: { type: Schema.Types.Mixed }, // JSON payload
  conditions: { type: Schema.Types.Mixed }, // JSON payload
  notes: { type: String },
  details: { type: String },
  imageUrl: { type: String },
  customFields: { type: Schema.Types.Mixed }, // Array of objects
  gallery: { type: [String] },
  reviews: { type: Schema.Types.Mixed }, // Array of objects
  
  sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

export type CatalogItem = InferSchemaType<typeof CatalogItemSchema>;
export const CatalogItemModel = (models.CatalogItem as Model<CatalogItem> | undefined) || model<CatalogItem>('CatalogItem', CatalogItemSchema);

// Bundle Schema
const BundleSchema = new Schema({
  name: { type: String, required: true },
  priceAmount: { type: Number },
  originalPrice: { type: Number },
  items: [{ type: Schema.Types.ObjectId, ref: 'CatalogItem' }]
}, { timestamps: true });

export type Bundle = InferSchemaType<typeof BundleSchema>;
export const BundleModel = (models.Bundle as Model<Bundle> | undefined) || model<Bundle>('Bundle', BundleSchema);

// Relation Schema
const RelationSchema = new Schema({
  sourceItemId: { type: Schema.Types.ObjectId, ref: 'CatalogItem', required: true, index: true },
  targetItemId: { type: Schema.Types.ObjectId, ref: 'CatalogItem', required: true, index: true },
  relationType: { type: String, required: true },
  label: { type: String },
  notes: { type: String }
}, { timestamps: true });

export type Relation = InferSchemaType<typeof RelationSchema>;
export const RelationModel = (models.Relation as Model<Relation> | undefined) || model<Relation>('Relation', RelationSchema);

// ImportSession Schema
const ImportSessionSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  status: { type: String, default: 'pending', enum: ['pending', 'processing', 'completed', 'failed'] },
  sourceSummary: { type: String },
  mediaPath: { type: String },
  createdBy: { type: String, default: 'system' }
}, { timestamps: true });

export type ImportSession = InferSchemaType<typeof ImportSessionSchema>;
export const ImportSessionModel = (models.ImportSession as Model<ImportSession> | undefined) || model<ImportSession>('ImportSession', ImportSessionSchema);

// ImportCandidate Schema
const ImportCandidateSchema = new Schema({
  importSessionId: { type: Schema.Types.ObjectId, ref: 'ImportSession', required: true, index: true },
  candidateType: { type: String, required: true },
  confidenceScore: { type: Number, required: true },
  proposedPayload: { type: Schema.Types.Mixed, required: true },
  reviewStatus: { type: String, default: 'pending', enum: ['pending', 'accepted', 'rejected'] }
}, { timestamps: true });

export type ImportCandidate = InferSchemaType<typeof ImportCandidateSchema>;
export const ImportCandidateModel = (models.ImportCandidate as Model<ImportCandidate> | undefined) || model<ImportCandidate>('ImportCandidate', ImportCandidateSchema);

// AuditLog Schema
const AuditLogSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  destinationId: { type: String, required: true },
  status: { type: String, required: true },
  action: { type: String, required: true },
  details: { type: String }
}, { timestamps: true });

export type AuditLog = InferSchemaType<typeof AuditLogSchema>;
export const AuditLogModel = (models.AuditLog as Model<AuditLog> | undefined) || model<AuditLog>('AuditLog', AuditLogSchema);
