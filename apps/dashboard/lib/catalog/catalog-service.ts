import { 
  CatalogItemModel, 
  CategoryModel, 
  BundleModel, 
  RelationModel,
  CatalogSettingsModel
} from '@noxivo/database';
import dbConnect from '@/lib/mongodb';
import { CatalogItem, ItemType, ReadinessStatus } from './types';

export class CatalogService {
  static async getCatalogItems(tenantId: string): Promise<CatalogItem[]> {
    await dbConnect();
    const items = await CatalogItemModel.find({ tenantId })
      .sort({ sortOrder: 'asc' })
      .lean();

    return items.map((item: { 
      _id: { toString(): string }; 
      tenantId: { toString(): string }; 
      itemType: string; 
      name: string; 
      slug?: string | null; 
      shortDescription?: string | null; 
      longDescription?: string | null; 
      priceAmount?: number | null;
      [key: string]: any;
    }) => ({
      id: item._id.toString(),
      catalogId: item.tenantId.toString(),
      itemType: item.itemType as ItemType,
      name: item.name,
      slug: item.slug || '',
      shortDescription: item.shortDescription || '',
      longDescription: item.longDescription || '',
      priceAmount: item.priceAmount || 0,
      priceCurrency: item.priceCurrency,
      isVariablePrice: item.isVariablePrice,
      durationMinutes: item.durationMinutes || 0,
      status: item.status as ReadinessStatus,
      sortOrder: item.sortOrder,
      categoryId: item.categoryId?.toString() ?? '',
      mediaIds: [],
      mediaPath: item.mediaPath ?? null,
      variations: typeof item.variations === 'string' ? item.variations : JSON.stringify(item.variations),
      conditions: typeof item.conditions === 'string' ? item.conditions : JSON.stringify(item.conditions),
      notes: item.notes || '',
      details: item.details || '',
      imageUrl: item.imageUrl || '',
      customFields: typeof item.customFields === 'string' ? item.customFields : JSON.stringify(item.customFields),
      gallery: Array.isArray(item.gallery) ? JSON.stringify(item.gallery) : '[]',
      reviews: typeof item.reviews === 'string' ? item.reviews : JSON.stringify(item.reviews),
      isActive: item.isActive !== false,
      seoTitle: item.seoTitle || '',
      seoDescription: item.seoDescription || '',
      seoKeywords: Array.isArray(item.seoKeywords) ? item.seoKeywords : []
    }));
  }

  static async createItem(tenantId: string, payload: Partial<CatalogItem>): Promise<CatalogItem> {
    await dbConnect();
    
    const variations = typeof payload.variations === 'string' ? JSON.parse(payload.variations || '[]') : payload.variations;
    const conditions = typeof payload.conditions === 'string' ? JSON.parse(payload.conditions || '[]') : payload.conditions;
    const customFields = typeof payload.customFields === 'string' ? JSON.parse(payload.customFields || '{}') : payload.customFields;
    const gallery = typeof payload.gallery === 'string' ? JSON.parse(payload.gallery || '[]') : payload.gallery;
    const reviews = typeof payload.reviews === 'string' ? JSON.parse(payload.reviews || '[]') : payload.reviews;

    const itemDoc = await CatalogItemModel.create({
      tenantId,
      itemType: payload.itemType || 'service',
      name: payload.name || 'Untitled',
      slug: payload.slug || '',
      shortDescription: payload.shortDescription || '',
      longDescription: payload.longDescription || '',
      priceAmount: payload.priceAmount || 0,
      priceCurrency: payload.priceCurrency || 'USD',
      isVariablePrice: payload.isVariablePrice || false,
      durationMinutes: payload.durationMinutes || 0,
      status: payload.status || 'draft',
      sortOrder: payload.sortOrder || 0,
      categoryId: payload.categoryId,
      mediaPath: payload.mediaPath,
      variations: variations || [],
      conditions: conditions || [],
      notes: payload.notes,
      details: payload.details,
      imageUrl: payload.imageUrl,
      customFields: customFields || {},
      gallery: gallery || [],
      reviews: reviews || [],
      isActive: payload.isActive !== false,
      seoTitle: payload.seoTitle,
      seoDescription: payload.seoDescription,
      seoKeywords: payload.seoKeywords
    });

return {
      id: itemDoc._id.toString(),
      catalogId: itemDoc.tenantId.toString(),
      itemType: itemDoc.itemType as ItemType,
      name: itemDoc.name,
      slug: itemDoc.slug || '',
      shortDescription: itemDoc.shortDescription || '',
      longDescription: itemDoc.longDescription || '',
      priceAmount: itemDoc.priceAmount || 0,
      priceCurrency: itemDoc.priceCurrency,
      isVariablePrice: itemDoc.isVariablePrice,
      durationMinutes: itemDoc.durationMinutes || 0,
      status: itemDoc.status as ReadinessStatus,
      sortOrder: itemDoc.sortOrder,
      categoryId: itemDoc.categoryId?.toString() ?? '',
      mediaIds: [],
      mediaPath: itemDoc.mediaPath ?? null,
      variations: JSON.stringify(itemDoc.variations),
      conditions: JSON.stringify(itemDoc.conditions),
      notes: itemDoc.notes || '',
      details: itemDoc.details || '',
      imageUrl: itemDoc.imageUrl || '',
      customFields: JSON.stringify(itemDoc.customFields),
      gallery: JSON.stringify(itemDoc.gallery),
      reviews: JSON.stringify(itemDoc.reviews),
      isActive: itemDoc.isActive !== false,
      seoTitle: itemDoc.seoTitle || '',
      seoDescription: itemDoc.seoDescription || '',
      seoKeywords: Array.isArray(itemDoc.seoKeywords) ? itemDoc.seoKeywords : []
    };
  }

