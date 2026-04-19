import { z } from 'zod';

export const CrmProviderSchema = z.enum(['hubspot', 'salesforce', 'pipedrive', 'custom']);
export type CrmProvider = z.infer<typeof CrmProviderSchema>;

export const CrmSyncDirectionSchema = z.enum(['import', 'export', 'bidirectional']);
export type CrmSyncDirection = z.infer<typeof CrmSyncDirectionSchema>;

export const CrmConnectionStatusSchema = z.enum(['active', 'disabled', 'error']);
export type CrmConnectionStatus = z.infer<typeof CrmConnectionStatusSchema>;

export const CrmRecordObjectTypeSchema = z.enum(['contact', 'deal', 'note', 'activity']);
export type CrmRecordObjectType = z.infer<typeof CrmRecordObjectTypeSchema>;

export const CrmOwnerSchema = z.object({
  externalOwnerId: z.string().min(1),
  displayName: z.string().min(1).nullable().optional(),
  email: z.string().email().nullable().optional()
}).strict();
export type CrmOwner = z.infer<typeof CrmOwnerSchema>;

export const CrmTagSchema = z.object({
  id: z.string().min(1).optional(),
  label: z.string().min(1)
}).strict();
export type CrmTag = z.infer<typeof CrmTagSchema>;

export const CrmPipelineStageSchema = z.object({
  pipelineId: z.string().min(1),
  stageId: z.string().min(1),
  stageName: z.string().min(1)
}).strict();
export type CrmPipelineStage = z.infer<typeof CrmPipelineStageSchema>;

export const CrmExternalRecordLinkSchema = z.object({
  agencyId: z.string().min(1),
  tenantId: z.string().min(1),
  contactId: z.string().min(1),
  provider: CrmProviderSchema,
  objectType: CrmRecordObjectTypeSchema,
  externalRecordId: z.string().min(1),
  externalUrl: z.string().url().nullable().optional(),
  linkedAt: z.date().default(() => new Date())
}).strict();
export type CrmExternalRecordLink = z.infer<typeof CrmExternalRecordLinkSchema>;

export const CrmNoteSchema = z.object({
  id: z.string().min(1).optional(),
  body: z.string().min(1),
  authorUserId: z.string().min(1),
  createdAt: z.date().default(() => new Date()),
  externalRecordId: z.string().min(1).nullable().optional()
}).strict();
export type CrmNote = z.infer<typeof CrmNoteSchema>;

export const CrmActivityTypeSchema = z.enum([
  'message_inbound',
  'message_outbound',
  'note_added',
  'tag_updated',
  'stage_updated',
  'owner_updated',
  'sync_imported',
  'sync_exported'
]);
export type CrmActivityType = z.infer<typeof CrmActivityTypeSchema>;

export const CrmActivityEventSchema = z.object({
  agencyId: z.string().min(1),
  tenantId: z.string().min(1),
  contactId: z.string().min(1),
  provider: CrmProviderSchema,
  type: CrmActivityTypeSchema,
  occurredAt: z.date().default(() => new Date()),
  summary: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).default({})
}).strict();
export type CrmActivityEvent = z.infer<typeof CrmActivityEventSchema>;

export const CrmConnectionSchema = z.object({
  agencyId: z.string().min(1),
  tenantId: z.string().min(1),
  provider: CrmProviderSchema,
  displayName: z.string().min(1),
  status: CrmConnectionStatusSchema.default('active'),
  syncDirection: CrmSyncDirectionSchema,
  config: z.record(z.string(), z.unknown()).default({}),
  defaultOwner: CrmOwnerSchema.nullable().optional(),
  defaultPipelineStage: CrmPipelineStageSchema.nullable().optional(),
  defaultTags: z.array(CrmTagSchema).default([]),
  lastSyncedAt: z.date().nullable().default(null)
}).strict();
export type CrmConnection = z.infer<typeof CrmConnectionSchema>;

export const CrmSyncJobStatusSchema = z.enum(['pending', 'running', 'completed', 'failed']);
export type CrmSyncJobStatus = z.infer<typeof CrmSyncJobStatusSchema>;

export const CrmSyncJobSchema = z.object({
  agencyId: z.string().min(1),
  tenantId: z.string().min(1),
  provider: CrmProviderSchema,
  direction: CrmSyncDirectionSchema,
  status: CrmSyncJobStatusSchema.default('pending'),
  cursor: z.string().min(1).nullable().optional(),
  error: z.string().min(1).nullable().optional(),
  startedAt: z.date().nullable().default(null),
  finishedAt: z.date().nullable().default(null)
}).strict();
export type CrmSyncJob = z.infer<typeof CrmSyncJobSchema>;
