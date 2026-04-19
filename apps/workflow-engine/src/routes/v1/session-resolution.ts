import { dbConnect } from '../../lib/mongodb.js';

type MessagingSessionBindingLike = {
  _id: { toString(): string };
  messagingSessionName: string;
};

function isObjectIdCandidate(value: string): boolean {
  return /^[a-f0-9]{24}$/i.test(value);
}

export async function resolveMessagingSessionName(sessionIdOrName: string): Promise<{
  sessionName: string;
  bindingId: string | null;
}> {
  const trimmed = sessionIdOrName.trim();

  if (trimmed.length === 0) {
    throw new Error('Session id is required');
  }

  await dbConnect();
  const { MessagingSessionBindingModel } = await import('@noxivo/database');

  let binding: MessagingSessionBindingLike | null = null;

  if (isObjectIdCandidate(trimmed)) {
    binding = await MessagingSessionBindingModel.findById(trimmed)
      .select({ _id: 1, messagingSessionName: 1 })
      .lean<MessagingSessionBindingLike | null>();
  }

  if (!binding) {
    binding = await MessagingSessionBindingModel.findOne({ messagingSessionName: trimmed })
      .select({ _id: 1, messagingSessionName: 1 })
      .lean<MessagingSessionBindingLike | null>();
  }

  if (binding) {
    return {
      sessionName: binding.messagingSessionName,
      bindingId: binding._id.toString(),
    };
  }

  return {
    sessionName: trimmed,
    bindingId: null,
  };
}
