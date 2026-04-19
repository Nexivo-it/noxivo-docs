import { z } from 'zod';
import { WorkflowNodeTypeSchema } from './workflow-editor.js';

export const CompiledDagNodeSchema = z.object({
  id: z.string().min(1),
  type: WorkflowNodeTypeSchema,
  next: z.array(z.string().min(1)),
  input: z.record(z.string(), z.unknown()),
  onTrue: z.string().min(1).nullable().optional(),
  onFalse: z.string().min(1).nullable().optional()
}).strict();

export const CompiledDagSchema = z.object({
  entryNodeId: z.string().min(1),
  topologicalOrder: z.array(z.string().min(1)),
  nodes: z.array(CompiledDagNodeSchema),
  metadata: z.object({
    compiledAt: z.string().datetime(),
    version: z.string().min(1),
    nodeCount: z.number().int().nonnegative()
  }).strict()
}).strict();

export type CompiledDagNode = z.infer<typeof CompiledDagNodeSchema>;
export type CompiledDag = z.infer<typeof CompiledDagSchema>;

export function parseCompiledDag(input: unknown): CompiledDag {
  return CompiledDagSchema.parse(input);
}
