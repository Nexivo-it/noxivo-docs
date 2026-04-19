import { getWorkflowEventsBackplane } from './workflow-events-backplane';
import { WorkflowExecutionEvent } from '@noxivo/contracts';

export async function subscribeToWorkflowEvents(
  workflowId: string,
  subscriber: (event: WorkflowExecutionEvent) => void
): Promise<() => Promise<void>> {
  return getWorkflowEventsBackplane().subscribe(workflowId, subscriber);
}
