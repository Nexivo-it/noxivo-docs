/** @vitest-environment jsdom */

import React from 'react';
import * as ReactNamespace from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { signupWithWorkflowEngineMock, pushMock, refreshMock } = vi.hoisted(() => ({
  signupWithWorkflowEngineMock: vi.fn(),
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
}));

vi.mock('../lib/api/dashboard-auth-client', () => ({
  signupWithWorkflowEngine: signupWithWorkflowEngineMock,
}));

import { SignupForm } from '../components/signup-form';

async function fillAndSubmitSignupForm(input: {
  container: HTMLDivElement;
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}) {
  const fullNameInput = input.container.querySelector('#fullName') as HTMLInputElement;
  const emailInput = input.container.querySelector('#email') as HTMLInputElement;
  const passwordInput = input.container.querySelector('#password') as HTMLInputElement;
  const confirmPasswordInput = input.container.querySelector('#confirmPassword') as HTMLInputElement;
  const form = input.container.querySelector('form');

  await act(async () => {
    fullNameInput.value = input.fullName;
    fullNameInput.dispatchEvent(new Event('input', { bubbles: true }));
    emailInput.value = input.email;
    emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    passwordInput.value = input.password;
    passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
    confirmPasswordInput.value = input.confirmPassword;
    confirmPasswordInput.dispatchEvent(new Event('input', { bubbles: true }));

    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

describe('SignupForm auth payload', () => {
  beforeAll(() => {
    vi.stubGlobal('React', ReactNamespace);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  });

  beforeEach(() => {
    signupWithWorkflowEngineMock.mockReset();
    signupWithWorkflowEngineMock.mockResolvedValue({ user: { id: 'u1' } });
    pushMock.mockReset();
    refreshMock.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('does not send empty agencyName for invitation signup', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<SignupForm invitationToken="invite-token-123" />);
    });

    await fillAndSubmitSignupForm({
      container,
      fullName: 'Invited User',
      email: 'invitee@example.com',
      password: 'StrongPass1!',
      confirmPassword: 'StrongPass1!'
    });

    expect(signupWithWorkflowEngineMock).toHaveBeenCalledTimes(1);
    const payload = signupWithWorkflowEngineMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.invitationToken).toBe('invite-token-123');
    expect(payload).not.toHaveProperty('agencyName');

    await act(async () => {
      root.unmount();
    });
  });

});
