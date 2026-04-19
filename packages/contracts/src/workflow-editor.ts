import { z } from 'zod';

export const WorkflowNodeTypeSchema = z.enum(['trigger', 'condition', 'action', 'plugin', 'delay', 'handoff', 'airtable', 'google_sheets', 'webhook', 'crm', 'agentic_ai']);

export const WorkflowEditorNodeSchema = z.object({
  id: z.string().min(1),
  type: WorkflowNodeTypeSchema,
  position: z.object({
    x: z.number(),
    y: z.number()
  }).strict(),
  data: z.record(z.string(), z.unknown())
}).strict();

export const WorkflowEditorEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().min(1).nullable().optional(),
  targetHandle: z.string().min(1).nullable().optional()
}).strict();

export const WorkflowEditorGraphSchema = z.object({
  nodes: z.array(WorkflowEditorNodeSchema),
  edges: z.array(WorkflowEditorEdgeSchema),
  viewport: z.object({
    x: z.number(),
    y: z.number(),
    zoom: z.number()
  }).strict().optional()
}).strict();

export type WorkflowNodeType = z.infer<typeof WorkflowNodeTypeSchema>;
export type WorkflowEditorNode = z.infer<typeof WorkflowEditorNodeSchema>;
export type WorkflowEditorEdge = z.infer<typeof WorkflowEditorEdgeSchema>;
export type WorkflowEditorGraph = z.infer<typeof WorkflowEditorGraphSchema>;

export function parseWorkflowEditorGraph(input: unknown): WorkflowEditorGraph {
  return WorkflowEditorGraphSchema.parse(input);
}
