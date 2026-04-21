import { CatalogItemModel } from '@noxivo/database';
import { dbConnect } from '../../lib/mongodb.js';

export type ItemType = 'service' | 'add_on' | 'bundle' | 'package' | 'category_marker' | 'internal_note';
export type ReadinessStatus = 'draft' | 'needs_review' | 'missing_image' | 'missing_price' | 'ready' | 'published';

export interface CatalogItemDto {
  id: string;
  catalogId: string;
  itemType: ItemType;
  name: string;
  slug: string;
  shortDescription: string;
  longDescription: string;
  priceAmount: number;
  priceCurrency: string;
  isVariablePrice: boolean;
  durationMinutes: number;
  status: ReadinessStatus;
  sortOrder: number;
  categoryId: string;
  mediaIds: string[];
  mediaPath: string | null;
  variations: string;
  conditions: string;
  notes: string;
  details: string;
  imageUrl: string;
  customFields: string;
  gallery: string;
  reviews: string;
  isActive: boolean;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string[];
}

type CatalogPayload = Partial<CatalogItemDto>;

type IdLike = { toString(): string } | string | number | bigint | boolean;

type CatalogItemLean = {
  _id: IdLike;
  tenantId: IdLike;
  itemType?: string | null;
  name?: string | null;
  slug?: string | null;
  shortDescription?: string | null;
  longDescription?: string | null;
  priceAmount?: number | null;
  priceCurrency?: string | null;
  isVariablePrice?: boolean | null;
  durationMinutes?: number | null;
  status?: string | null;
  sortOrder?: number | null;
  categoryId?: IdLike | null;
  mediaPath?: string | null;
  variations?: unknown;
  conditions?: unknown;
  notes?: string | null;
  details?: string | null;
  imageUrl?: string | null;
  customFields?: unknown;
  gallery?: unknown;
  reviews?: unknown;
  isActive?: boolean | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: unknown;
};

function toStringId(value: IdLike | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function toJsonString(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value ?? JSON.parse(fallback));
  } catch {
    return fallback;
  }
}

