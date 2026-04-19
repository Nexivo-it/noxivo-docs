import { getInboxEventsBackplane, type InboxEvent } from './inbox-events-backplane';

export type { InboxEvent } from './inbox-events-backplane';

export async function subscribeToInboxEvents(
  tenantId: string,
  subscriber: (event: InboxEvent) => void
): Promise<() => Promise<void>> {
  return getInboxEventsBackplane().subscribe(tenantId, subscriber);
}

export async function broadcastInboxEvent(tenantId: string, event: InboxEvent): Promise<void> {
  await getInboxEventsBackplane().publish(tenantId, event);
}
