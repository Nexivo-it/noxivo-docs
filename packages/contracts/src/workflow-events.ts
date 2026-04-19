import { z } from 'zod';

export const WorkflowExecutionEventStatusSchema = z.enum(['hit', 'completed', 'failed']);

export const WorkflowExecutionEventSchema = z.object({
  workflowId: z.string().min(1),
  workflowRunId: z.string().min(1),
  nodeId: z.string().min(1),
  status: WorkflowExecutionEventStatusSchema,
  timestamp: z.string().datetime(),
  output: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
}).strict();

export type WorkflowExecutionEventStatus = z.infer<typeof WorkflowExecutionEventStatusSchema>;
export type WorkflowExecutionEvent = z.infer<typeof WorkflowExecutionEventSchema>;

export function buildWorkflowExecutionChannel(workflowId: string): string {
  return `workflow:${workflowId}:execution`;
}
