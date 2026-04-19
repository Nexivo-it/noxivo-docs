import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;

const WorkflowRunSchema = new Schema({
  workflowRunId: {
    type: String,
    required: true,
    index: true
  },
  conversationId: {
    type: String,
    required: true,
    index: true
  },
  workflowDefinitionId: {
    type: String,
    required: true
  },
  agencyId: {
    type: String,
    required: true,
    index: true
  },
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  status: {
    type: String,
    required: true,
    enum: ['running', 'completed', 'failed', 'suspended', 'cancelled'],
    default: 'running'
  },
  currentNodeId: {
    type: String,
    default: null
  },
  contextPatch: {
    type: Schema.Types.Mixed,
    default: () => ({})
  },
  startedAt: {
    type: Date,
    required: true,
    default: () => new Date()
  },
  finishedAt: {
    type: Date,
    default: null
  }
}, {
  collection: 'workflow_runs',
  timestamps: true
});

WorkflowRunSchema.index({ agencyId: 1, tenantId: 1, conversationId: 1, workflowRunId: 1 }, { unique: true });

const WorkflowExecutionEventSchema = new Schema({
  workflowRunId: {
    type: String,
    required: true,
    index: true
  },
  workflowDefinitionId: {
    type: String,
    required: true,
    index: true
  },
  conversationId: {
    type: String,
    required: true,
    index: true
  },
  agencyId: {
    type: String,
    required: true,
    index: true
  },
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  nodeId: {
    type: String,
    required: true
  },
  startedAt: {
    type: Date,
    required: true,
    default: () => new Date()
  },
  finishedAt: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    required: true,
    enum: ['running', 'completed', 'failed', 'skipped']
  },
  output: {
    type: Schema.Types.Mixed,
    default: null
  },
  error: {
    type: String,
    default: null
  }
}, {
  collection: 'workflow_execution_events',
  timestamps: true
});

WorkflowExecutionEventSchema.index({ agencyId: 1, tenantId: 1, conversationId: 1, workflowRunId: 1, nodeId: 1, startedAt: 1 });

export type WorkflowRun = InferSchemaType<typeof WorkflowRunSchema>;
export type WorkflowExecutionEvent = InferSchemaType<typeof WorkflowExecutionEventSchema>;

export const WorkflowRunModel =
  (models.WorkflowRun as Model<WorkflowRun> | undefined) ||
  model<WorkflowRun>('WorkflowRun', WorkflowRunSchema);

export const WorkflowExecutionEventModel =
  (models.WorkflowExecutionEvent as Model<WorkflowExecutionEvent> | undefined) ||
  model<WorkflowExecutionEvent>('WorkflowExecutionEvent', WorkflowExecutionEventSchema);