function parseJsonIfString(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toItemType(value: string | null | undefined): ItemType {
  const allowed: ItemType[] = ['service', 'add_on', 'bundle', 'package', 'category_marker', 'internal_note'];
  return allowed.includes((value ?? '') as ItemType) ? (value as ItemType) : 'service';
}

function toStatus(value: string | null | undefined): ReadinessStatus {
  const allowed: ReadinessStatus[] = ['draft', 'needs_review', 'missing_image', 'missing_price', 'ready', 'published'];
  return allowed.includes((value ?? '') as ReadinessStatus) ? (value as ReadinessStatus) : 'draft';
}

function normalizeCatalogItem(item: CatalogItemLean): CatalogItemDto {
  return {
    id: toStringId(item._id),
    catalogId: toStringId(item.tenantId),
    itemType: toItemType(item.itemType),
    name: item.name ?? 'Untitled',
    slug: item.slug ?? '',
    shortDescription: item.shortDescription ?? '',
    longDescription: item.longDescription ?? '',
    priceAmount: Number(item.priceAmount ?? 0),
    priceCurrency: item.priceCurrency ?? 'USD',
    isVariablePrice: item.isVariablePrice === true,
    durationMinutes: Number(item.durationMinutes ?? 0),
    status: toStatus(item.status),
    sortOrder: Number(item.sortOrder ?? 0),
    categoryId: toStringId(item.categoryId),
    mediaIds: [],
    mediaPath: item.mediaPath ?? null,
    variations: toJsonString(item.variations, '[]'),
    conditions: toJsonString(item.conditions, '[]'),
    notes: item.notes ?? '',
    details: item.details ?? '',
    imageUrl: item.imageUrl ?? '',
    customFields: toJsonString(item.customFields, '{}'),
    gallery: toJsonString(item.gallery, '[]'),
    reviews: toJsonString(item.reviews, '[]'),
    isActive: item.isActive !== false,
    seoTitle: item.seoTitle ?? '',
    seoDescription: item.seoDescription ?? '',
    seoKeywords: Array.isArray(item.seoKeywords)
      ? item.seoKeywords.filter((keyword): keyword is string => typeof keyword === 'string')
      : [],
  };
}

export async function getCatalogItems(tenantId: string): Promise<CatalogItemDto[]> {
  await dbConnect();
  const items = await CatalogItemModel.find({ tenantId }).sort({ sortOrder: 'asc' }).lean<CatalogItemLean[]>();
  return items.map((item) => normalizeCatalogItem(item));
}

export async function createCatalogItem(tenantId: string, payload: CatalogPayload): Promise<CatalogItemDto> {
  await dbConnect();

  const item = await CatalogItemModel.create({
    tenantId,
    itemType: payload.itemType ?? 'service',
    name: payload.name ?? 'Untitled',
    slug: payload.slug ?? '',
    shortDescription: payload.shortDescription ?? '',
    longDescription: payload.longDescription ?? '',
    priceAmount: payload.priceAmount ?? 0,
    priceCurrency: payload.priceCurrency ?? 'USD',
    isVariablePrice: payload.isVariablePrice === true,
    durationMinutes: payload.durationMinutes ?? 0,
    status: payload.status ?? 'draft',
    sortOrder: payload.sortOrder ?? 0,
    categoryId: payload.categoryId || undefined,
    mediaPath: payload.mediaPath ?? undefined,
    variations: parseJsonIfString(payload.variations) ?? [],
    conditions: parseJsonIfString(payload.conditions) ?? [],
    notes: payload.notes ?? undefined,
    details: payload.details ?? undefined,
    imageUrl: payload.imageUrl ?? undefined,
    customFields: parseJsonIfString(payload.customFields) ?? {},
    gallery: parseJsonIfString(payload.gallery) ?? [],
    reviews: parseJsonIfString(payload.reviews) ?? [],
    isActive: payload.isActive !== false,
    seoTitle: payload.seoTitle ?? undefined,
    seoDescription: payload.seoDescription ?? undefined,
    seoKeywords: payload.seoKeywords,
  });

  return normalizeCatalogItem(item.toObject() as CatalogItemLean);
}

export async function updateCatalogItem(tenantId: string, itemId: string, payload: CatalogPayload): Promise<CatalogItemDto> {
  await dbConnect();

  const updateData: Record<string, unknown> = { ...payload };
  delete updateData.id;
  delete updateData.catalogId;

  if ('variations' in updateData) {
    updateData.variations = parseJsonIfString(updateData.variations);
  }
  if ('conditions' in updateData) {
    updateData.conditions = parseJsonIfString(updateData.conditions);
  }
  if ('customFields' in updateData) {
    updateData.customFields = parseJsonIfString(updateData.customFields);
  }
  if ('gallery' in updateData) {
    updateData.gallery = parseJsonIfString(updateData.gallery);
  }
  if ('reviews' in updateData) {
    updateData.reviews = parseJsonIfString(updateData.reviews);
  }

  const item = await CatalogItemModel.findOneAndUpdate(
    { _id: itemId, tenantId },
    { $set: updateData },
    { new: true },
  ).lean<CatalogItemLean | null>();

  if (!item) {
    throw new Error('Item not found');
  }

  return normalizeCatalogItem(item);
}

export async function getCatalogItemById(tenantId: string, itemId: string): Promise<CatalogItemDto | null> {
  await dbConnect();
  const item = await CatalogItemModel.findOne({ _id: itemId, tenantId }).lean<CatalogItemLean | null>();
  return item ? normalizeCatalogItem(item) : null;
}

export async function deleteCatalogItem(tenantId: string, itemId: string): Promise<void> {
  await dbConnect();
  const result = await CatalogItemModel.findOneAndDelete({ _id: itemId, tenantId }).lean();
  if (!result) {
    throw new Error('Item not found');
  }
}
