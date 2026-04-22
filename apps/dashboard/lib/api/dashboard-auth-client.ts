import { workflowEngineFetch } from './workflow-engine-client';

export interface DashboardUser {
  id: string;
  email: string;
  fullName: string;
  agencyId: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  email: string;
  password: string;
  fullName: string;
  agencyName?: string;
  invitationToken?: string;
}

export interface SessionResponse {
  user: DashboardUser;
}

export async function loginWithWorkflowEngine(credentials: LoginRequest): Promise<{ user: DashboardUser }> {
  return workflowEngineFetch<{ user: DashboardUser }>('/api/v1/dashboard-auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export async function signupWithWorkflowEngine(data: SignupRequest): Promise<{ user: DashboardUser }> {
  return workflowEngineFetch<{ user: DashboardUser }>('/api/v1/dashboard-auth/signup', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function logoutFromWorkflowEngine(): Promise<{ ok: true }> {
  return workflowEngineFetch<{ ok: true }>('/api/v1/dashboard-auth/logout', {
    method: 'POST',
  });
}

export async function getWorkflowEngineSession(): Promise<SessionResponse> {
  return workflowEngineFetch<SessionResponse>('/api/v1/dashboard-auth/session');
}
