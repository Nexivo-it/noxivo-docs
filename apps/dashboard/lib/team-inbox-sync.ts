import { WORKFLOW_ENGINE_INTERNAL_PSK_HEADER } from '@noxivo/contracts';

export async function syncInboxState(input: {
  agencyId: string;
  tenantId: string;
  conversationId?: string;
  limit?: number;
  pages?: number;
}): Promise<void> {
  const internalBaseUrl = process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL;
  const internalPsk = process.env.WORKFLOW_ENGINE_INTERNAL_PSK;

  if (!internalBaseUrl || !internalPsk) {
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    await fetch(`${internalBaseUrl.replace(/\/$/, '')}/v1/internal/inbox/sync`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [WORKFLOW_ENGINE_INTERNAL_PSK_HEADER]: internalPsk
      },
      body: JSON.stringify(input),
      signal: controller.signal
    });

    clearTimeout(timeout);
  } catch {
    // best-effort sync only
  }
}
