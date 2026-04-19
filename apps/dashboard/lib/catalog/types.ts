/**
 * Core Domain Models for Service Catalog Canvas
 * Based on docs/data-map.md
 */

export type ItemType = 'service' | 'add_on' | 'bundle' | 'package' | 'category_marker' | 'internal_note';

export type ReadinessStatus = 'draft' | 'needs_review' | 'missing_image' | 'missing_price' | 'ready' | 'published';

export interface Workspace {
  id: string;
  name: string;
  brandName: string;
  industryType: string;
  planType: 'basic' | 'premium' | 'enterprise';
  status: 'active' | 'inactive';
}

export interface Catalog {
  id: string;
  workspaceId: string;
  title: string;
  version: string;
  status: 'draft' | 'active' | 'archived';
}

export interface CatalogItem {
  id: string;
  catalogId: string;
  itemType: ItemType;
  name: string;
  slug: string;
  shortDescription?: string;
  longDescription?: string;
  priceAmount?: number;
  priceCurrency: string;
  isVariablePrice: boolean;
  durationMinutes?: number;
  status: ReadinessStatus;
  sortOrder: number;
  categoryId?: string;
  mediaIds: string[];
  mediaPath?: string | null;

  // Extra Metadata
  variations?: string;  // JSON string
  conditions?: string;  // JSON string
  notes?: string;
  details?: string;
  imageUrl?: string;
  customFields?: string; // JSON string of CustomField[]
  gallery?: string;      // JSON string of string[] (URLs)
  reviews?: string;      // JSON string of Review[]
}

export interface Review {
  id: string;
  author: string;
  rating: number;
  comment: string;
  date: string;
}

export interface CustomField {
  id: string;
  label: string;
  type: 'text' | 'long_text' | 'image_url' | 'number' | 'toggle';
  value: string | number | boolean;
}

export interface MediaAsset {
  id: string;
  workspaceId: string;
  sourceType: 'upload' | 'import' | 'url';
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  width?: number;
  height?: number;
  thumbnailPath?: string;
}

export interface Category {
  id: string;
  catalogId: string;
  name: string;
  description?: string;
  sortOrder: number;
}

export type RelationType = 'bundle_contains' | 'add_on' | 'upgrade' | 'recommended_with' | 'requires' | 'discount_pair';

export interface Relation {
  id: string;
  catalogId: string;
  sourceItemId: string;
  targetItemId: string;
  relationType: RelationType;
  label?: string;
  notes?: string;
}

export interface ImportSession {
  id: string;
  workspaceId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdBy: string;
  createdAt: string;
  sourceSummary: string;
}

export interface ImportAsset {
  id: string;
  importSessionId: string;
  assetType: 'photo' | 'pdf' | 'link' | 'note';
  storagePath: string;
  sourceUrl?: string;
  parseStatus: 'pending' | 'success' | 'failed';
}

export interface ImportCandidate {
  id: string;
  importSessionId: string;
  candidateType: ItemType;
  confidenceScore: number;
  proposedPayload: Partial<CatalogItem>;
  reviewStatus: 'pending' | 'approved' | 'rejected';
}