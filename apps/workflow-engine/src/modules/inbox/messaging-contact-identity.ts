type MessagingRequester = (path: string) => Promise<unknown>;

type MessagingContactPayload = {
  id?: unknown;
  number?: unknown;
  name?: unknown;
  pushname?: unknown;
};

type MessagingLidPayload = {
  lid?: unknown;
  pn?: unknown;
};

export type ResolvedMessagingIdentity = {
  canonicalContactId: string;
  rawContactId: string;
  contactAliases: string[];
  contactPhone: string | null;
  contactName: string | null;
  messagingChatId: string;
};

export function extractPhoneDigits(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length === 0) {
    return null;
  }

  const [localPart] = trimmed.split('@');
  const digits = (localPart ?? trimmed).replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

function normalizeChatId(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase() ?? '';
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.includes('@')) {
    return trimmed;
  }

  const digits = extractPhoneDigits(trimmed);
  return digits ? `${digits}@c.us` : trimmed;
}

export function buildMessagingAliasCandidates(values: Array<string | null | undefined>): string[] {
  const aliases = new Set<string>();

  for (const value of values) {
    const normalized = normalizeChatId(value);
    if (normalized) {
      aliases.add(normalized);
    }

    const digits = extractPhoneDigits(value);
    if (digits) {
      aliases.add(`${digits}@c.us`);
      aliases.add(`${digits}@lid`);
      aliases.add(`${digits}@s.whatsapp.net`);
    }
  }

  return Array.from(aliases);
}

function readContactName(payload: MessagingContactPayload | null): string | null {
  if (!payload) {
    return null;
  }

  const name = typeof payload.name === 'string' && payload.name.trim().length > 0
    ? payload.name.trim()
    : typeof payload.pushname === 'string' && payload.pushname.trim().length > 0
      ? payload.pushname.trim()
      : null;

  return name;
}

async function safeRequest<T>(requester: MessagingRequester, path: string): Promise<T | null> {
  try {
    return await requester(path) as T;
  } catch {
    return null;
  }
}

export async function resolveMessagingContactIdentity(input: {
  requester: MessagingRequester;
  sessionName: string;
  rawContactId: string;
}): Promise<ResolvedMessagingIdentity> {
  const rawContactId = normalizeChatId(input.rawContactId) ?? input.rawContactId.trim().toLowerCase();
  const rawDigits = extractPhoneDigits(rawContactId);
  const contactPayload = await safeRequest<MessagingContactPayload>(
    input.requester,
    `/api/${encodeURIComponent(input.sessionName)}/contacts/${encodeURIComponent(rawContactId)}`
  );

  const contactIdFromPayload = typeof contactPayload?.id === 'string' ? normalizeChatId(contactPayload.id) : null;
  const numberFromPayload = typeof contactPayload?.number === 'string' ? extractPhoneDigits(contactPayload.number) : null;

  const lidByPhone = rawDigits
    ? await safeRequest<MessagingLidPayload>(
        input.requester,
        `/api/${encodeURIComponent(input.sessionName)}/lids/pn/${encodeURIComponent(rawDigits)}`
      )
    : null;
  const phoneByLid = rawContactId.endsWith('@lid') && rawDigits
    ? await safeRequest<MessagingLidPayload>(
        input.requester,
        `/api/${encodeURIComponent(input.sessionName)}/lids/${encodeURIComponent(rawDigits)}`
      )
    : null;

  const phoneFromLid = typeof phoneByLid?.pn === 'string' ? extractPhoneDigits(phoneByLid.pn) : null;
  const lidFromPhone = typeof lidByPhone?.lid === 'string' ? normalizeChatId(lidByPhone.lid) : null;
  const canonicalPhone = numberFromPayload ?? phoneFromLid ?? (rawContactId.endsWith('@c.us') ? rawDigits : null);
  const canonicalContactId = canonicalPhone ? `${canonicalPhone}@c.us` : rawContactId;

  return {
    canonicalContactId,
    rawContactId,
    contactAliases: buildMessagingAliasCandidates([
      rawContactId,
      contactIdFromPayload,
      canonicalContactId,
      lidFromPhone,
      phoneByLid?.pn as string | undefined,
      rawDigits
    ]),
    contactPhone: canonicalPhone,
    contactName: readContactName(contactPayload),
    messagingChatId: rawContactId
  };
}
