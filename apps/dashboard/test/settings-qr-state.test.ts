import { describe, expect, it } from 'vitest';

import {
  getQrPollIntervalMs,
  mapPairingSnapshotToUi,
  shouldPollPairingState,
} from '../app/dashboard/settings/qr-state.js';

describe('settings qr state helper', () => {
  it('normalizes preparing state as polling without qr value', () => {
    const snapshot = mapPairingSnapshotToUi({
      state: 'preparing',
      reason: 'startup_in_progress',
      poll: true,
      qrValue: 'ignored-while-preparing',
    });

    expect(snapshot.state).toBe('preparing');
    expect(snapshot.reason).toBe('startup_in_progress');
    expect(snapshot.poll).toBe(true);
    expect(snapshot.qrValue).toBeNull();
    expect(shouldPollPairingState(snapshot)).toBe(true);
    expect(getQrPollIntervalMs(snapshot)).toBe(3000);
  });

  it('normalizes qr_ready state and keeps qr value', () => {
    const snapshot = mapPairingSnapshotToUi({
      state: 'qr_ready',
      reason: null,
      poll: true,
      qrValue: 'qr-token-123',
    });

    expect(snapshot.state).toBe('qr_ready');
    expect(snapshot.reason).toBeNull();
    expect(snapshot.poll).toBe(true);
    expect(snapshot.qrValue).toBe('qr-token-123');
    expect(shouldPollPairingState(snapshot)).toBe(true);
    expect(getQrPollIntervalMs(snapshot)).toBe(5000);
  });

  it('keeps connected state passive and non-polling', () => {
    const snapshot = mapPairingSnapshotToUi({
      state: 'connected',
      reason: null,
      poll: false,
      qrValue: 'should-not-render',
    });

    expect(snapshot.state).toBe('connected');
    expect(snapshot.poll).toBe(false);
    expect(snapshot.qrValue).toBeNull();
    expect(shouldPollPairingState(snapshot)).toBe(false);
    expect(getQrPollIntervalMs(snapshot)).toBeNull();
  });

  it('keeps unlinked state passive and non-polling', () => {
    const snapshot = mapPairingSnapshotToUi({
      state: 'unlinked',
      reason: 'bootstrap_required',
      poll: true,
      qrValue: 'never-render',
    });

    expect(snapshot.state).toBe('unlinked');
    expect(snapshot.reason).toBe('bootstrap_required');
    expect(snapshot.poll).toBe(false);
    expect(snapshot.qrValue).toBeNull();
    expect(shouldPollPairingState(snapshot)).toBe(false);
    expect(getQrPollIntervalMs(snapshot)).toBeNull();
  });

  it('falls back to failed snapshot for malformed payloads', () => {
    const snapshot = mapPairingSnapshotToUi({
      state: '???',
      reason: 42,
      poll: 'yes',
      qrValue: 1,
    });

    expect(snapshot.state).toBe('failed');
    expect(snapshot.reason).toBe('invalid_pairing_state');
    expect(snapshot.poll).toBe(false);
    expect(snapshot.qrValue).toBeNull();
    expect(shouldPollPairingState(snapshot)).toBe(false);
    expect(getQrPollIntervalMs(snapshot)).toBeNull();
  });
});
