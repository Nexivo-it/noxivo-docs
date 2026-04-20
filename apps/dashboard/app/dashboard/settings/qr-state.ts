export type QrPairingState = 'unlinked' | 'preparing' | 'qr_ready' | 'connected' | 'failed';

export type QrPairingSnapshot = {
  state: QrPairingState;
  reason: string | null;
  poll: boolean;
  qrValue: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isQrPairingState(value: unknown): value is QrPairingState {
  return value === 'unlinked'
    || value === 'preparing'
    || value === 'qr_ready'
    || value === 'connected'
    || value === 'failed';
}

export function mapPairingSnapshotToUi(payload: unknown): QrPairingSnapshot {
  if (!isRecord(payload) || !isQrPairingState(payload.state)) {
    return {
      state: 'failed',
      reason: 'invalid_pairing_state',
      poll: false,
      qrValue: null,
    };
  }

  const state = payload.state;
  const reason = readString(payload.reason);
  const poll = payload.poll === true && (state === 'preparing' || state === 'qr_ready');
  const qrValue = state === 'qr_ready' ? readString(payload.qrValue) : null;

  return {
    state,
    reason,
    poll,
    qrValue,
  };
}

export function normalizeQrPairingSnapshot(payload: unknown): QrPairingSnapshot {
  return mapPairingSnapshotToUi(payload);
}

export function shouldPollPairingState(snapshot: QrPairingSnapshot): boolean {
  return snapshot.poll && (snapshot.state === 'preparing' || snapshot.state === 'qr_ready');
}

export function getQrPollIntervalMs(snapshot: QrPairingSnapshot): number | null {
  if (!shouldPollPairingState(snapshot)) {
    return null;
  }

  if (snapshot.state === 'preparing') {
    return 3000;
  }

  if (snapshot.state === 'qr_ready') {
    return 5000;
  }

  return null;
}
