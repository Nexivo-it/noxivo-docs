import mongoose, { type InferSchemaType, type Model } from 'mongoose';
const { Schema, model, models } = mongoose;
import {
  WorkflowEditorGraphSchema,
  parseWorkflowEditorGraph,
  CompiledDagSchema,
  parseCompiledDag
} from '@noxivo/contracts';

function validateEditorGraph(value: unknown): boolean {
  return WorkflowEditorGraphSchema.safeParse(value).success;
}

function validateCompiledDag(value: unknown): boolean {
  return CompiledDagSchema.safeParse(value).success;
}

const WorkflowDefinitionSchema = new Schema({
  agencyId: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true
  },
  tenantId: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true
  },
  key: {
    type: String,
    required: true,
    trim: true
  },
  version: {
    type: String,
    required: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  channel: {
    type: String,
    required: true,
    trim: true,
    minlength: 1
  },
  editorGraph: {
    type: Schema.Types.Mixed,
    required: true,
    set: parseWorkflowEditorGraph,
    validate: {
      validator: validateEditorGraph,
      message: 'editorGraph must match WorkflowEditorGraphSchema'
    }
  },
  compiledDag: {
    type: Schema.Types.Mixed,
    required: true,
    set: parseCompiledDag,
    validate: {
      validator: validateCompiledDag,
      message: 'compiledDag must match CompiledDagSchema'
    }
  },
  isActive: {
    type: Boolean,
    required: true,
    default: false
  },
  isTemplate: {
    type: Boolean,
    required: true,
    default: false
  }
}, {
  collection: 'workflow_definitions',
  timestamps: true
});

WorkflowDefinitionSchema.index({ agencyId: 1, tenantId: 1, key: 1, version: 1 }, { unique: true });

export type WorkflowDefinition = InferSchemaType<typeof WorkflowDefinitionSchema>;

export const WorkflowDefinitionModel =
  (models.WorkflowDefinition as Model<WorkflowDefinition> | undefined) ||
  model<WorkflowDefinition>('WorkflowDefinition', WorkflowDefinitionSchema);