  static async updateItem(tenantId: string, itemId: string, payload: Partial<CatalogItem>): Promise<CatalogItem> {
    await dbConnect();
    
    const updateData: Record<string, unknown> = { ...payload } as Record<string, unknown>;
    delete updateData.id;
    delete updateData.catalogId;
    delete updateData.tenantId;

    if (payload.variations && typeof payload.variations === 'string') updateData.variations = JSON.parse(payload.variations);
    if (payload.conditions && typeof payload.conditions === 'string') updateData.conditions = JSON.parse(payload.conditions);
    if (payload.customFields && typeof payload.customFields === 'string') updateData.customFields = JSON.parse(payload.customFields);
    if (payload.gallery && typeof payload.gallery === 'string') updateData.gallery = JSON.parse(payload.gallery);
    if (payload.reviews && typeof payload.reviews === 'string') updateData.reviews = JSON.parse(payload.reviews);

    const item = await CatalogItemModel.findOneAndUpdate(
      { _id: itemId, tenantId }, 
      updateData, 
      { new: true }
    ).lean();
    
    if (!item) throw new Error('Item not found or unauthorized');

    return {
      id: item._id.toString(),
      catalogId: item.tenantId.toString(),
      itemType: item.itemType as ItemType,
      name: item.name,
      slug: item.slug || '',
      shortDescription: item.shortDescription || '',
      longDescription: item.longDescription || '',
      priceAmount: item.priceAmount || 0,
      priceCurrency: item.priceCurrency,
      isVariablePrice: item.isVariablePrice,
      durationMinutes: item.durationMinutes || 0,
      status: item.status as ReadinessStatus,
      sortOrder: item.sortOrder,
      categoryId: item.categoryId?.toString() ?? '',
      mediaIds: [],
      mediaPath: item.mediaPath ?? null,
      variations: JSON.stringify(item.variations),
      conditions: JSON.stringify(item.conditions),
      notes: item.notes || '',
      details: item.details || '',
      imageUrl: item.imageUrl || '',
      customFields: JSON.stringify(item.customFields),
      gallery: JSON.stringify(item.gallery),
      reviews: JSON.stringify(item.reviews),
      isActive: item.isActive !== false,
      seoTitle: item.seoTitle || '',
      seoDescription: item.seoDescription || '',
      seoKeywords: Array.isArray(item.seoKeywords) ? item.seoKeywords : []
    };
  }

  static async deleteItem(tenantId: string, itemId: string): Promise<void> {
    await dbConnect();
    const result = await CatalogItemModel.findOneAndDelete({ _id: itemId, tenantId });
    if (!result) throw new Error('Item not found or unauthorized');
  }

  static async createRelation(tenantId: string, payload: {
    type: 'bundle' | 'relation';
    name?: string;
    priceAmount?: number;
    originalPrice?: number;
    items?: string[];
    sourceItemId?: string;
    targetItemId?: string;
    relationType?: string;
  }) {
    await dbConnect();
    if (payload.type === 'bundle' && payload.items) {
      const bundle = await BundleModel.create({
        tenantId,
        name: payload.name || 'New Bundle',
        priceAmount: payload.priceAmount,
        originalPrice: payload.originalPrice,
        items: payload.items.map(id => ({ catalogItemId: id }))
      });
      return bundle;
    } else if (payload.type === 'relation' && payload.sourceItemId && payload.targetItemId) {
      const relation = await RelationModel.create({
        tenantId,
        sourceItemId: payload.sourceItemId,
        targetItemId: payload.targetItemId,
        relationType: payload.relationType || 'related'
      });
      return relation;
    }
    throw new Error('Invalid relation payload');
  }

  static async getCategories(tenantId: string) {
    await dbConnect();
    return await CategoryModel.find({ tenantId }).lean();
  }

  static async getSettings(tenantId: string) {
    await dbConnect();
    return await CatalogSettingsModel.findOne({ tenantId }).lean();
  }

  static async updateSettings(tenantId: string, payload: any) {
    await dbConnect();
    return await CatalogSettingsModel.findOneAndUpdate(
      { tenantId },
      { $set: payload },
      { upsert: true, new: true }
    ).lean();
  }
}