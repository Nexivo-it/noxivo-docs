import { ContactMemoryModel } from '@noxivo/database';

export type MemoryCategory = 'preference' | 'context' | 'history' | 'note' | 'custom';
export type MemorySource = 'ai_extracted' | 'agent_added' | 'workflow_learned' | 'manual';

export interface UpsertMemoryInput {
  agencyId: string;
  tenantId: string;
  contactId: string;
  fact: string;
  category?: string;
  source?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface GetMemoryInput {
  agencyId: string;
  tenantId: string;
  contactId: string;
  category?: string;
  limit?: number;
}

export class MemoryService {
  async upsert(input: UpsertMemoryInput): Promise<void> {
    await ContactMemoryModel.create({
      agencyId: input.agencyId,
      tenantId: input.tenantId,
      contactId: input.contactId,
      fact: input.fact,
      category: input.category || 'custom',
      source: input.source || 'workflow_learned',
      confidence: input.confidence ?? 1,
      metadata: input.metadata || {}
    });
  }

  async getContext(input: GetMemoryInput): Promise<string[]> {
    const memories = await ContactMemoryModel.find({
      agencyId: input.agencyId,
      tenantId: input.tenantId,
      contactId: input.contactId,
      ...(input.category ? { category: input.category } : {})
    })
      .sort({ createdAt: -1 })
      .limit(input.limit || 10)
      .lean()
      .exec();

    return memories.map(m => m.fact);
  }

  async getAll(input: GetMemoryInput): Promise<Array<{
    id: string;
    fact: string;
    category: string;
    source: string;
    confidence: number;
    createdAt: Date;
  }>> {
    const memories = await ContactMemoryModel.find({
      agencyId: input.agencyId,
      tenantId: input.tenantId,
      contactId: input.contactId
    })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return memories.map(m => ({
      id: m._id.toString(),
      fact: m.fact,
      category: m.category,
      source: m.source,
      confidence: m.confidence,
      createdAt: m.createdAt
    }));
  }

  async delete(memoryId: string, agencyId: string, tenantId: string): Promise<void> {
    await ContactMemoryModel.findOneAndDelete({
      _id: memoryId,
      agencyId,
      tenantId
    });
  }

  async deleteAllForContact(agencyId: string, tenantId: string, contactId: string): Promise<void> {
    await ContactMemoryModel.deleteMany({
      agencyId,
      tenantId,
      contactId
    });
  }
}

export const memoryService = new MemoryService();
